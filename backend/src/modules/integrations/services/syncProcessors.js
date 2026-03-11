import db from "../../../config/database.js";
import redis from "../../../config/redis.js";
import { getIikoClientOrNull, getIntegrationSettings, getPremiumBonusClientOrNull } from "./integrationConfigService.js";
import { IIKO_STATUS_MAP_TO_LOCAL, INTEGRATION_MODULE, INTEGRATION_TYPE, MAX_SYNC_ATTEMPTS, SYNC_STATUS } from "../constants.js";
import { finishIntegrationEvent, logIntegrationEvent, startIntegrationEvent } from "./integrationLoggerService.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";
import { decryptEmail } from "../../../utils/encryption.js";

function nextSyncState(attempts) {
  if (attempts >= MAX_SYNC_ATTEMPTS) return SYNC_STATUS.FAILED;
  return SYNC_STATUS.ERROR;
}

function extractPremiumBonusClientId(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.client_id || payload.clientId || payload.id || payload?.buyer?.client_id || null;
}

function isPremiumBonusBuyerFound(info) {
  if (!info || typeof info !== "object") return false;
  if (info.success === false) return false;
  if (info.is_registered === true) return true;
  if (extractPremiumBonusClientId(info)) return true;
  return false;
}

function isBuyerNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  if (status === 404) return true;
  if (status === 400 && (message.includes("не найден") || message.includes("not found"))) return true;
  return false;
}

function isPhoneAndExternalIdConflictError(error) {
  const message = String(error?.message || error?.error_description || error?.error || "").toLowerCase();
  return (
    message.includes("нельзя указать телефон и внешний идентификатор одновременно") ||
    (message.includes("phone") && message.includes("external") && message.includes("simultaneously"))
  );
}

function assertPremiumBonusProfileSuccess(response, fallbackMessage) {
  if (response?.success === false) {
    throw new Error(response?.error_description || response?.error || fallbackMessage);
  }
}

function parseGroupPercent(rawName) {
  const source = String(rawName || "")
    .trim()
    .replace(",", ".");
  if (!source) return null;
  const match = source.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function normalizePhoneForPremiumBonus(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function normalizeBonusAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return Math.ceil(parsed);
  return Math.floor(parsed);
}

function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

function resolvePriceAmount(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return toNumberOrNull(value.price ?? value.value ?? value.amount);
  }
  return toNumberOrNull(value);
}

function resolveIikoPriceFromRows(rows = [], preferredOrganizationIds = []) {
  const normalizedRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
  if (normalizedRows.length === 0) return null;

  const normalizedPreferredIds = preferredOrganizationIds.map((id) => String(id || "").trim()).filter(Boolean);
  for (const organizationId of normalizedPreferredIds) {
    const matchedRow = normalizedRows.find((row) => {
      const rowOrganizationId = String(row.organizationId || row.organization_id || "").trim();
      return rowOrganizationId && rowOrganizationId === organizationId;
    });
    const matchedPrice = resolvePriceAmount(matchedRow);
    if (matchedPrice !== null) return matchedPrice;
  }

  for (const row of normalizedRows) {
    const price = resolvePriceAmount(row);
    if (price !== null) return price;
  }

  return null;
}

function parsePbBalance(info) {
  if (!info || typeof info !== "object") return 0;
  const direct = Number(info.balance);
  if (Number.isFinite(direct)) return normalizeBonusAmount(direct);
  const accumulated = Number(info.balance_bonus_accumulated || 0);
  const present = Number(info.balance_bonus_present || 0);
  const action = Number(info.balance_bonus_action || 0);
  const total = accumulated + present + action;
  return Number.isFinite(total) ? normalizeBonusAmount(total) : 0;
}

function mapOrderStatusToPremiumBonusStatus(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (["completed", "ready", "delivering", "confirmed", "preparing"].includes(normalized)) {
    return "approved";
  }
  return "not_approved";
}

function mapOrderItemsToPremiumBonusPurchaseItems(items = [], options = {}) {
  const mappedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.item_price) || 0;
      const amount = Number(item?.subtotal);
      const resolvedAmount = Number.isFinite(amount) ? amount : unitPrice * quantity;
      if (quantity <= 0 || resolvedAmount <= 0) return null;

      return {
        name: String(item?.item_name || "").trim() || "Позиция",
        external_item_id: String(item?.iiko_item_id || item?.item_id || "").trim() || undefined,
        amount: Number(resolvedAmount.toFixed(2)),
        quantity: Number(quantity.toFixed(3)),
        type: "product",
      };
    })
    .filter(Boolean);

  const deliveryCost = Number(options?.deliveryCost || 0);
  if (Number.isFinite(deliveryCost) && deliveryCost > 0) {
    mappedItems.push({
      name: "Доставка",
      external_item_id: String(options?.deliveryExternalId || "delivery").trim(),
      amount: Number(deliveryCost.toFixed(2)),
      quantity: 1,
      type: "product",
    });
  }

  return mappedItems;
}

function assertPremiumBonusSuccess(response, fallbackMessage) {
  if (response?.success === false) {
    const errorDescription = String(response?.error_description || response?.error || "").trim();
    throw new Error(errorDescription || fallbackMessage);
  }
}

async function resolveLocalLevelByPercent(percent) {
  if (!Number.isFinite(percent)) return null;
  const [rows] = await db.query(
    `SELECT id, name, earn_percentage
     FROM loyalty_levels
     WHERE is_enabled = 1 AND earn_percentage = ?
     LIMIT 1`,
    [Number(percent)],
  );
  if (!rows.length) return null;
  return rows[0];
}

async function resolveLocalLevelByPremiumBonusGroup({ groupId = "", groupName = "" } = {}) {
  const normalizedGroupId = String(groupId || "").trim();
  const normalizedGroupName = String(groupName || "").trim();

  if (normalizedGroupId) {
    const [rows] = await db.query(
      `SELECT id, name, earn_percentage
       FROM loyalty_levels
       WHERE is_enabled = 1
         AND pb_group_id = ?
       ORDER BY sort_order ASC, threshold_amount ASC, id ASC
       LIMIT 1`,
      [normalizedGroupId],
    );
    if (rows.length > 0) return rows[0];
  }

  if (normalizedGroupName) {
    const [rows] = await db.query(
      `SELECT id, name, earn_percentage
       FROM loyalty_levels
       WHERE is_enabled = 1
         AND (
           LOWER(TRIM(pb_group_name)) = LOWER(TRIM(?))
           OR LOWER(TRIM(name)) = LOWER(TRIM(?))
         )
       ORDER BY sort_order ASC, threshold_amount ASC, id ASC
       LIMIT 1`,
      [normalizedGroupName, normalizedGroupName],
    );
    if (rows.length > 0) return rows[0];
  }

  const percent = parseGroupPercent(normalizedGroupName);
  if (!Number.isFinite(percent)) return null;
  return resolveLocalLevelByPercent(percent);
}

export async function markOrderIikoSync(orderId, patch) {
  const { status, error = null, attempts = null, iikoOrderId = null } = patch;
  await db.query(
    `UPDATE orders
     SET iiko_sync_status = ?,
         iiko_sync_error = ?,
         iiko_sync_attempts = COALESCE(?, iiko_sync_attempts),
         iiko_order_id = COALESCE(?, iiko_order_id),
         iiko_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, iikoOrderId, orderId],
  );
}

export async function markOrderPbSync(orderId, patch) {
  const { status, error = null, attempts = null, purchaseId = null } = patch;
  await db.query(
    `UPDATE orders
     SET pb_sync_status = ?,
         pb_sync_error = ?,
         pb_sync_attempts = COALESCE(?, pb_sync_attempts),
         pb_purchase_id = COALESCE(?, pb_purchase_id),
         pb_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, purchaseId, orderId],
  );
}

export async function markUserPbSync(userId, patch) {
  const { status, error = null, attempts = null, pbClientId = null } = patch;
  await db.query(
    `UPDATE users
     SET pb_sync_status = ?,
         pb_sync_error = ?,
         pb_sync_attempts = COALESCE(?, pb_sync_attempts),
         pb_client_id = COALESCE(?, pb_client_id),
         pb_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, pbClientId, userId],
  );
}

async function loadOrderWithItems(orderId) {
  const [orders] = await db.query(
    `SELECT o.*,
            u.phone AS user_phone,
            c.name AS city_name,
            c.timezone AS city_timezone,
            b.iiko_organization_id AS branch_iiko_organization_id,
            b.iiko_terminal_group_id AS branch_iiko_terminal_group_id
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN cities c ON c.id = o.city_id
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.id = ?`,
    [orderId],
  );
  if (orders.length === 0) throw new Error("Заказ не найден");

  const order = orders[0];
  const [items] = await db.query(
    `SELECT oi.*,
            mi.iiko_item_id,
            iv.iiko_variant_id
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.item_id
     LEFT JOIN item_variants iv ON iv.id = oi.variant_id
     WHERE oi.order_id = ?`,
    [orderId],
  );

  const orderItemIds = items.map((item) => Number(item.id)).filter(Number.isFinite);
  if (orderItemIds.length === 0) {
    return { order, items };
  }

  const placeholders = orderItemIds.map(() => "?").join(",");
  const [modifierRows] = await db.query(
    `SELECT oim.order_item_id,
            oim.modifier_id,
            oim.modifier_name,
            oim.modifier_price,
            oim.modifier_weight,
            oim.modifier_weight_unit,
            m.iiko_modifier_id
     FROM order_item_modifiers oim
     LEFT JOIN modifiers m ON m.id = oim.modifier_id
     WHERE oim.order_item_id IN (${placeholders})`,
    orderItemIds,
  );

  const modifiersByOrderItemId = new Map();
  for (const row of modifierRows) {
    const itemId = Number(row.order_item_id);
    if (!Number.isFinite(itemId)) continue;
    if (!modifiersByOrderItemId.has(itemId)) {
      modifiersByOrderItemId.set(itemId, []);
    }
    modifiersByOrderItemId.get(itemId).push(row);
  }

  const itemsWithModifiers = items.map((item) => ({
    ...item,
    modifiers: modifiersByOrderItemId.get(Number(item.id)) || [],
  }));

  return { order, items: itemsWithModifiers };
}

const DEFAULT_ORDER_SERVICE_TYPE_BY_LOCAL_TYPE = {
  delivery: "DeliveryByCourier",
  pickup: "DeliveryByClient",
};
const ALLOWED_ORDER_SERVICE_TYPES = new Set(["DeliveryByCourier", "DeliveryByClient"]);

const DEFAULT_PAYMENT_KIND_BY_LOCAL_METHOD = {
  cash: "Cash",
  card: "Card",
};
const COMMAND_STATUS_POLL_ATTEMPTS = 4;
const COMMAND_STATUS_POLL_DELAY_MS = 1500;
const ORDER_PRESENCE_POLL_ATTEMPTS = 3;
const ORDER_PRESENCE_POLL_DELAY_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseDesiredTime(rawValue, userTimezoneOffset) {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  if (hasTimezone) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = value.replace("T", " ");
  const localMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hours = Number(localMatch[4]);
    const minutes = Number(localMatch[5]);
    const seconds = Number(localMatch[6] || 0);
    const offsetMinutes = Number.isFinite(Number(userTimezoneOffset)) ? Number(userTimezoneOffset) : 0;
    const utcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, seconds, 0) + offsetMinutes * 60 * 1000;
    const parsed = new Date(utcTimestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDateTimeForIiko(date, timezone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const targetTimezone = String(timezone || "").trim();
  if (!targetTimezone) return null;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: targetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    fractionalSecondDigits: 3,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const second = getPart("second");
  const fraction = getPart("fractionalSecond") || "000";
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${fraction}`;
}

function resolveCompleteBefore(order) {
  const desired = parseDesiredTime(order?.desired_time, order?.user_timezone_offset);
  if (!desired) return null;
  return formatDateTimeForIiko(desired, order?.city_timezone);
}

function resolveDeliveryPoint(order) {
  const isDelivery = String(order?.order_type || "").trim().toLowerCase() === "delivery";
  if (!isDelivery) return null;

  const street = String(order?.delivery_street || "").trim();
  const house = String(order?.delivery_house || "").trim();
  if (!street || !house) return null;

  const address = {
    type: "legacy",
    street: {
      name: street,
      ...(order?.city_name ? { city: String(order.city_name).trim() } : {}),
    },
    house,
  };

  const entrance = String(order?.delivery_entrance || "").trim();
  const floor = String(order?.delivery_floor || "").trim();
  const apartment = String(order?.delivery_apartment || "").trim();
  const intercom = String(order?.delivery_intercom || "").trim();
  if (entrance) address.entrance = entrance;
  if (floor) address.floor = floor;
  if (apartment) address.flat = apartment;
  if (intercom) address.doorphone = intercom;

  const latitude = Number(order?.delivery_latitude);
  const longitude = Number(order?.delivery_longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  return {
    address,
    ...(hasCoordinates
      ? {
          coordinates: {
            latitude,
            longitude,
          },
        }
      : {}),
  };
}

function resolveOrderTypePayload(orderType, settings) {
  const localOrderType = String(orderType || "").trim().toLowerCase();
  const mapping = settings?.iikoOrderTypeMapping?.[localOrderType] || {};
  const mappedOrderTypeId = String(mapping.orderTypeId || "").trim();
  const mappedOrderServiceType = String(mapping.orderServiceType || "").trim();
  const fallbackOrderServiceType = DEFAULT_ORDER_SERVICE_TYPE_BY_LOCAL_TYPE[localOrderType] || "DeliveryByCourier";

  if (mappedOrderTypeId) {
    return { orderTypeId: mappedOrderTypeId };
  }

  return {
    orderServiceType: ALLOWED_ORDER_SERVICE_TYPES.has(mappedOrderServiceType) ? mappedOrderServiceType : fallbackOrderServiceType,
  };
}

function resolveCommentWithCashChange(order) {
  const baseComment = String(order?.comment || "").trim();
  const paymentMethod = String(order?.payment_method || "")
    .trim()
    .toLowerCase();
  if (paymentMethod !== "cash") {
    return baseComment || null;
  }

  const changeFrom = Number(order?.change_from);
  const cashLine = Number.isFinite(changeFrom) && changeFrom > 0 ? `Сдача с: ${changeFrom}` : "Без сдачи";

  if (!baseComment) return cashLine;
  return `${baseComment}\n${cashLine}`;
}

function resolvePaymentPayload(order, settings, terminalGroupId) {
  const localPaymentMethod = String(order?.payment_method || "").trim().toLowerCase();
  const mapping = settings?.iikoPaymentTypeMapping?.[localPaymentMethod] || {};
  const paymentTypeId = String(mapping.paymentTypeId || "").trim();
  if (!paymentTypeId) return null;

  const sum = Number(order?.total);
  if (!Number.isFinite(sum) || sum < 0) {
    return null;
  }

  const paymentTypeKind = String(mapping.paymentTypeKind || "").trim() || DEFAULT_PAYMENT_KIND_BY_LOCAL_METHOD[localPaymentMethod] || "Cash";
  const paymentProcessingType = String(mapping.paymentProcessingType || "").trim().toLowerCase();
  const mappedTerminalGroups = Array.isArray(mapping.terminalGroupIds) ? mapping.terminalGroupIds : [];

  if (mappedTerminalGroups.length > 0 && terminalGroupId && !mappedTerminalGroups.includes(terminalGroupId)) {
    throw new Error("Выбранный тип оплаты iiko недоступен для terminal group филиала");
  }

  let isProcessedExternally = mapping.isProcessedExternally === true;
  if (paymentProcessingType === "external" && !isProcessedExternally) {
    isProcessedExternally = true;
  }
  if (paymentProcessingType === "internal" && isProcessedExternally) {
    throw new Error("Тип оплаты iiko поддерживает только внутреннюю обработку, external-флаг недопустим");
  }

  const payments = [
    {
      paymentTypeKind,
      paymentTypeId,
      sum,
      isProcessedExternally,
    },
  ];

  // Отдельная передача списанных бонусов в iiko через дополнительный тип оплаты "bonus".
  // Используется как fallback, если не настроена скидка iikoBonusDiscountTypeId.
  const hasBonusDiscountType = String(settings?.iikoBonusDiscountTypeId || "").trim().length > 0;
  const bonusSpent = Number(order?.bonus_spent);
  const normalizedBonusSpent = Number.isFinite(bonusSpent) ? Number(bonusSpent.toFixed(2)) : 0;
  if (normalizedBonusSpent > 0 && !hasBonusDiscountType) {
    const bonusMapping = settings?.iikoPaymentTypeMapping?.bonus || {};
    const bonusPaymentTypeId = String(bonusMapping.paymentTypeId || "").trim();
    if (bonusPaymentTypeId) {
      const bonusPaymentTypeKind = String(bonusMapping.paymentTypeKind || "").trim() || "Card";
      const bonusProcessingType = String(bonusMapping.paymentProcessingType || "").trim().toLowerCase();
      const bonusMappedTerminalGroups = Array.isArray(bonusMapping.terminalGroupIds) ? bonusMapping.terminalGroupIds : [];

      if (bonusMappedTerminalGroups.length > 0 && terminalGroupId && !bonusMappedTerminalGroups.includes(terminalGroupId)) {
        throw new Error("Бонусный тип оплаты iiko недоступен для terminal group филиала");
      }

      let bonusIsProcessedExternally = bonusMapping.isProcessedExternally === true;
      if (bonusProcessingType === "external" && !bonusIsProcessedExternally) {
        bonusIsProcessedExternally = true;
      }
      if (bonusProcessingType === "internal" && bonusIsProcessedExternally) {
        throw new Error("Бонусный тип оплаты iiko поддерживает только внутреннюю обработку, external-флаг недопустим");
      }

      payments.push({
        paymentTypeKind: bonusPaymentTypeKind,
        paymentTypeId: bonusPaymentTypeId,
        sum: normalizedBonusSpent,
        isProcessedExternally: bonusIsProcessedExternally,
      });
    }
  }

  return payments;
}

function resolveDiscountsInfoPayload(order, settings) {
  const discountTypeId = String(settings?.iikoBonusDiscountTypeId || "").trim();
  if (!discountTypeId) return null;

  const bonusSpent = Number(order?.bonus_spent);
  const normalizedBonusSpent = Number.isFinite(bonusSpent) ? Number(bonusSpent.toFixed(2)) : 0;
  if (normalizedBonusSpent <= 0) return null;

  return [
    {
      discounts: [
        {
          discountTypeId,
          sum: normalizedBonusSpent,
          type: "RMS",
        },
      ],
    },
  ];
}

async function isOrderPresentInIiko(client, organizationId, iikoOrderId) {
  if (!iikoOrderId) return false;
  const response = await client.getOrderStatus({
    organizationId,
    orderIds: [iikoOrderId],
  });
  const orders = Array.isArray(response?.orders) ? response.orders : [];
  return orders.some((row) => String(row?.id || "").trim() === String(iikoOrderId).trim());
}

async function waitForCommandCompletion(client, organizationId, correlationId) {
  const normalizedCorrelationId = String(correlationId || "").trim();
  if (!normalizedCorrelationId) {
    return { state: "unknown" };
  }

  for (let attempt = 0; attempt < COMMAND_STATUS_POLL_ATTEMPTS; attempt += 1) {
    const statusPayload = await client.getCommandStatus({
      organizationId,
      correlationId: normalizedCorrelationId,
    });
    const state = String(statusPayload?.state || "").trim().toLowerCase();
    if (state === "success") return { state: "success" };
    if (state === "error") {
      const reason = statusPayload?.errorReason || statusPayload?.exception || "Команда завершилась ошибкой";
      throw new Error(`iiko commands/status: ${String(reason)}`);
    }
    if (attempt < COMMAND_STATUS_POLL_ATTEMPTS - 1) {
      await sleep(COMMAND_STATUS_POLL_DELAY_MS);
    }
  }

  return { state: "inprogress" };
}

export async function processIikoOrderSync(orderId, source = "queue") {
  const startedAt = Date.now();
  const integrationSettings = await getIntegrationSettings();
  if (!integrationSettings.iikoEnabled || integrationSettings?.integrationMode?.orders !== "external") {
    await markOrderIikoSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
    });
    return { skipped: true, reason: "Режим заказов local" };
  }

  const { order, items } = await loadOrderWithItems(orderId);

  const client = await getIikoClientOrNull();
  if (!client) {
    throw new Error("Клиент iiko недоступен");
  }

  const nextAttempts = (Number(order.iiko_sync_attempts) || 0) + 1;
  let createdIikoOrderId = String(order.iiko_order_id || "").trim() || null;

  try {
    const normalizePhone = (rawPhone) => {
      const trimmed = String(rawPhone || "").trim();
      if (!trimmed) return "";
      const digits = trimmed.replace(/[^\d]/g, "");
      if (!digits) return "";
      return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
    };

    const extractProductSizeId = (externalVariantId) => {
      const value = String(externalVariantId || "").trim();
      if (!value) return null;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(value)) return value;
      const splitByUnderscore = value.split("_");
      const lastPart = splitByUnderscore[splitByUnderscore.length - 1];
      if (uuidRegex.test(lastPart)) return lastPart;
      return null;
    };

    const phone = normalizePhone(order.user_phone);
    if (!phone) {
      throw new Error("Невозможно синхронизировать заказ в iiko: у пользователя отсутствует телефон");
    }
    const resolvedOrganizationId = String(order.branch_iiko_organization_id || integrationSettings.iikoOrganizationId || "").trim();
    const resolvedTerminalGroupId = String(order.branch_iiko_terminal_group_id || "").trim();
    if (!resolvedOrganizationId) {
      throw new Error("Невозможно синхронизировать заказ в iiko: для филиала не задан iiko_organization_id");
    }
    if (!resolvedTerminalGroupId) {
      throw new Error("Невозможно синхронизировать заказ в iiko: для филиала не задан iiko_terminal_group_id");
    }

    if (createdIikoOrderId) {
      const existsInIiko = await isOrderPresentInIiko(client, resolvedOrganizationId, createdIikoOrderId);
      if (existsInIiko) {
        await markOrderIikoSync(orderId, {
          status: SYNC_STATUS.SYNCED,
          error: null,
          attempts: nextAttempts,
          iikoOrderId: createdIikoOrderId,
        });
        return { synced: true, iikoOrderId: createdIikoOrderId, reused: true };
      }
      throw new Error("Заказ уже отправлен в iiko, но еще не подтвержден. Повторная отправка заблокирована до подтверждения");
    }

    const iikoItems = items
      .map((item) => {
        const productId = String(item.iiko_item_id || "").trim();
        if (!productId) return null;

        const itemModifiers = Array.isArray(item.modifiers)
          ? item.modifiers
              .map((modifier) => {
                const modifierProductId = String(modifier?.iiko_modifier_id || "").trim();
                if (!modifierProductId) return null;
                const modifierAmount = Number(modifier?.amount) || 1;
                const modifierPriceRaw = Number(modifier?.modifier_price);
                const modifierPayload = {
                  productId: modifierProductId,
                  amount: modifierAmount,
                };

                if (Number.isFinite(modifierPriceRaw)) {
                  modifierPayload.price = modifierPriceRaw;
                }

                return modifierPayload;
              })
              .filter(Boolean)
          : [];

        const payloadItem = {
          type: "Product",
          productId,
          amount: Number(item.quantity) || 1,
          price: Number(item.item_price) || 0,
          comment: item.variant_name || null,
          ...(itemModifiers.length > 0 ? { modifiers: itemModifiers } : {}),
        };

        const productSizeId = extractProductSizeId(item.iiko_variant_id);
        if (productSizeId) {
          payloadItem.productSizeId = productSizeId;
        }

        return payloadItem;
      })
      .filter(Boolean);

    if (iikoItems.length === 0) {
      throw new Error("Невозможно синхронизировать заказ в iiko: отсутствует маппинг iiko_item_id у позиций заказа");
    }

    const isDeliveryOrder = String(order.order_type || "").trim().toLowerCase() === "delivery";
    const deliveryCost = Number(order.delivery_cost);
    if (isDeliveryOrder && Number.isFinite(deliveryCost) && deliveryCost > 0) {
      const deliveryProductId = String(integrationSettings.iikoDeliveryProductId || "").trim();
      if (!deliveryProductId) {
        throw new Error(
          "Невозможно синхронизировать заказ в iiko: для платной доставки не задан iiko_delivery_product_id (сервисная позиция доставки)",
        );
      }
      iikoItems.push({
        type: "Product",
        productId: deliveryProductId,
        amount: 1,
        price: deliveryCost,
        comment: "Платная доставка",
      });
    }

    const resolvedOrderTypePayload = resolveOrderTypePayload(order.order_type, integrationSettings);
    const resolvedPayments = resolvePaymentPayload(order, integrationSettings, resolvedTerminalGroupId);
    const resolvedDiscountsInfo = resolveDiscountsInfoPayload(order, integrationSettings);
    const deliveryPoint = resolveDeliveryPoint(order);
    if (String(order.order_type || "").trim().toLowerCase() === "delivery" && !deliveryPoint) {
      throw new Error("Невозможно синхронизировать заказ в iiko: отсутствует корректный deliveryPoint для доставки");
    }
    const completeBefore = resolveCompleteBefore(order);

    const payload = {
      organizationId: resolvedOrganizationId,
      terminalGroupId: resolvedTerminalGroupId,
      order: {
        externalNumber: String(order.order_number || order.id),
        phone,
        ...resolvedOrderTypePayload,
        ...(completeBefore ? { completeBefore } : {}),
        ...(deliveryPoint ? { deliveryPoint } : {}),
        comment: resolveCommentWithCashChange(order),
        sourceKey: "foodminiapp",
        items: iikoItems,
        ...(resolvedPayments ? { payments: resolvedPayments } : {}),
        ...(resolvedDiscountsInfo ? { discountsInfo: resolvedDiscountsInfo } : {}),
      },
    };

    const response = await client.createOrder(payload);
    const orderInfo = response?.orderInfo && typeof response.orderInfo === "object" ? response.orderInfo : null;
    const correlationId = String(response?.correlationId || "").trim();
    const creationStatus = String(orderInfo?.creationStatus || response?.creationStatus || "Success")
      .trim()
      .toLowerCase();
    createdIikoOrderId = String(orderInfo?.id || response?.orderId || response?.id || "").trim() || null;

    if (!createdIikoOrderId) {
      throw new Error("iiko не вернул id заказа (orderInfo.id)");
    }

    if (creationStatus === "error") {
      const errorDetails = orderInfo?.errorInfo?.message || orderInfo?.errorInfo?.code || "Ошибка создания заказа в iiko";
      throw new Error(`iiko creationStatus=Error: ${String(errorDetails)}`);
    }

    if (creationStatus === "inprogress") {
      await waitForCommandCompletion(client, resolvedOrganizationId, correlationId);
      let visible = false;
      for (let attempt = 0; attempt < ORDER_PRESENCE_POLL_ATTEMPTS; attempt += 1) {
        visible = await isOrderPresentInIiko(client, resolvedOrganizationId, createdIikoOrderId);
        if (visible) break;
        if (attempt < ORDER_PRESENCE_POLL_ATTEMPTS - 1) {
          await sleep(ORDER_PRESENCE_POLL_DELAY_MS);
        }
      }
      if (!visible) {
        throw new Error("Создание заказа в iiko еще не завершено. Заказ сохранен с ожиданием подтверждения");
      }
    }

    await markOrderIikoSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      iikoOrderId: createdIikoOrderId,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.ORDERS,
      action: "create_order",
      status: "success",
      entityType: "order",
      entityId: orderId,
      requestData: payload,
      responseData: response,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    return { synced: true, iikoOrderId: createdIikoOrderId };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markOrderIikoSync(orderId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
      iikoOrderId: createdIikoOrderId,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.ORDERS,
      action: "create_order",
      status: "failed",
      entityType: "order",
      entityId: orderId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

export async function processPremiumBonusClientSync(userId, source = "queue") {
  const startedAt = Date.now();
  const integrationSettings = await getIntegrationSettings();
  const isExternalLoyaltyMode =
    String(integrationSettings?.integrationMode?.loyalty || "local")
      .trim()
      .toLowerCase() === "external";
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
  if (users.length === 0) throw new Error("Пользователь не найден");

  const user = users[0];
  const nextAttempts = (Number(user.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    if (!user.phone) {
      throw new Error("У пользователя отсутствует телефон для синхронизации с PremiumBonus");
    }

    const normalizedExternalId = String(user.pb_external_id || "").trim() || `foodminiapp_user_${user.id}`;
    if (!String(user.pb_external_id || "").trim()) {
      await db.query("UPDATE users SET pb_external_id = ? WHERE id = ?", [normalizedExternalId, userId]);
    }

    const normalizedPhone = normalizePhoneForPremiumBonus(user.phone);
    if (!normalizedPhone || normalizedPhone.length < 11) {
      throw new Error("У пользователя отсутствует корректный телефон для синхронизации с PremiumBonus");
    }
    const normalizedStoredPbClientId = String(user.pb_client_id || "").trim() || null;
    const isProfileSource = source === "profile-update" || source === "profile-get";
    if (!normalizedStoredPbClientId && isProfileSource) {
      throw new Error("Автопривязка PremiumBonus по телефону запрещена для обновления/просмотра профиля");
    }

    const email = user.email ? decryptEmail(user.email) : null;
    const baseProfilePayload = {
      phone: normalizedPhone,
      external_id: normalizedExternalId,
      name: user.first_name || undefined,
      surname: user.last_name || undefined,
      birth_date: user.date_of_birth || undefined,
      email: email || undefined,
    };

    const sendProfilePayloadWithFallback = async (mode) => {
      const method = mode === "edit" ? "editBuyer" : "registerBuyer";
      const fallbackMessage =
        mode === "edit" ? "PremiumBonus вернул ошибку при синхронизации покупателя" : "PremiumBonus вернул ошибку при регистрации покупателя";

      try {
        const response = await client[method](baseProfilePayload);
        assertPremiumBonusProfileSuccess(response, fallbackMessage);
        return response;
      } catch (error) {
        if (!isPhoneAndExternalIdConflictError(error)) {
          throw error;
        }

        const retryPayload = {
          ...baseProfilePayload,
        };
        delete retryPayload.external_id;
        const retryResponse = await client[method](retryPayload);
        assertPremiumBonusProfileSuccess(retryResponse, fallbackMessage);
        return retryResponse;
      }
    };

    let info = null;
    try {
      info = await client.buyerInfo({ identificator: normalizedStoredPbClientId || normalizedPhone });
    } catch (error) {
      if (!isBuyerNotFoundError(error)) {
        throw error;
      }
    }

    let pbClientId = normalizedStoredPbClientId || extractPremiumBonusClientId(info) || null;
    let responsePayload = info;
    const buyerFound = isPremiumBonusBuyerFound(info);

    if (buyerFound) {
      responsePayload = await sendProfilePayloadWithFallback("edit");
      pbClientId = pbClientId || extractPremiumBonusClientId(responsePayload);
    } else {
      const registration = await sendProfilePayloadWithFallback("register");
      pbClientId = pbClientId || extractPremiumBonusClientId(registration);
      responsePayload = registration;
    }

    let effectiveInfo = null;
    try {
      effectiveInfo = await client.buyerInfo({ identificator: pbClientId || normalizedPhone });
    } catch (refreshError) {
      effectiveInfo = info;
    }

    const pbBalance = parsePbBalance(effectiveInfo);
    const localBalance = Number(user.loyalty_balance || 0);
    const pbLevelPercent = parseGroupPercent(effectiveInfo?.group_name);

    if (isExternalLoyaltyMode) {
      if (Number.isFinite(pbBalance) && pbBalance !== localBalance) {
        await db.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [pbBalance, userId]);
      }

      if (Number.isFinite(pbLevelPercent) || effectiveInfo?.group_id || effectiveInfo?.group_name) {
        const targetLocalLevel = await resolveLocalLevelByPremiumBonusGroup({
          groupId: effectiveInfo?.group_id,
          groupName: effectiveInfo?.group_name,
        });
        if (targetLocalLevel?.id && Number(targetLocalLevel.id) !== Number(user.current_loyalty_level_id || 0)) {
          await db.query("UPDATE users SET current_loyalty_level_id = ? WHERE id = ?", [targetLocalLevel.id, userId]);
        }
      }
    }

    await markUserPbSync(userId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      pbClientId,
    });

    await db.query("UPDATE users SET loyalty_mode = 'premiumbonus' WHERE id = ?", [userId]);

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.CLIENTS,
      action: "sync_client",
      status: "success",
      entityType: "user",
      entityId: userId,
      responseData: responsePayload,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    return { synced: true, pbClientId };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markUserPbSync(userId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.CLIENTS,
      action: "sync_client",
      status: "failed",
      entityType: "user",
      entityId: userId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

export async function processPremiumBonusPurchaseSync(orderId, action = "create", source = "queue") {
  const startedAt = Date.now();
  const { order, items } = await loadOrderWithItems(orderId);
  const integrationSettings = await getIntegrationSettings();
  const isExternalLoyaltyMode =
    String(integrationSettings?.integrationMode?.loyalty || "local")
      .trim()
      .toLowerCase() === "external";
  const [users] = await db.query("SELECT id, phone, pb_client_id, loyalty_balance, current_loyalty_level_id FROM users WHERE id = ?", [
    order.user_id,
  ]);
  if (users.length === 0) throw new Error("Пользователь заказа не найден");

  const user = users[0];
  const nextAttempts = (Number(order.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    const normalizedPhone = normalizePhoneForPremiumBonus(user.phone);
    const customerIdentificator = user.pb_client_id || normalizedPhone;
    if (!customerIdentificator) {
      throw new Error("У пользователя заказа отсутствует идентификатор для PremiumBonus");
    }
    let response;
    const payloadBase = {
      external_purchase_id: String(order.id),
      identificator: customerIdentificator,
      phone: normalizedPhone || undefined,
      write_off_bonus: normalizeBonusAmount(order.bonus_spent),
      items: mapOrderItemsToPremiumBonusPurchaseItems(items, { deliveryCost: Number(order.delivery_cost || 0) }),
      purchase_status: mapOrderStatusToPremiumBonusStatus(order.status),
    };
    if (payloadBase.items.length === 0) {
      throw new Error("Невозможно синхронизировать покупку PremiumBonus: пустой состав заказа");
    }
    let requestPayload = payloadBase;

    if (action === "create") {
      response = await client.createPurchase(payloadBase);
      assertPremiumBonusSuccess(response, "PremiumBonus вернул ошибку при создании покупки");
    } else if (action === "status") {
      requestPayload = {
        purchase_id: order.pb_purchase_id || undefined,
        external_purchase_id: String(order.id),
        purchase_status: mapOrderStatusToPremiumBonusStatus(order.status),
      };
      try {
        response = await client.changePurchaseStatus(requestPayload);
        assertPremiumBonusSuccess(response, "PremiumBonus вернул ошибку при обновлении статуса покупки");
      } catch (statusError) {
        // Fallback: некоторые конфигурации PB не проводят change-status без карты.
        response = await client.createPurchase(payloadBase);
        assertPremiumBonusSuccess(response, "PremiumBonus вернул ошибку при fallback-создании покупки");
        requestPayload = payloadBase;
      }
    } else if (action === "cancel") {
      requestPayload = {
        purchase_id: order.pb_purchase_id || undefined,
        external_purchase_id: String(order.id),
      };
      response = await client.cancelPurchase(requestPayload);
      assertPremiumBonusSuccess(response, "PremiumBonus вернул ошибку при отмене покупки");
    } else {
      throw new Error("Неизвестное действие синхронизации покупки");
    }

    if (isExternalLoyaltyMode) {
      try {
        const refreshedInfo = await client.buyerInfo({ identificator: customerIdentificator });
        const refreshedBalance = parsePbBalance(refreshedInfo);
        const refreshedGroupPercent = parseGroupPercent(refreshedInfo?.group_name);

        if (Number.isFinite(refreshedBalance) && refreshedBalance !== Number(user.loyalty_balance || 0)) {
          await db.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [refreshedBalance, user.id]);
        }

        if (Number.isFinite(refreshedGroupPercent) || refreshedInfo?.group_id || refreshedInfo?.group_name) {
          const targetLocalLevel = await resolveLocalLevelByPremiumBonusGroup({
            groupId: refreshedInfo?.group_id,
            groupName: refreshedInfo?.group_name,
          });
          if (targetLocalLevel?.id && Number(targetLocalLevel.id) !== Number(user.current_loyalty_level_id || 0)) {
            await db.query("UPDATE users SET current_loyalty_level_id = ? WHERE id = ?", [targetLocalLevel.id, user.id]);
          }
        }
      } catch (refreshError) {
        // Не блокируем sync покупки, если не удалось сразу обновить локальное зеркало баланса/уровня.
      }
    }

    await markOrderPbSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      purchaseId: response?.purchase_id || response?.id || order.pb_purchase_id || null,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.PURCHASES,
      action: `purchase_${action}`,
      status: "success",
      entityType: "order",
      entityId: orderId,
      requestData: requestPayload,
      responseData: response,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    return { synced: true };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markOrderPbSync(orderId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.PURCHASES,
      action: `purchase_${action}`,
      status: "failed",
      entityType: "order",
      entityId: orderId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  if (typeof value === "object") {
    const nested = Number(
      value.currentPrice ??
        value.current_price ??
        value.price ??
        value.value ??
        value.amount ??
        value.valueWithoutVat ??
        value.value_without_vat ??
        NaN,
    );
    if (Number.isFinite(nested)) return nested;
  }

  return null;
}

function normalizeWeightUnit(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  if (["g", "гр", "г", "gram", "grams", "грамм", "граммы", "measureunittype.gram"].includes(raw)) return "g";
  if (["kg", "кг", "kilogram", "kilograms", "measureunittype.kilogram"].includes(raw)) return "kg";
  if (["ml", "мл", "milliliter", "milliliters", "measureunittype.milliliter"].includes(raw)) return "ml";
  if (["l", "л", "liter", "liters", "measureunittype.liter"].includes(raw)) return "l";
  if (["pcs", "шт", "шт.", "piece", "pieces", "measureunittype.piece"].includes(raw)) return "pcs";

  return null;
}

function normalizeWeightValue(value, unit = null) {
  const numeric = toNumberOrNull(value);
  if (numeric === null) return null;
  if (unit === "g" || unit === "ml") return Math.round(numeric);
  return Number(numeric.toFixed(3));
}

function calcServingNutrition(per100Value, weightGrams) {
  const p100 = toNumberOrNull(per100Value);
  const weight = toNumberOrNull(weightGrams);
  if (p100 === null || weight === null) return null;
  return Number(((p100 * weight) / 100).toFixed(2));
}

function normalizeModifierGroupType(restrictions = {}) {
  const minQuantity = Number(restrictions?.minQuantity ?? 0);
  const maxQuantity = Number(restrictions?.maxQuantity ?? 1);
  if (Number.isFinite(maxQuantity) && maxQuantity > 1) return "multiple";
  if (Number.isFinite(minQuantity) && minQuantity > 1) return "multiple";
  return "single";
}

function normalizeModifierGroupSelections(restrictions = {}) {
  const minRaw = Number(restrictions?.minQuantity ?? 0);
  const maxRaw = Number(restrictions?.maxQuantity ?? 1);
  const minSelections = Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : 0;
  const maxSelections = Number.isFinite(maxRaw) && maxRaw >= minSelections ? maxRaw : Math.max(1, minSelections);
  return { minSelections, maxSelections };
}

function extractModifierPrice(value = {}) {
  const direct = toNumberOrNull(value?.price);
  if (direct !== null) return direct;
  const prices = Array.isArray(value?.prices) ? value.prices : [];
  if (prices.length === 0) return 0;
  return toNumberOrNull(prices[0]?.price) ?? 0;
}

function resolveImageUrl(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return first ? first.trim() : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object") {
    if (typeof value.href === "string" && value.href.trim()) return value.href.trim();
    if (typeof value.url === "string" && value.url.trim()) return value.url.trim();
  }
  return null;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeDisplayName(value, fallback = "") {
  const source = String(value || fallback || "").trim();
  if (!source) return "";
  const lowered = source.toLocaleLowerCase("ru-RU");
  return `${lowered.charAt(0).toLocaleUpperCase("ru-RU")}${lowered.slice(1)}`;
}

function normalizeIikoId(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function invalidatePublicMenuCache() {
  try {
    const keys = await redis.keys("menu:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    // Не критично для завершения sync: данные уже записаны в БД.
  }
}

function extractIikoItemCategoryIds(item = {}) {
  const ids = new Set();
  const add = (value) => {
    const normalized = normalizeIikoId(value);
    if (normalized) ids.add(normalized);
  };

  add(item.parentGroup);
  add(item.parentGroupId);
  add(item.parent_group);
  add(item.groupId);
  add(item.group_id);
  add(item.categoryId);
  add(item.category_id);
  add(item.productCategoryId);
  add(item.product_category_id);
  add(item.iikoGroupId);
  add(item.iiko_group_id);
  add(item.productGroupId);
  add(item.product_group_id);

  if (Array.isArray(item.groups)) {
    for (const group of item.groups) {
      if (typeof group === "object") {
        add(group.id || group.groupId || group.group_id);
      } else {
        add(group);
      }
    }
  }

  if (Array.isArray(item.groupIds)) {
    for (const groupId of item.groupIds) add(groupId);
  }

  if (Array.isArray(item.parentGroups)) {
    for (const parentGroup of item.parentGroups) {
      if (typeof parentGroup === "object") {
        add(parentGroup.id || parentGroup.groupId || parentGroup.group_id);
      } else {
        add(parentGroup);
      }
    }
  }

  return [...ids];
}

export async function processIikoMenuSync(reason = "manual", cityId = null) {
  const client = await getIikoClientOrNull();
  if (!client) throw new Error("Клиент iiko недоступен");
  const integrationSettings = await getIntegrationSettings();
  const selectedCategoryIds = new Set((integrationSettings.iikoSyncCategoryIds || []).map((id) => String(id).trim()).filter(Boolean));
  const useCategoryFilter = selectedCategoryIds.size > 0;
  const externalMenuId = String(integrationSettings.iikoExternalMenuId || "").trim();
  const priceCategoryId = String(integrationSettings.iikoPriceCategoryId || "").trim();
  const preserveLocalNames = integrationSettings.iikoPreserveLocalNames !== false;
  const useExternalMenuFilter = Boolean(externalMenuId);
  const requestedCityId = Number(cityId);
  const isCityScopedSync = Number.isFinite(requestedCityId) && requestedCityId > 0;
  const canDeactivateMissingExternalItems = !isCityScopedSync;
  if (!useExternalMenuFilter) {
    throw new Error("Не выбран iiko_external_menu_id. Синхронизация меню выполняется через /api/2/menu/by_id.");
  }

  const startedAt = Date.now();
  const logId = await startIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.MENU,
    action: "sync_menu",
    requestData: { reason, cityId },
  });

  try {
    let externalMenuPayload = null;
    let externalMenuItemIds = new Set();
    const externalMenuCategoryIdsByItemId = new Map();
    let externalCategoriesRaw = [];
    let externalItemsRaw = [];

    externalMenuPayload = await client.getMenuById({
      externalMenuId,
      priceCategoryId: priceCategoryId || undefined,
      useConfiguredOrganization: false,
    });

    const menuCategories = Array.isArray(externalMenuPayload?.itemCategories) ? externalMenuPayload.itemCategories : [];
    externalCategoriesRaw = menuCategories.map((category, index) => ({
      id: normalizeIikoId(category?.id || category?.itemCategoryId || category?.iikoGroupId),
      name: firstNonEmptyString(category?.name, category?.title, category?.caption) || `Категория ${index + 1}`,
      sort_order: index,
      is_active: category?.isHidden ? 0 : 1,
      image_url: category?.buttonImageUrl || category?.headerImageUrl || null,
    }));

    const pickSizePrice = (size = {}) => {
      return resolveIikoPriceFromRows(size?.prices || []);
    };

    const allExternalMenuItemIds = new Set();
    const normalizedItemsById = new Map();
    const scopedItemIds = new Set();
    for (const category of menuCategories) {
    const externalCategoryId = normalizeIikoId(category?.id || category?.itemCategoryId || category?.iikoGroupId);
    const categoryItems = Array.isArray(category?.items) ? category.items : [];
    for (const menuItem of categoryItems) {
      const itemId = normalizeIikoId(menuItem?.itemId || menuItem?.id || menuItem?.productId);
      if (!itemId) continue;
      allExternalMenuItemIds.add(itemId);
      if (useCategoryFilter && externalCategoryId && !selectedCategoryIds.has(externalCategoryId)) {
        continue;
      }
      scopedItemIds.add(itemId);
      if (externalCategoryId) {
        if (!externalMenuCategoryIdsByItemId.has(itemId)) {
          externalMenuCategoryIdsByItemId.set(itemId, new Set());
        }
        externalMenuCategoryIdsByItemId.get(itemId).add(externalCategoryId);
      }

      if (normalizedItemsById.has(itemId)) continue;

      const itemSizes = Array.isArray(menuItem?.itemSizes) ? menuItem.itemSizes : [];
      const sizePrices = itemSizes.map((size, index) => {
        const sizeId = normalizeIikoId(size?.sizeId || size?.id || `size_${index + 1}`);
        const resolvedPrice = pickSizePrice(size);
        return {
          id: sizeId,
          sizeId,
          sizeName: firstNonEmptyString(size?.sizeName, size?.name, size?.code),
          price: resolvedPrice,
          priceValue: resolvedPrice,
          prices: Array.isArray(size?.prices) ? size.prices : [],
          is_active: size?.isHidden ? 0 : 1,
          image_url: size?.buttonImageUrl || null,
          portionWeight: toNumberOrNull(size?.portionWeightGrams),
          measureUnitType: size?.measureUnitType || null,
          nutritionalValues: size?.nutritionPerHundredGrams || null,
          itemModifierGroups: Array.isArray(size?.itemModifierGroups) ? size.itemModifierGroups : [],
          isDefault: Boolean(size?.isDefault),
        };
      });

      const primarySize = itemSizes[0] || null;

      normalizedItemsById.set(itemId, {
        id: itemId,
        itemId,
        name: menuItem?.name,
        description: menuItem?.description || null,
        composition: menuItem?.description || null,
        image_url: menuItem?.buttonImageUrl || itemSizes[0]?.buttonImageUrl || null,
        is_active: menuItem?.isHidden ? 0 : 1,
        orderItemType: menuItem?.orderItemType || menuItem?.type || "Product",
        type: menuItem?.type || menuItem?.orderItemType || "Product",
        measureUnit: menuItem?.measureUnit || primarySize?.measureUnitType || null,
        weight_unit: primarySize?.measureUnitType || menuItem?.measureUnit || null,
        productCategoryId: menuItem?.productCategoryId || externalCategoryId || null,
        groupIds: externalCategoryId ? [externalCategoryId] : [],
        sizePrices,
        weight: toNumberOrNull(itemSizes[0]?.portionWeightGrams),
        nutritionalValues: primarySize?.nutritionPerHundredGrams || null,
      });
    }
    }
    externalMenuItemIds = scopedItemIds;
    externalItemsRaw = [...normalizedItemsById.values()].filter((item) => externalMenuItemIds.has(normalizeIikoId(item?.id)));

    if (externalMenuItemIds.size === 0 || externalItemsRaw.length === 0) {
      throw new Error("Во внешнем меню iiko не найдено позиций для синхронизации");
    }

    const categoriesRaw = externalCategoriesRaw;
    const items = externalItemsRaw;
    const allowedCategoryIds = new Set();
    for (const item of items) {
    const itemCategoryIds = extractIikoItemCategoryIds(item);
    for (const itemCategoryId of itemCategoryIds) {
      const normalizedCategoryId = normalizeIikoId(itemCategoryId);
      if (normalizedCategoryId) allowedCategoryIds.add(normalizedCategoryId);
    }
    }
    const categories = categoriesRaw.filter((category) => {
    const iikoCategoryId = normalizeIikoId(category?.id || category?.category_id || category?.groupId || category?.group_id);
    if (!iikoCategoryId) return false;
    if (useExternalMenuFilter && !allowedCategoryIds.has(iikoCategoryId)) return false;
    return true;
    });
    const sizes = [];

    const connection = await db.getConnection();
    let stats = { categories: 0, items: 0, variants: 0, modifierGroups: 0, modifiers: 0 };
    const syncedCategoryExternalIds = new Set();
    const syncedItemExternalIds = new Set();
    const syncedVariantExternalIds = new Set();
    const syncedModifierGroupExternalIds = new Set();
    const syncedModifierExternalIds = new Set();

    try {
      await connection.beginTransaction();

    const [citiesRows] = await connection.query("SELECT id FROM cities ORDER BY id");
    const allCityIds = citiesRows.map((row) => Number(row.id)).filter(Number.isFinite);
    const targetCityIds = Number.isFinite(requestedCityId) && requestedCityId > 0 ? [requestedCityId] : allCityIds;
    const [cityOrganizationRows] = await connection.query(
      `SELECT city_id, iiko_organization_id
       FROM branches
       WHERE city_id IN (${targetCityIds.map(() => "?").join(",")})
         AND iiko_organization_id IS NOT NULL
         AND iiko_organization_id <> ''
       ORDER BY city_id, id`,
      targetCityIds,
    );
    const cityOrganizationIds = new Map();
    for (const row of cityOrganizationRows) {
      const cityKey = Number(row.city_id);
      const organizationId = String(row.iiko_organization_id || "").trim();
      if (!Number.isFinite(cityKey) || !organizationId) continue;
      if (!cityOrganizationIds.has(cityKey)) {
        cityOrganizationIds.set(cityKey, []);
      }
      const current = cityOrganizationIds.get(cityKey);
      if (!current.includes(organizationId)) {
        current.push(organizationId);
      }
    }

    const sizeNameById = new Map();
    for (const size of sizes) {
      const sizeId = normalizeIikoId(size.id || size.sizeId || size.size_id);
      if (!sizeId) continue;
      const sizeName = size.name || size.fullName || size.shortName || size.code || null;
      if (!sizeName) continue;
      sizeNameById.set(toLookupKey(sizeId), String(sizeName));
    }

    const localCategoryIdByIikoId = new Map();
    const processedCategoryIds = new Set();

    for (const category of categories) {
      const iikoId = normalizeIikoId(category.id || category.category_id || category.groupId || category.group_id);
      if (!iikoId) continue;
      if (processedCategoryIds.has(iikoId)) continue;
      processedCategoryIds.add(iikoId);
      if (useCategoryFilter && !selectedCategoryIds.has(iikoId)) continue;
      syncedCategoryExternalIds.add(iikoId);

      const name = normalizeDisplayName(category.name || category.title || category.caption, `Категория ${iikoId}`);
      const sortOrder = Number(category.sort_order || category.order || 0);
      const categoryDisabled =
        normalizeBooleanFlag(category.is_active) === false ||
        normalizeBooleanFlag(category.isActive) === false ||
        normalizeBooleanFlag(category.active) === false ||
        normalizeBooleanFlag(category.isDeleted) === true ||
        normalizeBooleanFlag(category.deleted) === true;
      const isActive = categoryDisabled ? 0 : 1;
      const imageUrl = category.image_url || category.image || category.imageLinks?.[0]?.href || null;

      const [existing] = await connection.query("SELECT id, name, is_active FROM menu_categories WHERE iiko_category_id = ? LIMIT 1", [iikoId]);
      let localCategoryId = null;
      if (existing.length > 0) {
        localCategoryId = existing[0].id;
        const resolvedName = preserveLocalNames ? existing[0].name : name;
        await connection.query(
          `UPDATE menu_categories
           SET name = ?, image_url = COALESCE(?, image_url), sort_order = ?, is_active = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [resolvedName, imageUrl, sortOrder, isActive, localCategoryId],
        );
      } else {
        const [inserted] = await connection.query(
          `INSERT INTO menu_categories (name, image_url, sort_order, is_active, iiko_category_id, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [name, imageUrl, sortOrder, isActive, iikoId],
        );
        localCategoryId = inserted.insertId;
      }

      localCategoryIdByIikoId.set(iikoId, localCategoryId);

      for (const targetCityId of targetCityIds) {
        await connection.query(
          `INSERT INTO menu_category_cities (category_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [localCategoryId, targetCityId, isActive ? 1 : 0],
        );
      }

      stats.categories += 1;
    }

    for (const item of items) {
      const iikoItemId = normalizeIikoId(item.id || item.item_id || item.productId || item.product_id);
      if (!iikoItemId) continue;
      if (String(item.orderItemType || "").toLowerCase() === "modifier") continue;
      if (String(item.type || "").toLowerCase() === "modifier") continue;
      syncedItemExternalIds.add(iikoItemId);
      const iikoCategoryIds = useExternalMenuFilter
        ? [...(externalMenuCategoryIdsByItemId.get(iikoItemId) || [])]
        : extractIikoItemCategoryIds(item);
      if (useCategoryFilter && !useExternalMenuFilter) {
        const inSelectedCategory = iikoCategoryIds.some((categoryId) => selectedCategoryIds.has(categoryId));
        if (!inSelectedCategory) continue;
      }

      const name = normalizeDisplayName(item.name || item.title, `Позиция ${iikoItemId}`);
      const description = firstNonEmptyString(item.description, item.additionalInfo, item.comment);
      const composition = firstNonEmptyString(item.composition, item.additionalInfo, item.comment);
      const imageUrl =
        resolveImageUrl(item.image_url) ||
        resolveImageUrl(item.image) ||
        resolveImageUrl(item.imageLinks) ||
        resolveImageUrl(item.images) ||
        resolveImageUrl(item?.imageLinks?.large) ||
        resolveImageUrl(item?.imageLinks?.medium) ||
        resolveImageUrl(item?.imageLinks?.small) ||
        null;
      const sizePricesRaw = Array.isArray(item.sizePrices) ? item.sizePrices : Array.isArray(item.size_prices) ? item.size_prices : [];
      const hasIncludedSize = sizePricesRaw.some((sizePrice) => normalizeBooleanFlag(sizePrice?.price?.isIncludedInMenu) !== false);
      const explicitIncludedInMenu =
        normalizeBooleanFlag(item.isIncludedInMenu) ??
        normalizeBooleanFlag(item.includedInMenu) ??
        normalizeBooleanFlag(item.price?.isIncludedInMenu);
      const isIncludedInMenu = explicitIncludedInMenu ?? (sizePricesRaw.length > 0 ? hasIncludedSize : true);
      const itemDisabled =
        normalizeBooleanFlag(item.is_active) === false ||
        normalizeBooleanFlag(item.isActive) === false ||
        normalizeBooleanFlag(item.active) === false ||
        normalizeBooleanFlag(item.isDeleted) === true ||
        normalizeBooleanFlag(item.deleted) === true ||
        isIncludedInMenu === false;
      const isActive = itemDisabled ? 0 : 1;
      const directPrice = toNumberOrNull(item.price ?? item.base_price);
      const fallbackSizePrice = sizePricesRaw.length > 0 ? resolveIikoPriceFromRows(sizePricesRaw[0]?.prices || [], []) : null;
      const basePrice = directPrice ?? fallbackSizePrice;
      const sortOrder = Number(item.sort_order || item.order || 0);
      const nutrition = item.nutritionalValues || item.nutritional_values || item.nutrition || {};
      const nutritionPer100 =
        nutrition.per100g ||
        nutrition.per100 ||
        nutrition.valuesPer100g ||
        (toNumberOrNull(nutrition.energy ?? nutrition.calories) !== null ||
        toNumberOrNull(nutrition.proteins) !== null ||
        toNumberOrNull(nutrition.fats ?? nutrition.fat) !== null ||
        toNumberOrNull(nutrition.carbs ?? nutrition.carbohydrates) !== null
          ? nutrition
          : {});
      const nutritionPerServing = nutrition.perServing || nutrition.serving || nutrition.full || {};
      const weightValueRaw = toNumberOrNull(
        item.weight ?? item.amount ?? item.measureUnitWeight ?? item.measure_unit_weight ?? item.portionWeight ?? nutrition.weight,
      );
      const weightUnit = normalizeWeightUnit(item.weight_unit || item.measureUnit || item.weightUnit || item.unit) || "pcs";
      const weightValue = normalizeWeightValue(weightValueRaw, weightUnit);
      const caloriesPer100g = toNumberOrNull(item.energyAmount ?? nutritionPer100.energy ?? nutritionPer100.calories);
      const proteinsPer100g = toNumberOrNull(item.proteinsAmount ?? nutritionPer100.proteins);
      const fatsPer100g = toNumberOrNull(item.fatAmount ?? nutritionPer100.fats ?? nutritionPer100.fat);
      const carbsPer100g = toNumberOrNull(item.carbohydratesAmount ?? nutritionPer100.carbohydrates ?? nutritionPer100.carbs);
      const caloriesPerServing =
        toNumberOrNull(item.energyFullAmount ?? nutritionPerServing.energy ?? nutritionPerServing.calories) ??
        calcServingNutrition(caloriesPer100g, weightValue);
      const proteinsPerServing =
        toNumberOrNull(item.proteinsFullAmount ?? nutritionPerServing.proteins) ?? calcServingNutrition(proteinsPer100g, weightValue);
      const fatsPerServing = toNumberOrNull(item.fatFullAmount ?? nutritionPerServing.fats ?? nutritionPerServing.fat) ?? calcServingNutrition(fatsPer100g, weightValue);
      const carbsPerServing =
        toNumberOrNull(item.carbohydratesFullAmount ?? nutritionPerServing.carbohydrates ?? nutritionPerServing.carbs) ??
        calcServingNutrition(carbsPer100g, weightValue);

      const [existing] = await connection.query("SELECT id, name, is_active, price FROM menu_items WHERE iiko_item_id = ? LIMIT 1", [iikoItemId]);
      let localItemId = null;
      if (existing.length > 0) {
        localItemId = existing[0].id;
        const resolvedName = preserveLocalNames ? existing[0].name : name;
        const storedBasePrice = toNumberOrNull(existing[0].price);
        await connection.query(
          `UPDATE menu_items
           SET name = ?, description = ?, composition = ?, image_url = COALESCE(?, image_url), price = ?, sort_order = ?, is_active = ?,
               weight_value = ?, weight_unit = ?, calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
               calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [
            resolvedName,
            description,
            composition,
            imageUrl,
            basePrice ?? storedBasePrice ?? 0,
            sortOrder,
            isActive,
            weightValue,
            weightUnit,
            caloriesPer100g,
            proteinsPer100g,
            fatsPer100g,
            carbsPer100g,
            caloriesPerServing,
            proteinsPerServing,
            fatsPerServing,
            carbsPerServing,
            localItemId,
          ],
        );
      } else {
        const [inserted] = await connection.query(
          `INSERT INTO menu_items
           (name, description, composition, price, image_url, sort_order, is_active, iiko_item_id,
            weight_value, weight_unit, calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
            calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            name,
            description,
            composition,
            basePrice ?? 0,
            imageUrl,
            sortOrder,
            isActive,
            iikoItemId,
            weightValue,
            weightUnit,
            caloriesPer100g,
            proteinsPer100g,
            fatsPer100g,
            carbsPer100g,
            caloriesPerServing,
            proteinsPerServing,
            fatsPerServing,
            carbsPerServing,
          ],
        );
        localItemId = inserted.insertId;
      }

      const localCategoryIds = iikoCategoryIds
        .map((iikoCategoryId) => localCategoryIdByIikoId.get(iikoCategoryId))
        .filter((value) => Number.isFinite(Number(value)));

      if (localCategoryIds.length > 0) {
        await connection.query("DELETE FROM menu_item_categories WHERE item_id = ?", [localItemId]);
        for (const localCategoryId of localCategoryIds) {
          await connection.query(
            `INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order)
             VALUES (?, ?, 0)`,
            [localItemId, localCategoryId],
          );
        }
      }

      for (const targetCityId of targetCityIds) {
        await connection.query(
          `INSERT INTO menu_item_cities (item_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [localItemId, targetCityId, isActive ? 1 : 0],
        );
      }
      for (const targetCityId of targetCityIds) {
        const preferredOrganizationIds = cityOrganizationIds.get(Number(targetCityId)) || [];
        const cityItemPrice = directPrice ?? resolveIikoPriceFromRows(sizePricesRaw[0]?.prices || [], preferredOrganizationIds);
        if (cityItemPrice === null) {
          await connection.query(
            `DELETE FROM menu_item_prices
             WHERE item_id = ?
               AND city_id = ?
               AND fulfillment_type IN ('delivery', 'pickup')`,
            [localItemId, targetCityId],
          );
          continue;
        }
        for (const fulfillmentType of ["delivery", "pickup"]) {
          await connection.query(
            `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [localItemId, targetCityId, fulfillmentType, cityItemPrice],
          );
        }
      }

      stats.items += 1;

      const hasSingleImplicitSize =
        sizePricesRaw.length === 1 &&
        !firstNonEmptyString(
          sizePricesRaw[0]?.sizeName,
          sizePricesRaw[0]?.name,
          sizePricesRaw[0]?.caption,
          sizePricesRaw[0]?.productSizeName,
          sizePricesRaw[0]?.size?.name,
          sizePricesRaw[0]?.size?.fullName,
        );
      const itemVariants =
        sizePricesRaw.length > 0 && !hasSingleImplicitSize
          ? sizePricesRaw.map((sizePrice, index) => {
              const sizeObject = sizePrice.size || sizePrice.productSize || sizePrice.price?.size || null;
              const sizeId = normalizeIikoId(
                sizePrice.sizeId || sizePrice.size_id || sizePrice.productSizeId || sizePrice.product_size_id || sizePrice.id || sizeObject?.id,
              );
              const variantName =
                firstNonEmptyString(
                  sizePrice.sizeName,
                  sizePrice.name,
                  sizePrice.caption,
                  sizePrice.productSizeName,
                  sizeObject?.name,
                  sizeObject?.fullName,
                ) ||
                (sizeId ? sizeNameById.get(toLookupKey(sizeId)) : null) ||
                (sizePricesRaw.length > 1 ? `Вариант ${index + 1}` : "Стандарт");
              const variantPrice = resolveIikoPriceFromRows(sizePrice.prices || []);
              const variantIncluded = normalizeBooleanFlag(sizePrice?.price?.isIncludedInMenu) !== false;
              const variantNutritionPer100 = sizePrice?.nutritionalValues || {};
              const variantWeightUnit = normalizeWeightUnit(sizePrice?.measureUnitType || item.weight_unit || item.measureUnit || item.unit) || weightUnit;
              const variantWeightValue = normalizeWeightValue(sizePrice?.portionWeight, variantWeightUnit);
              const variantCaloriesPer100g = toNumberOrNull(variantNutritionPer100.energy ?? variantNutritionPer100.calories);
              const variantProteinsPer100g = toNumberOrNull(variantNutritionPer100.proteins);
              const variantFatsPer100g = toNumberOrNull(variantNutritionPer100.fats ?? variantNutritionPer100.fat);
              const variantCarbsPer100g = toNumberOrNull(variantNutritionPer100.carbs ?? variantNutritionPer100.carbohydrates);
              return {
                id: sizeId ? `${iikoItemId}_${sizeId}` : `${iikoItemId}_size_${index + 1}`,
                name: variantName,
                price: variantPrice ?? basePrice,
                prices: Array.isArray(sizePrice.prices) ? sizePrice.prices : [],
                sort_order: index,
                is_active: isActive === 1 && variantIncluded,
                image_url:
                  resolveImageUrl(sizePrice?.image_url) ||
                  resolveImageUrl(sizePrice?.image) ||
                  resolveImageUrl(sizeObject?.buttonImageUrl) ||
                  imageUrl,
                weight_value: variantWeightValue,
                weight_unit: variantWeightUnit,
                calories_per_100g: variantCaloriesPer100g,
                proteins_per_100g: variantProteinsPer100g,
                fats_per_100g: variantFatsPer100g,
                carbs_per_100g: variantCarbsPer100g,
                calories_per_serving: calcServingNutrition(variantCaloriesPer100g, variantWeightValue),
                proteins_per_serving: calcServingNutrition(variantProteinsPer100g, variantWeightValue),
                fats_per_serving: calcServingNutrition(variantFatsPer100g, variantWeightValue),
                carbs_per_serving: calcServingNutrition(variantCarbsPer100g, variantWeightValue),
              };
            })
          : Array.isArray(item.variants)
            ? item.variants
            : [];

      const syncedVariantIds = [];
      const syncedVariantRows = [];
      const localVariantIdByIikoVariantId = new Map();
      for (const variant of itemVariants) {
        const iikoVariantId = normalizeIikoId(variant.id || variant.variant_id || variant.sizeId || variant.size_id);
        if (!iikoVariantId) continue;
        syncedVariantExternalIds.add(iikoVariantId);
        syncedVariantIds.push(iikoVariantId);

        const variantName = normalizeDisplayName(variant.name, `Вариант ${iikoVariantId}`);
        const variantPrice = toNumberOrNull(variant.price) ?? basePrice ?? 0;
        const variantImage = variant.image_url || variant.image || null;
        const variantSortOrder = Number(variant.sort_order || 0);
        const variantActive = variant.is_active === false ? 0 : 1;
        const variantWeightValue = normalizeWeightValue(variant.weight_value, normalizeWeightUnit(variant.weight_unit) || weightUnit);
        const variantWeightUnit = normalizeWeightUnit(variant.weight_unit) || weightUnit;
        const variantCaloriesPer100g = toNumberOrNull(variant.calories_per_100g);
        const variantProteinsPer100g = toNumberOrNull(variant.proteins_per_100g);
        const variantFatsPer100g = toNumberOrNull(variant.fats_per_100g);
        const variantCarbsPer100g = toNumberOrNull(variant.carbs_per_100g);
        const variantCaloriesPerServing = toNumberOrNull(variant.calories_per_serving) ?? calcServingNutrition(variantCaloriesPer100g, variantWeightValue);
        const variantProteinsPerServing = toNumberOrNull(variant.proteins_per_serving) ?? calcServingNutrition(variantProteinsPer100g, variantWeightValue);
        const variantFatsPerServing = toNumberOrNull(variant.fats_per_serving) ?? calcServingNutrition(variantFatsPer100g, variantWeightValue);
        const variantCarbsPerServing = toNumberOrNull(variant.carbs_per_serving) ?? calcServingNutrition(variantCarbsPer100g, variantWeightValue);

        const [existingVariant] = await connection.query("SELECT id, name, price FROM item_variants WHERE iiko_variant_id = ? LIMIT 1", [iikoVariantId]);
        let localVariantId = null;
        if (existingVariant.length > 0) {
          localVariantId = existingVariant[0].id;
          const resolvedVariantName = preserveLocalNames ? existingVariant[0].name : variantName;
          const storedVariantPrice = toNumberOrNull(existingVariant[0].price);
          await connection.query(
            `UPDATE item_variants
             SET item_id = ?, name = ?, price = ?, image_url = COALESCE(?, image_url),
                 weight_value = ?, weight_unit = ?, calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
                 calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?,
                 sort_order = ?, is_active = ?, iiko_synced_at = NOW()
             WHERE id = ?`,
            [
              localItemId,
              resolvedVariantName,
              variantPrice ?? storedVariantPrice ?? basePrice ?? 0,
              variantImage,
              variantWeightValue,
              variantWeightUnit,
              variantCaloriesPer100g,
              variantProteinsPer100g,
              variantFatsPer100g,
              variantCarbsPer100g,
              variantCaloriesPerServing,
              variantProteinsPerServing,
              variantFatsPerServing,
              variantCarbsPerServing,
              variantSortOrder,
              variantActive,
              localVariantId,
            ],
          );
        } else {
          const [insertedVariant] = await connection.query(
            `INSERT INTO item_variants
             (item_id, name, price, image_url, weight_value, weight_unit, calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
              calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving, sort_order, is_active, iiko_variant_id, iiko_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              localItemId,
              variantName,
              variantPrice ?? basePrice ?? 0,
              variantImage,
              variantWeightValue,
              variantWeightUnit,
              variantCaloriesPer100g,
              variantProteinsPer100g,
              variantFatsPer100g,
              variantCarbsPer100g,
              variantCaloriesPerServing,
              variantProteinsPerServing,
              variantFatsPerServing,
              variantCarbsPerServing,
              variantSortOrder,
              variantActive,
              iikoVariantId,
            ],
          );
          localVariantId = insertedVariant.insertId;
        }
        if (Number.isFinite(Number(localVariantId))) {
          localVariantIdByIikoVariantId.set(iikoVariantId, Number(localVariantId));
          syncedVariantRows.push({
            id: Number(localVariantId),
            price: variantPrice,
            isActive: variantActive,
            prices: Array.isArray(variant.prices) ? variant.prices : [],
          });
        }
        stats.variants += 1;
      }

      // Деактивируем устаревшие iiko-варианты товара, которых больше нет в актуальном ответе.
      if (syncedVariantIds.length > 0) {
        await connection.query(
          `UPDATE item_variants
           SET is_active = 0, iiko_synced_at = NOW()
           WHERE item_id = ?
             AND iiko_variant_id IS NOT NULL
             AND iiko_variant_id NOT IN (${syncedVariantIds.map(() => "?").join(",")})`,
          [localItemId, ...syncedVariantIds],
        );
      } else {
        await connection.query(
          `UPDATE item_variants
           SET is_active = 0, iiko_synced_at = NOW()
           WHERE item_id = ?
             AND iiko_variant_id IS NOT NULL`,
          [localItemId],
        );
      }

      for (const variantRow of syncedVariantRows) {
        for (const targetCityId of targetCityIds) {
          const preferredOrganizationIds = cityOrganizationIds.get(Number(targetCityId)) || [];
          const cityVariantPrice = resolveIikoPriceFromRows(variantRow.prices || [], preferredOrganizationIds);
          if (cityVariantPrice === null) {
            await connection.query(
              `DELETE FROM menu_variant_prices
               WHERE variant_id = ?
                 AND city_id = ?
                 AND fulfillment_type IN ('delivery', 'pickup')`,
              [variantRow.id, targetCityId],
            );
            continue;
          }
          for (const fulfillmentType of ["delivery", "pickup"]) {
            await connection.query(
              `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE price = VALUES(price)`,
              [variantRow.id, targetCityId, fulfillmentType, cityVariantPrice],
            );
          }
        }
      }

      const modifierGroupIdsForItem = new Set();
      const seenModifierGroupExternalIds = new Set();
      const seenModifierExternalIds = new Set();

      for (const sizePrice of sizePricesRaw) {
        const sizeIdRaw = normalizeIikoId(
          sizePrice?.sizeId ||
            sizePrice?.size_id ||
            sizePrice?.productSizeId ||
            sizePrice?.product_size_id ||
            sizePrice?.id ||
            sizePrice?.size?.id,
        );
        const iikoVariantIdForSize = sizeIdRaw ? `${iikoItemId}_${sizeIdRaw}` : "";
        const localVariantId = iikoVariantIdForSize ? localVariantIdByIikoVariantId.get(iikoVariantIdForSize) : null;
        const itemModifierGroups = Array.isArray(sizePrice?.itemModifierGroups) ? sizePrice.itemModifierGroups : [];

        for (let groupIndex = 0; groupIndex < itemModifierGroups.length; groupIndex += 1) {
          const rawGroup = itemModifierGroups[groupIndex] || {};
          const groupName = normalizeDisplayName(rawGroup?.name, `Группа ${groupIndex + 1}`);
          const groupExternalId =
            normalizeIikoId(rawGroup?.itemGroupId) || `${iikoItemId}::${toLookupKey(groupName)}::${String(groupIndex + 1)}`;
          const groupRestrictions = rawGroup?.restrictions || {};
          const groupType = normalizeModifierGroupType(groupRestrictions);
          const { minSelections, maxSelections } = normalizeModifierGroupSelections(groupRestrictions);
          const groupIsRequired = minSelections > 0 ? 1 : 0;
          const groupIsActive = rawGroup?.isHidden ? 0 : 1;

          let localGroupId = null;
            if (!seenModifierGroupExternalIds.has(groupExternalId)) {
            const [existingGroup] = await connection.query("SELECT id, name FROM modifier_groups WHERE iiko_modifier_group_id = ? LIMIT 1", [
              groupExternalId,
            ]);
            if (existingGroup.length > 0) {
              localGroupId = existingGroup[0].id;
              const resolvedGroupName = preserveLocalNames ? existingGroup[0].name : groupName;
              await connection.query(
                `UPDATE modifier_groups
                 SET name = ?, type = ?, is_required = ?, min_selections = ?, max_selections = ?, sort_order = ?, is_active = ?, iiko_synced_at = NOW()
                 WHERE id = ?`,
                [resolvedGroupName, groupType, groupIsRequired, minSelections, maxSelections, groupIndex, groupIsActive, localGroupId],
              );
            } else {
              const [insertedGroup] = await connection.query(
                `INSERT INTO modifier_groups
                 (name, iiko_modifier_group_id, type, is_required, is_global, min_selections, max_selections, sort_order, is_active, iiko_synced_at)
                 VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())`,
                [groupName, groupExternalId, groupType, groupIsRequired, minSelections, maxSelections, groupIndex, groupIsActive],
              );
              localGroupId = insertedGroup.insertId;
            }
              seenModifierGroupExternalIds.add(groupExternalId);
              syncedModifierGroupExternalIds.add(groupExternalId);
              stats.modifierGroups += 1;
          } else {
            const [groupRows] = await connection.query("SELECT id FROM modifier_groups WHERE iiko_modifier_group_id = ? LIMIT 1", [groupExternalId]);
            if (groupRows.length > 0) {
              localGroupId = groupRows[0].id;
            }
          }
          if (!Number.isFinite(Number(localGroupId))) continue;
          modifierGroupIdsForItem.add(Number(localGroupId));

          const groupItems = Array.isArray(rawGroup?.items) ? rawGroup.items : [];
          for (let modIndex = 0; modIndex < groupItems.length; modIndex += 1) {
            const rawModifier = groupItems[modIndex] || {};
            const modifierExternalId = normalizeIikoId(rawModifier?.itemId || rawModifier?.id);
            if (!modifierExternalId) continue;
            const modifierName = normalizeDisplayName(rawModifier?.name, `Модификатор ${modIndex + 1}`);
            const modifierPrice = extractModifierPrice(rawModifier);
            const modifierImageUrl = resolveImageUrl(rawModifier?.buttonImageUrl || rawModifier?.image_url || rawModifier?.image);
            const modifierWeightUnit = normalizeWeightUnit(rawModifier?.measureUnitType);
            const modifierWeightValue = normalizeWeightValue(rawModifier?.portionWeightGrams, modifierWeightUnit || "g");
            const modifierIsActive = rawModifier?.isHidden ? 0 : 1;
            const modifierSortOrder = Number(rawModifier?.position ?? modIndex);

            let localModifierId = null;
            if (!seenModifierExternalIds.has(modifierExternalId)) {
              const [existingModifier] = await connection.query("SELECT id, name FROM modifiers WHERE iiko_modifier_id = ? LIMIT 1", [modifierExternalId]);
              if (existingModifier.length > 0) {
                localModifierId = existingModifier[0].id;
                const resolvedModifierName = preserveLocalNames ? existingModifier[0].name : modifierName;
                await connection.query(
                  `UPDATE modifiers
                   SET group_id = ?, name = ?, price = ?, weight = ?, weight_unit = ?, image_url = COALESCE(?, image_url),
                       sort_order = ?, is_active = ?, iiko_synced_at = NOW()
                   WHERE id = ?`,
                  [
                    localGroupId,
                    resolvedModifierName,
                    modifierPrice,
                    modifierWeightValue,
                    modifierWeightUnit,
                    modifierImageUrl,
                    modifierSortOrder,
                    modifierIsActive,
                    localModifierId,
                  ],
                );
              } else {
                const [insertedModifier] = await connection.query(
                  `INSERT INTO modifiers
                   (group_id, name, price, weight, weight_unit, image_url, iiko_modifier_id, iiko_synced_at, sort_order, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
                  [
                    localGroupId,
                    modifierName,
                    modifierPrice,
                    modifierWeightValue,
                    modifierWeightUnit,
                    modifierImageUrl,
                    modifierExternalId,
                    modifierSortOrder,
                    modifierIsActive,
                  ],
                );
                localModifierId = insertedModifier.insertId;
              }
              seenModifierExternalIds.add(modifierExternalId);
              syncedModifierExternalIds.add(modifierExternalId);
              stats.modifiers += 1;
            } else {
              const [modifierRows] = await connection.query("SELECT id FROM modifiers WHERE iiko_modifier_id = ? LIMIT 1", [modifierExternalId]);
              if (modifierRows.length > 0) {
                localModifierId = modifierRows[0].id;
              }
            }
            if (!Number.isFinite(Number(localModifierId)) || !Number.isFinite(Number(localVariantId))) continue;

            await connection.query(
              `INSERT INTO menu_modifier_variant_prices (modifier_id, variant_id, price, weight, weight_unit)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE price = VALUES(price), weight = VALUES(weight), weight_unit = VALUES(weight_unit)`,
              [localModifierId, localVariantId, modifierPrice, modifierWeightValue, modifierWeightUnit],
            );
          }
        }
      }

      await connection.query(
        `DELETE img
         FROM item_modifier_groups img
         JOIN modifier_groups mg ON mg.id = img.modifier_group_id
         WHERE img.item_id = ?
           AND mg.iiko_modifier_group_id IS NOT NULL`,
        [localItemId],
      );
      for (const groupId of modifierGroupIdsForItem) {
        await connection.query(
          `INSERT IGNORE INTO item_modifier_groups (item_id, modifier_group_id)
           VALUES (?, ?)`,
          [localItemId, groupId],
        );
      }
    }

      // Внешнее меню iiko приходит целиком, поэтому отсутствующие в нем блюда
      // нужно деактивировать даже при локальном фильтре по категориям.
      if (canDeactivateMissingExternalItems) {
        if (allExternalMenuItemIds.size > 0) {
          const itemPlaceholders = [...allExternalMenuItemIds].map(() => "?").join(", ");
          await connection.query(
            `UPDATE menu_items
             SET is_active = 0, iiko_synced_at = NOW()
             WHERE COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NOT NULL
               AND iiko_item_id NOT IN (${itemPlaceholders})`,
            [...allExternalMenuItemIds],
          );
        } else {
          await connection.query(
            `UPDATE menu_items
             SET is_active = 0, iiko_synced_at = NOW()
             WHERE COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NOT NULL`,
          );
        }
      }

      // Для полного синка без фильтров дополнительно деактивируем локальные iiko-сущности,
      // отсутствующие в актуальном ответе внешнего меню.
      // Для частичных синков по городу эту деактивацию пропускаем.
      if (!useCategoryFilter && canDeactivateMissingExternalItems) {
        const deactivateByIikoIds = async (tableName, externalField, syncedIds = []) => {
          if (!Array.isArray(syncedIds) || syncedIds.length === 0) {
            await connection.query(
              `UPDATE ${tableName}
               SET is_active = 0, iiko_synced_at = NOW()
               WHERE COALESCE(NULLIF(TRIM(${externalField}), ''), NULL) IS NOT NULL`,
            );
            return;
          }
          const placeholders = syncedIds.map(() => "?").join(", ");
          await connection.query(
            `UPDATE ${tableName}
             SET is_active = 0, iiko_synced_at = NOW()
             WHERE COALESCE(NULLIF(TRIM(${externalField}), ''), NULL) IS NOT NULL
               AND ${externalField} NOT IN (${placeholders})`,
            syncedIds,
          );
        };

        await deactivateByIikoIds("menu_categories", "iiko_category_id", [...syncedCategoryExternalIds]);
        await deactivateByIikoIds("menu_items", "iiko_item_id", [...syncedItemExternalIds]);
        await deactivateByIikoIds("item_variants", "iiko_variant_id", [...syncedVariantExternalIds]);
        await deactivateByIikoIds("modifier_groups", "iiko_modifier_group_id", [...syncedModifierGroupExternalIds]);
        await deactivateByIikoIds("modifiers", "iiko_modifier_id", [...syncedModifierExternalIds]);

        await connection.query(
          `UPDATE menu_category_cities mcc
           JOIN menu_categories mc ON mc.id = mcc.category_id
           SET mcc.is_active = CASE WHEN mc.is_active = 1 THEN mcc.is_active ELSE 0 END`,
        );
        await connection.query(
          `UPDATE menu_item_cities mic
           JOIN menu_items mi ON mi.id = mic.item_id
           SET mic.is_active = CASE WHEN mi.is_active = 1 THEN mic.is_active ELSE 0 END`,
        );

      }

      // Удаляем связи позиций с деактивированными iiko-категориями,
      // чтобы в админке не оставалось "разброса" товаров по архивным дублям.
      await connection.query(
        `DELETE mic
         FROM menu_item_categories mic
         JOIN menu_categories mc ON mc.id = mic.category_id
         WHERE mc.is_active = 0
           AND COALESCE(NULLIF(TRIM(mc.iiko_category_id), ''), NULL) IS NOT NULL`,
      );

      await connection.query(
        `DELETE mc
         FROM menu_categories mc
         LEFT JOIN menu_item_categories mic ON mic.category_id = mc.id
         WHERE mc.is_active = 0
           AND COALESCE(NULLIF(TRIM(mc.iiko_category_id), ''), NULL) IS NOT NULL
           AND mic.category_id IS NULL`,
      );

      await connection.commit();

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await invalidatePublicMenuCache();
    notifyMenuUpdated({
      source: "iiko-sync",
      scope: cityId ? "city" : "all",
      cityId: cityId ? Number(cityId) || null : null,
    });

    const [[menuCounters]] = await Promise.all([
      db.query(
        `SELECT
           (
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM menu_categories) +
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM menu_items) +
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM item_variants) +
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM modifiers)
           ) AS total_count,
           (
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_category_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM menu_categories) +
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM menu_items) +
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_variant_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM item_variants) +
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_modifier_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM modifiers)
           ) AS linked_count`,
      ),
    ]);

    const menuTotalCount = Number(menuCounters?.total_count || 0);
    const menuLinkedCount = Number(menuCounters?.linked_count || 0);
    const menuUnlinkedCount = Math.max(menuTotalCount - menuLinkedCount, 0);
    const menuStatus = menuUnlinkedCount === 0 ? "ready" : "needs_mapping";
    const menuStats = {
      total: menuTotalCount,
      linked: menuLinkedCount,
      unlinked: menuUnlinkedCount,
      linked_percent: menuTotalCount > 0 ? Number(((menuLinkedCount / menuTotalCount) * 100).toFixed(2)) : 0,
      unlinked_percent: menuTotalCount > 0 ? Number(((menuUnlinkedCount / menuTotalCount) * 100).toFixed(2)) : 0,
    };
    await db.query(
      `INSERT INTO integration_readiness
         (provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at)
       VALUES
         ('iiko', 'menu', ?, ?, ?, ?, ?, JSON_OBJECT('max_unlinked_percent', 0), NOW())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         total_count = VALUES(total_count),
         linked_count = VALUES(linked_count),
         unlinked_count = VALUES(unlinked_count),
         stats = VALUES(stats),
         last_checked_at = NOW()`,
      [menuStatus, menuTotalCount, menuLinkedCount, menuUnlinkedCount, JSON.stringify(menuStats)],
    );

    const responseData = {
      hasData: Boolean(externalMenuPayload),
      keys: externalMenuPayload ? Object.keys(externalMenuPayload).slice(0, 20) : [],
      organizationStats: [],
      selectedCategoryIds: [...selectedCategoryIds],
      externalMenuId: useExternalMenuFilter ? externalMenuId : null,
      priceCategoryId: useExternalMenuFilter && priceCategoryId ? priceCategoryId : null,
      externalMenuItemCount: useExternalMenuFilter ? externalMenuItemIds.size : null,
      synced: stats,
      revisions: {},
    };

    await finishIntegrationEvent(logId, {
      status: "success",
      responseData,
      durationMs: Date.now() - startedAt,
    });

    return externalMenuPayload;
  } catch (error) {
    await finishIntegrationEvent(logId, {
      status: "failed",
      errorMessage: error?.message || "Ошибка синхронизации",
      durationMs: Date.now() - startedAt,
    });
    notifyMenuUpdated({
      source: "iiko-sync",
      status: "failed",
      error: error?.message || "Ошибка синхронизации",
    });
    throw error;
  }
}

export async function processIikoStopListSync(reason = "manual", branchId = null) {
  const client = await getIikoClientOrNull();
  if (!client) throw new Error("Клиент iiko недоступен");

  const startedAt = Date.now();
  const resolveTerminalGroupId = (value = {}) =>
    String(value?.terminalGroupId || value?.terminal_group_id || value?.terminalGroup?.id || "").trim();
  const resolveEntityIds = (value = {}) => {
    const ids = new Set();
    const push = (raw) => {
      const normalized = String(raw || "").trim();
      if (normalized) ids.add(normalized);
    };

    push(value?.id);
    push(value?.itemId);
    push(value?.item_id);
    push(value?.productId);
    push(value?.product_id);
    push(value?.sizeId);
    push(value?.size_id);
    push(value?.variantId);
    push(value?.variant_id);
    push(value?.modifierId);
    push(value?.modifier_id);
    return [...ids];
  };
  const resolveContainerItems = (value = {}) => {
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.products)) return value.products;
    if (Array.isArray(value?.stopList)) return value.stopList;
    if (Array.isArray(value?.stop_list)) return value.stop_list;
    return [];
  };
  const resolveTopLevelContainers = (payload = {}) => {
    if (Array.isArray(payload?.terminalGroupStopLists)) return payload.terminalGroupStopLists;
    if (Array.isArray(payload?.stopLists)) return payload.stopLists;
    if (Array.isArray(payload?.organizationStopLists)) return payload.organizationStopLists;
    return [];
  };
  const parseStopListCreatedAt = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const direct = raw.replace("T", " ").replace(/Z$/, "").replace(/\.\d+$/, "");
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(direct)) return direct;

    const parsedDate = new Date(raw);
    if (Number.isNaN(parsedDate.getTime())) return null;
    const yyyy = parsedDate.getFullYear();
    const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(parsedDate.getDate()).padStart(2, "0");
    const hh = String(parsedDate.getHours()).padStart(2, "0");
    const mi = String(parsedDate.getMinutes()).padStart(2, "0");
    const ss = String(parsedDate.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  };
  const buildStopListMeta = (value = {}) => {
    const reasonCandidates = [
      value?.reason,
      value?.stopReason,
      value?.stop_reason,
      value?.cause,
      value?.comment,
      value?.description,
    ];
    const reasonValue = reasonCandidates.map((item) => String(item || "").trim()).find(Boolean);
    const balanceValue = Number(value?.balance);
    const fallbackReason =
      Number.isFinite(balanceValue) && balanceValue <= 0
        ? `Нет остатка в iiko (balance: ${balanceValue})`
        : "Синхронизация стоп-листа из iiko";

    return {
      reason: reasonValue || fallbackReason,
      createdAt: parseStopListCreatedAt(value?.dateAdd || value?.date_add || value?.createdAt || value?.created_at || value?.stoppedAt),
    };
  };

  const autoReason = "Синхронизация стоп-листа из iiko";

  const pushEntry = (terminalGroupIdRaw, item) => {
    const key = String(terminalGroupIdRaw || "").trim();
    const ids = resolveEntityIds(item);
    if (ids.length === 0) return;
    if (!entryMap.has(key)) entryMap.set(key, new Map());
    const stopMeta = buildStopListMeta(item);
    for (const externalId of ids) {
      const existing = entryMap.get(key).get(externalId) || null;
      if (!existing) {
        entryMap.get(key).set(externalId, stopMeta);
        continue;
      }

      const existingTs = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const nextTs = stopMeta.createdAt ? new Date(stopMeta.createdAt).getTime() : 0;
      const shouldReplaceCreatedAt = nextTs > existingTs;

      entryMap.get(key).set(externalId, {
        reason: stopMeta.reason || existing.reason || autoReason,
        createdAt: shouldReplaceCreatedAt ? stopMeta.createdAt : existing.createdAt,
      });
    }
  };

  const collectEntries = (node, inheritedTerminalGroupId = "") => {
    if (!node || typeof node !== "object") return;

    const ownTerminalGroupId = resolveTerminalGroupId(node);
    const terminalGroupId = ownTerminalGroupId || inheritedTerminalGroupId;
    pushEntry(terminalGroupId, node);

    const nestedItems = resolveContainerItems(node);
    if (nestedItems.length === 0) return;
    for (const nestedNode of nestedItems) {
      collectEntries(nestedNode, terminalGroupId);
    }
  };

  const requestedBranchId = Number(branchId);
  const branchFilter = Number.isFinite(requestedBranchId) && requestedBranchId > 0 ? requestedBranchId : null;
  const [branches] = await db.query(
    `SELECT id, iiko_terminal_group_id
     FROM branches
     WHERE (? IS NULL OR id = ?)
       AND iiko_terminal_group_id IS NOT NULL
       AND iiko_terminal_group_id <> ''`,
    [branchFilter, branchFilter],
  );

  const targetBranches = branches.map((row) => ({
    id: Number(row.id),
    terminalGroupId: String(row.iiko_terminal_group_id || "").trim(),
  }));
  const targetBranchIds = targetBranches.map((row) => row.id).filter(Number.isFinite);
  const terminalGroupsIds = targetBranches.map((row) => row.terminalGroupId).filter(Boolean);

  const data = await client.getStopList({
    ...(terminalGroupsIds.length > 0 ? { terminalGroupsIds } : {}),
  });
  const topLevelContainers = resolveTopLevelContainers(data);
  const entryMap = new Map();

  if (topLevelContainers.length > 0) {
    for (const container of topLevelContainers) {
      collectEntries(container, "");
    }
  } else {
    const fallbackItems = resolveContainerItems(data);
    for (const item of fallbackItems) {
      collectEntries(item, "");
    }
  }

  const allExternalIdsSet = new Set();
  for (const [terminalGroupId, idsMap] of entryMap.entries()) {
    if (!terminalGroupId) {
      for (const id of idsMap.keys()) allExternalIdsSet.add(id);
      continue;
    }
    if (targetBranches.some((branch) => branch.terminalGroupId === terminalGroupId)) {
      for (const id of idsMap.keys()) allExternalIdsSet.add(id);
    }
  }

  const allExternalIds = [...allExternalIdsSet];
  const itemIdMap = new Map();
  const variantIdMap = new Map();
  const modifierIdMap = new Map();

  if (allExternalIds.length > 0) {
    const placeholders = allExternalIds.map(() => "?").join(",");
    const [[itemRows], [variantRows], [modifierRows]] = await Promise.all([
      db.query(`SELECT id, iiko_item_id FROM menu_items WHERE iiko_item_id IN (${placeholders})`, allExternalIds),
      db.query(`SELECT id, iiko_variant_id FROM item_variants WHERE iiko_variant_id IN (${placeholders})`, allExternalIds),
      db.query(`SELECT id, iiko_modifier_id FROM modifiers WHERE iiko_modifier_id IN (${placeholders})`, allExternalIds),
    ]);

    for (const row of itemRows) {
      itemIdMap.set(String(row.iiko_item_id).trim(), Number(row.id));
    }
    for (const row of variantRows) {
      variantIdMap.set(String(row.iiko_variant_id).trim(), Number(row.id));
    }
    for (const row of modifierRows) {
      modifierIdMap.set(String(row.iiko_modifier_id).trim(), Number(row.id));
    }
  }

  let updatedCount = 0;
  let matchedCount = 0;
  let removedCount = 0;
  const unmatchedExternalIds = new Set();

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (targetBranchIds.length > 0) {
      const branchPlaceholders = targetBranchIds.map(() => "?").join(",");
      const [deleteResult] = await connection.query(
        `DELETE FROM menu_stop_list
         WHERE branch_id IN (${branchPlaceholders})
           AND created_by IS NULL
           AND reason = ?`,
        [...targetBranchIds, autoReason],
      );
      removedCount = Number(deleteResult?.affectedRows || 0);
    }

    for (const branch of targetBranches) {
      const branchScopedEntries = new Map();
      const mergeEntries = (sourceMap) => {
        if (!sourceMap) return;
        for (const [externalId, meta] of sourceMap.entries()) {
          const existing = branchScopedEntries.get(externalId) || null;
          if (!existing) {
            branchScopedEntries.set(externalId, meta);
            continue;
          }
          const existingTs = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          const nextTs = meta?.createdAt ? new Date(meta.createdAt).getTime() : 0;
          branchScopedEntries.set(externalId, {
            reason: meta?.reason || existing.reason || autoReason,
            createdAt: nextTs > existingTs ? meta.createdAt : existing.createdAt,
          });
        }
      };
      mergeEntries(entryMap.get("") || null);
      mergeEntries(entryMap.get(branch.terminalGroupId) || null);

      for (const [externalId, stopMeta] of branchScopedEntries.entries()) {
        const itemId = itemIdMap.get(externalId);
        const variantId = variantIdMap.get(externalId);
        const modifierId = modifierIdMap.get(externalId);

        let entityType = null;
        let entityId = null;
        if (Number.isFinite(itemId)) {
          entityType = "item";
          entityId = itemId;
        } else if (Number.isFinite(variantId)) {
          entityType = "variant";
          entityId = variantId;
        } else if (Number.isFinite(modifierId)) {
          entityType = "modifier";
          entityId = modifierId;
        }

        if (!entityType || !Number.isFinite(entityId)) {
          unmatchedExternalIds.add(externalId);
          continue;
        }
        matchedCount += 1;

        await connection.query(
          `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_by, created_at)
           VALUES (?, ?, ?, NULL, ?, 0, NULL, NULL, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE
             fulfillment_types = NULL,
             reason = VALUES(reason),
             auto_remove = 0,
             remove_at = NULL,
             created_by = NULL,
             created_at = VALUES(created_at)`,
          [branch.id, entityType, entityId, stopMeta?.reason || autoReason, stopMeta?.createdAt || null],
        );
        updatedCount += 1;
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (unmatchedExternalIds.size > 0) {
    const externalContext = JSON.stringify({
      source: "iiko_stoplist_sync",
      branch_id: branchId || null,
      synced_at: new Date().toISOString(),
    });
    for (const externalId of unmatchedExternalIds) {
      await db.query(
        `INSERT INTO integration_mapping_candidates
           (provider, module, entity_type, local_entity_type, local_entity_id, local_name,
            external_entity_id, external_context, external_payload, confidence, state, notes)
         SELECT 'iiko', 'stoplist', 'stoplist_entity', 'unknown', NULL, NULL,
                ?, ?, NULL, NULL, 'requires_review', 'ID из стоп-листа iiko не найден среди локальных сопоставлений'
         WHERE NOT EXISTS (
           SELECT 1
           FROM integration_mapping_candidates c
           WHERE c.provider = 'iiko'
             AND c.module = 'stoplist'
             AND c.external_entity_id = ?
             AND c.state IN ('suggested', 'requires_review')
         )`,
        [externalId, externalContext, externalId],
      );
    }
  }

  if (matchedCount > 0) {
    const matchedIds = [...allExternalIdsSet].filter((externalId) => {
      const itemId = itemIdMap.get(externalId);
      const variantId = variantIdMap.get(externalId);
      const modifierId = modifierIdMap.get(externalId);
      return Number.isFinite(itemId) || Number.isFinite(variantId) || Number.isFinite(modifierId);
    });

    if (matchedIds.length > 0) {
      const placeholders = matchedIds.map(() => "?").join(",");
      await db.query(
        `UPDATE integration_mapping_candidates
         SET state = 'confirmed', resolved_at = NOW(), updated_at = NOW()
         WHERE provider = 'iiko'
           AND module = 'stoplist'
           AND external_entity_id IN (${placeholders})
           AND state IN ('suggested', 'requires_review')`,
        matchedIds,
      );
    }
  }

  const [[stopListTotalRows], [menuReadinessRows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM menu_stop_list
       WHERE created_by IS NULL
         AND reason = ?`,
      [autoReason],
    ),
    db.query(
      `SELECT status
       FROM integration_readiness
       WHERE provider = 'iiko' AND module = 'menu'
       LIMIT 1`,
    ),
  ]);
  const stopListTotal = Number(stopListTotalRows?.[0]?.total || 0);
  const unmatchedCount = unmatchedExternalIds.size;
  const stopListStatus = menuReadinessRows?.[0]?.status === "ready" && unmatchedCount === 0 ? "ready" : "needs_mapping";
  const stopListStats = {
    synced_entries: stopListTotal,
    unmatched_candidates: unmatchedCount,
    linked: Math.max(stopListTotal - unmatchedCount, 0),
    unlinked: unmatchedCount,
  };

  await db.query(
    `INSERT INTO integration_readiness
       (provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at)
     VALUES
       ('iiko', 'stoplist', ?, ?, ?, ?, ?, JSON_OBJECT(), NOW())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       total_count = VALUES(total_count),
       linked_count = VALUES(linked_count),
       unlinked_count = VALUES(unlinked_count),
       stats = VALUES(stats),
       last_checked_at = NOW()`,
    [stopListStatus, stopListTotal, Math.max(stopListTotal - unmatchedCount, 0), unmatchedCount, JSON.stringify(stopListStats)],
  );

  await invalidatePublicMenuCache();
  notifyMenuUpdated({
    source: "iiko-stoplist-sync",
    scope: targetBranchIds.length === 1 ? "branch" : "all",
    branchId: targetBranchIds.length === 1 ? targetBranchIds[0] : null,
  });

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.STOPLIST,
    action: "sync_stoplist",
    status: "success",
    requestData: { reason, branchId },
    responseData: {
      hasData: Boolean(data),
      keys: data ? Object.keys(data).slice(0, 20) : [],
      targetBranches: targetBranchIds.length,
      removedCount,
      matchedCount,
      unmatchedCount,
      updatedCount,
    },
    durationMs: Date.now() - startedAt,
  });

  return data;
}

export async function retryFailedSyncs() {
  const [iikoOrders] = await db.query(
    `SELECT id FROM orders
     WHERE iiko_sync_status IN ('pending', 'error')
       AND iiko_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS],
  );

  const [pbUsers] = await db.query(
    `SELECT id FROM users
     WHERE pb_sync_status IN ('pending', 'error')
       AND pb_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS],
  );

  const [pbOrders] = await db.query(
    `SELECT id, status, pb_purchase_id FROM orders
     WHERE pb_sync_status IN ('pending', 'error')
       AND pb_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS],
  );

  for (const row of iikoOrders) {
    try {
      await processIikoOrderSync(row.id, "retry");
    } catch (error) {
      // Ошибка уже записана в логах синхронизации.
    }
  }

  for (const row of pbUsers) {
    try {
      await processPremiumBonusClientSync(row.id, "retry");
    } catch (error) {
      // Ошибка уже записана в логах синхронизации.
    }
  }

  for (const row of pbOrders) {
    try {
      const hasPurchaseId = String(row.pb_purchase_id || "").trim().length > 0;
      const action = row.status === "cancelled" ? (hasPurchaseId ? "cancel" : "create") : hasPurchaseId ? "status" : "create";
      await processPremiumBonusPurchaseSync(row.id, action, "retry");
    } catch (error) {
      // Ошибка уже записана в логах синхронизации.
    }
  }

  return {
    iikoOrders: iikoOrders.length,
    pbUsers: pbUsers.length,
    pbOrders: pbOrders.length,
  };
}

function extractIikoOrderStatus(orderPayload) {
  if (!orderPayload || typeof orderPayload !== "object") return "";
  return String(
    orderPayload.status ||
      orderPayload.deliveryStatus ||
      orderPayload.orderStatus ||
      orderPayload?.order?.status ||
      orderPayload?.orderInfo?.status ||
      "",
  ).trim();
}

function extractIikoOrderId(orderPayload) {
  if (!orderPayload || typeof orderPayload !== "object") return "";
  return String(orderPayload.id || orderPayload.orderId || orderPayload?.order?.id || orderPayload?.orderInfo?.id || "").trim();
}

export async function reconcileIikoOrderStatuses({ limit = 100 } = {}) {
  const settings = await getIntegrationSettings();
  const ordersMode = String(settings?.integrationMode?.orders || "local")
    .trim()
    .toLowerCase();
  if (!settings.iikoEnabled || !settings.iikoAutoSyncEnabled || ordersMode !== "external") {
    return {
      checked: 0,
      updated: 0,
      skipped: true,
      reason: "Режим синхронизации статусов заказов iiko отключен",
    };
  }

  const client = await getIikoClientOrNull();
  if (!client) {
    return {
      checked: 0,
      updated: 0,
      skipped: true,
      reason: "Клиент iiko недоступен",
    };
  }

  const maxRows = Math.max(1, Math.min(Number(limit) || 100, 300));
  const [orders] = await db.query(
    `SELECT o.id,
            o.status,
            o.iiko_order_id,
            o.order_number,
            b.iiko_organization_id AS branch_iiko_organization_id
     FROM orders o
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.iiko_order_id IS NOT NULL
       AND o.iiko_order_id <> ''
       AND o.status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivering')
     ORDER BY o.id ASC
     LIMIT ?`,
    [maxRows],
  );

  if (!orders.length) {
    return {
      checked: 0,
      updated: 0,
      skipped: false,
    };
  }

  const fallbackOrganizationId = String(settings.iikoOrganizationId || "").trim();
  const groupedByOrganization = new Map();

  for (const order of orders) {
    const organizationId = String(order.branch_iiko_organization_id || fallbackOrganizationId || "").trim();
    if (!organizationId) continue;
    if (!groupedByOrganization.has(organizationId)) {
      groupedByOrganization.set(organizationId, []);
    }
    groupedByOrganization.get(organizationId).push(order);
  }

  let checked = 0;
  let updated = 0;

  for (const [organizationId, organizationOrders] of groupedByOrganization.entries()) {
    const orderIds = organizationOrders.map((row) => String(row.iiko_order_id || "").trim()).filter(Boolean);
    if (!orderIds.length) continue;

    let payload;
    try {
      payload = await client.getOrderStatus({
        organizationId,
        orderIds,
      });
    } catch (error) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "reconcile_order_statuses",
        status: "failed",
        errorMessage: error?.message || "Ошибка запроса статусов заказов в iiko",
        requestData: {
          organizationId,
          orderIds,
        },
      });
      continue;
    }

    const externalOrders = Array.isArray(payload?.orders) ? payload.orders : [];
    const statusByIikoOrderId = new Map();
    for (const externalOrder of externalOrders) {
      const iikoOrderId = extractIikoOrderId(externalOrder);
      const iikoStatus = extractIikoOrderStatus(externalOrder);
      if (!iikoOrderId || !iikoStatus) continue;
      statusByIikoOrderId.set(iikoOrderId, iikoStatus);
    }

    for (const localOrder of organizationOrders) {
      checked += 1;
      const localIikoOrderId = String(localOrder.iiko_order_id || "").trim();
      if (!localIikoOrderId) continue;
      const iikoStatus = statusByIikoOrderId.get(localIikoOrderId);
      if (!iikoStatus) continue;

      const mappedStatus = IIKO_STATUS_MAP_TO_LOCAL[iikoStatus] || IIKO_STATUS_MAP_TO_LOCAL[String(iikoStatus).toLowerCase()] || null;
      if (!mappedStatus || mappedStatus === localOrder.status) continue;

      await db.query("UPDATE orders SET status = ?, iiko_sync_status = ?, iiko_sync_error = NULL, iiko_last_sync_at = NOW() WHERE id = ?", [
        mappedStatus,
        SYNC_STATUS.SYNCED,
        localOrder.id,
      ]);
      await db.query("UPDATE orders SET pb_sync_status = 'pending', pb_sync_error = NULL, pb_sync_attempts = 0, pb_last_sync_at = NOW() WHERE id = ?", [
        localOrder.id,
      ]);
      updated += 1;

      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "reconcile_order_statuses",
        status: "success",
        entityType: "order",
        entityId: localOrder.id,
        requestData: {
          iiko_order_id: localIikoOrderId,
          iiko_status: iikoStatus,
          local_status_before: localOrder.status,
        },
        responseData: {
          local_status_after: mappedStatus,
        },
      });
    }
  }

  return {
    checked,
    updated,
    skipped: false,
  };
}
