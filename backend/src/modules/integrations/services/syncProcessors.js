import db from "../../../config/database.js";
import redis from "../../../config/redis.js";
import { createHash } from "node:crypto";
import { getIikoClientOrNull, getIntegrationSettings, getPremiumBonusClientOrNull } from "./integrationConfigService.js";
import { INTEGRATION_MODULE, INTEGRATION_TYPE, MAX_SYNC_ATTEMPTS, SYNC_STATUS } from "../constants.js";
import { finishIntegrationEvent, logIntegrationEvent, startIntegrationEvent } from "./integrationLoggerService.js";
import { getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";

const nowIso = () => new Date().toISOString();

function nextSyncState(attempts) {
  if (attempts >= MAX_SYNC_ATTEMPTS) return SYNC_STATUS.FAILED;
  return SYNC_STATUS.ERROR;
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
            u.phone AS user_phone
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
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

  return { order, items };
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

    const iikoItems = items
      .map((item) => {
        const productId = String(item.iiko_item_id || "").trim();
        if (!productId) return null;

        const payloadItem = {
          type: "Product",
          productId,
          amount: Number(item.quantity) || 1,
          price: Number(item.item_price) || 0,
          comment: item.variant_name || null,
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

    const payload = {
      order: {
        externalNumber: String(order.order_number || order.id),
        phone,
        orderServiceType: order.order_type === "pickup" ? "DeliveryByClient" : "DeliveryByCourier",
        comment: order.comment || null,
        sourceKey: "foodminiapp",
        items: iikoItems,
      },
    };

    const response = await client.createOrder(payload);
    const iikoOrderId = response?.orderId || response?.id || null;

    await markOrderIikoSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      iikoOrderId,
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

    return { synced: true, iikoOrderId };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markOrderIikoSync(orderId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
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
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
  if (users.length === 0) throw new Error("Пользователь не найден");

  const user = users[0];
  const nextAttempts = (Number(user.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    const info = await client.buyerInfo({ identificator: user.pb_client_id || user.phone });
    let pbClientId = info?.client_id || user.pb_client_id || null;
    let responsePayload = info;

    if (!info?.is_registered) {
      const registrationPayload = {
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        birth_date: user.date_of_birth,
        external_id: user.pb_external_id || `foodminiapp_user_${user.id}`,
      };
      const registration = await client.registerBuyer(registrationPayload);
      pbClientId = registration?.client_id || pbClientId;
      responsePayload = registration;
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
  const [users] = await db.query("SELECT id, phone, pb_client_id FROM users WHERE id = ?", [order.user_id]);
  if (users.length === 0) throw new Error("Пользователь заказа не найден");

  const user = users[0];
  const nextAttempts = (Number(order.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    const customerIdentificator = user.pb_client_id || user.phone;
    let response;
    const payloadBase = {
      order_id: String(order.id),
      identificator: customerIdentificator,
      total: Number(order.total),
      bonus_spent: Number(order.bonus_spent || 0),
      items: items.map((item) => ({
        id: item.item_id,
        name: item.item_name,
        quantity: Number(item.quantity),
        price: Number(item.item_price),
      })),
    };

    if (action === "create") {
      response = await client.createPurchase(payloadBase);
    } else if (action === "status") {
      response = await client.changePurchaseStatus({
        purchase_id: order.pb_purchase_id,
        status: order.status,
      });
    } else if (action === "cancel") {
      response = await client.cancelPurchase({
        purchase_id: order.pb_purchase_id,
      });
    } else {
      throw new Error("Неизвестное действие синхронизации покупки");
    }

    await markOrderPbSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      purchaseId: response?.purchase_id || response?.id || order.pb_purchase_id,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.PURCHASES,
      action: `purchase_${action}`,
      status: "success",
      entityType: "order",
      entityId: orderId,
      requestData: payloadBase,
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
  if (!useExternalMenuFilter) {
    throw new Error("Не выбран iiko_external_menu_id. Синхронизация меню выполняется через /api/2/menu/by_id.");
  }

  // Загружаем последние revision из настроек
  const systemSettings = await getSystemSettings();
  const lastRevisions = systemSettings.iiko_last_revisions || {};

  const startedAt = Date.now();
  const logId = await startIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.MENU,
    action: "sync_menu",
    requestData: { reason, cityId },
  });

  try {
    const data = await client.getNomenclature({ useConfiguredOrganization: false, lastRevisions });
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
      const prices = Array.isArray(size?.prices) ? size.prices : [];
      if (prices.length === 0) return 0;
      const firstPrice = toNumberOrNull(prices[0]?.price);
      return firstPrice ?? 0;
    };

    const normalizedItemsById = new Map();
    const scopedItemIds = new Set();
    for (const category of menuCategories) {
    const externalCategoryId = normalizeIikoId(category?.id || category?.itemCategoryId || category?.iikoGroupId);
    const categoryItems = Array.isArray(category?.items) ? category.items : [];
    for (const menuItem of categoryItems) {
      const itemId = normalizeIikoId(menuItem?.itemId || menuItem?.id || menuItem?.productId);
      if (!itemId) continue;
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
    const sizes = Array.isArray(data?.sizes) ? data.sizes : [];

    const connection = await db.getConnection();
    let stats = { categories: 0, items: 0, variants: 0, modifierGroups: 0, modifiers: 0 };

    try {
      await connection.beginTransaction();

    const [citiesRows] = await connection.query("SELECT id FROM cities ORDER BY id");
    const allCityIds = citiesRows.map((row) => Number(row.id)).filter(Number.isFinite);
    const requestedCityId = Number(cityId);
    const targetCityIds = Number.isFinite(requestedCityId) && requestedCityId > 0 ? [requestedCityId] : allCityIds;

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

      const name = normalizeDisplayName(category.name || category.title || category.caption, `Категория ${iikoId}`);
      const sortOrder = Number(category.sort_order || category.order || 0);
      const isActive = category.is_active === false || category.isDeleted === true ? 0 : 1;
      const imageUrl = category.image_url || category.image || category.imageLinks?.[0]?.href || null;

      const [existing] = await connection.query("SELECT id, name, is_active FROM menu_categories WHERE iiko_category_id = ? LIMIT 1", [iikoId]);
      let localCategoryId = null;
      if (existing.length > 0) {
        localCategoryId = existing[0].id;
        const resolvedName = preserveLocalNames ? existing[0].name : name;
        const resolvedIsActive = preserveLocalNames ? Number(existing[0].is_active) : isActive;
        await connection.query(
          `UPDATE menu_categories
           SET name = ?, image_url = COALESCE(?, image_url), sort_order = ?, is_active = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [resolvedName, imageUrl, sortOrder, resolvedIsActive, localCategoryId],
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
        if (preserveLocalNames) {
          await connection.query(
            `INSERT INTO menu_category_cities (category_id, city_id, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = is_active`,
            [localCategoryId, targetCityId, isActive ? 1 : 0],
          );
        } else {
          await connection.query(
            `INSERT INTO menu_category_cities (category_id, city_id, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [localCategoryId, targetCityId, isActive ? 1 : 0],
          );
        }
      }

      stats.categories += 1;
    }

    for (const item of items) {
      const iikoItemId = normalizeIikoId(item.id || item.item_id || item.productId || item.product_id);
      if (!iikoItemId) continue;
      if (String(item.orderItemType || "").toLowerCase() === "modifier") continue;
      if (String(item.type || "").toLowerCase() === "modifier") continue;
      const iikoCategoryIds = useExternalMenuFilter
        ? [...(externalMenuCategoryIdsByItemId.get(iikoItemId) || [])]
        : extractIikoItemCategoryIds(item);
      if (useCategoryFilter && !useExternalMenuFilter) {
        const inSelectedCategory = iikoCategoryIds.some((categoryId) => selectedCategoryIds.has(categoryId));
        if (!inSelectedCategory) continue;
      }

      const name = normalizeDisplayName(item.name || item.title, `Позиция ${iikoItemId}`);
      const composition = firstNonEmptyString(item.composition, item.additionalInfo, item.description, item.comment);
      const description = null;
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
      const hasIncludedSize = sizePricesRaw.some((sizePrice) => sizePrice?.price?.isIncludedInMenu !== false);
      const isIncludedInMenu = typeof item.isIncludedInMenu === "boolean" ? item.isIncludedInMenu : sizePricesRaw.length > 0 ? hasIncludedSize : true;
      const isActive = item.is_active === false || item.isDeleted === true || isIncludedInMenu === false ? 0 : 1;
      const directPrice = toNumberOrNull(item.price ?? item.base_price);
      const fallbackSizePrice = sizePricesRaw.length > 0 ? toNumberOrNull(sizePricesRaw[0]?.price ?? sizePricesRaw[0]?.priceValue) : null;
      const basePrice = directPrice ?? fallbackSizePrice ?? 0;
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

      const [existing] = await connection.query("SELECT id, name, is_active FROM menu_items WHERE iiko_item_id = ? LIMIT 1", [iikoItemId]);
      let localItemId = null;
      if (existing.length > 0) {
        localItemId = existing[0].id;
        const resolvedName = preserveLocalNames ? existing[0].name : name;
        const resolvedIsActive = preserveLocalNames ? Number(existing[0].is_active) : isActive;
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
            basePrice,
            sortOrder,
            resolvedIsActive,
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
            basePrice,
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
        if (preserveLocalNames) {
          await connection.query(
            `INSERT INTO menu_item_cities (item_id, city_id, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = is_active`,
            [localItemId, targetCityId, isActive ? 1 : 0],
          );
        } else {
          await connection.query(
            `INSERT INTO menu_item_cities (item_id, city_id, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [localItemId, targetCityId, isActive ? 1 : 0],
          );
        }
      }
      for (const targetCityId of targetCityIds) {
        for (const fulfillmentType of ["delivery", "pickup"]) {
          await connection.query(
            `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [localItemId, targetCityId, fulfillmentType, basePrice],
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
              const variantPrice = toNumberOrNull(sizePrice.price ?? sizePrice.priceValue);
              const variantIncluded = sizePrice?.price?.isIncludedInMenu !== false;
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

        const [existingVariant] = await connection.query("SELECT id, name FROM item_variants WHERE iiko_variant_id = ? LIMIT 1", [iikoVariantId]);
        let localVariantId = null;
        if (existingVariant.length > 0) {
          localVariantId = existingVariant[0].id;
          const resolvedVariantName = preserveLocalNames ? existingVariant[0].name : variantName;
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
              variantPrice,
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
              variantPrice,
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
          for (const fulfillmentType of ["delivery", "pickup"]) {
            await connection.query(
              `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE price = VALUES(price)`,
              [variantRow.id, targetCityId, fulfillmentType, variantRow.price],
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

    // Local-first: при инкрементальных revision и ручной фильтрации категорий
    // не удаляем локальные записи по отсутствию в текущем ответе.
    // iiko-признак удаления обрабатывается на уровне самих объектов (isDeleted/is_active).

      await connection.commit();

    // Сохраняем новые revision для инкрементальных обновлений
      if (data?.organizationStats && Array.isArray(data.organizationStats)) {
        const newRevisions = { ...lastRevisions };
        for (const orgStat of data.organizationStats) {
          if (orgStat.organizationId && orgStat.revision !== null && orgStat.revision !== undefined) {
            newRevisions[orgStat.organizationId] = orgStat.revision;
          }
        }
        // Обновляем настройку в БД
        await updateSystemSettings({ iiko_last_revisions: newRevisions });
      }
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

    const responseData = {
      hasData: Boolean(data),
      keys: data ? Object.keys(data).slice(0, 20) : [],
      organizationStats: Array.isArray(data?.organizationStats) ? data.organizationStats : [],
      selectedCategoryIds: [...selectedCategoryIds],
      externalMenuId: useExternalMenuFilter ? externalMenuId : null,
      priceCategoryId: useExternalMenuFilter && priceCategoryId ? priceCategoryId : null,
      externalMenuItemCount: useExternalMenuFilter ? externalMenuItemIds.size : null,
      synced: stats,
      revisions:
        data?.organizationStats?.reduce((acc, stat) => {
          if (stat.organizationId && stat.revision) acc[stat.organizationId] = stat.revision;
          return acc;
        }, {}) || {},
    };

    await finishIntegrationEvent(logId, {
      status: "success",
      responseData,
      durationMs: Date.now() - startedAt,
    });

    return data;
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
  const data = await client.getStopList({});
  let updatedCount = 0;

  if (branchId) {
    const rawEntities = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.stop_list)
          ? data.stop_list
          : [];

    for (const entity of rawEntities) {
      const externalId = String(entity.id || entity.item_id || entity.variant_id || "");
      if (!externalId) continue;

      let localType = "item";
      let localId = null;

      const [itemRows] = await db.query("SELECT id FROM menu_items WHERE iiko_item_id = ? LIMIT 1", [externalId]);
      if (itemRows.length > 0) {
        localType = "item";
        localId = itemRows[0].id;
      } else {
        const [variantRows] = await db.query("SELECT id FROM item_variants WHERE iiko_variant_id = ? LIMIT 1", [externalId]);
        if (variantRows.length > 0) {
          localType = "variant";
          localId = variantRows[0].id;
        }
      }

      if (!localId) continue;

      await db.query(
        `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, reason, created_by)\n         VALUES (?, ?, ?, ?, NULL)\n         ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
        [branchId, localType, localId, "Синхронизация стоп-листа из iiko"],
      );
      updatedCount += 1;
    }
  }

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.STOPLIST,
    action: "sync_stoplist",
    status: "success",
    requestData: { reason, branchId },
    responseData: {
      hasData: Boolean(data),
      keys: data ? Object.keys(data).slice(0, 20) : [],
      updatedCount,
    },
    durationMs: Date.now() - startedAt,
  });

  return data;
}

function normalizeIikoTerminalGroupId(value) {
  return String(value || "").trim();
}

function normalizeZoneName(value) {
  return String(value || "").trim();
}

function normalizeZoneCoordinates(rawCoordinates) {
  if (!Array.isArray(rawCoordinates)) return null;

  const points = rawCoordinates
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const lat = Number(point[0]);
        const lon = Number(point[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return [lon, lat];
      }

      const lat = Number(point?.latitude);
      const lon = Number(point?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return [lon, lat];
    })
    .filter(Boolean);

  if (points.length < 3) return null;

  const [firstLon, firstLat] = points[0];
  const [lastLon, lastLat] = points[points.length - 1];
  if (firstLon !== lastLon || firstLat !== lastLat) {
    points.push([firstLon, firstLat]);
  }

  if (points.length < 4) return null;
  return points;
}

function coordinatesToWkt(points) {
  const coordinates = points.map(([lon, lat]) => `${lon} ${lat}`).join(", ");
  return `POLYGON((${coordinates}))`;
}

function buildIikoPolygonExternalId({ organizationId, terminalGroupId, zoneName }) {
  return createHash("sha1").update(`${organizationId}::${terminalGroupId}::${zoneName}`).digest("hex");
}

export async function processIikoDeliveryZonesSync(reason = "manual") {
  const settings = await getIntegrationSettings();
  if (!settings.iikoEnabled) return null;
  const client = await getIikoClientOrNull();
  if (!client) return null;

  const startedAt = Date.now();
  const response = await client.getDeliveryZones({ organizationId: settings.iikoOrganizationId });

  const [branches] = await db.query(
    `SELECT id, iiko_terminal_group_id
     FROM branches
     WHERE iiko_terminal_group_id IS NOT NULL
       AND iiko_terminal_group_id <> ''`,
  );

  const branchByTerminalGroupId = new Map();
  for (const branch of branches) {
    const terminalGroupId = normalizeIikoTerminalGroupId(branch.iiko_terminal_group_id);
    if (!terminalGroupId) continue;
    branchByTerminalGroupId.set(terminalGroupId, Number(branch.id));
  }

  const mappedBranchIds = [...new Set([...branchByTerminalGroupId.values()])];
  const deliveryRestrictions = Array.isArray(response?.deliveryRestrictions) ? response.deliveryRestrictions : [];

  const polygonsByExternalId = new Map();
  let skippedRestrictions = 0;

  for (const organizationRestrictions of deliveryRestrictions) {
    const organizationId = String(organizationRestrictions?.organizationId || "").trim();
    const zones = Array.isArray(organizationRestrictions?.deliveryZones) ? organizationRestrictions.deliveryZones : [];
    const restrictions = Array.isArray(organizationRestrictions?.restrictions) ? organizationRestrictions.restrictions : [];

    const zoneByName = new Map();
    for (const zone of zones) {
      const zoneName = normalizeZoneName(zone?.name);
      if (!zoneName) continue;
      const normalizedCoordinates = normalizeZoneCoordinates(zone?.coordinates);
      if (!normalizedCoordinates) continue;
      zoneByName.set(zoneName, {
        zoneName,
        coordinates: normalizedCoordinates,
      });
    }

    for (const restriction of restrictions) {
      const terminalGroupId = normalizeIikoTerminalGroupId(restriction?.terminalGroupId);
      const zoneName = normalizeZoneName(restriction?.zone);
      const branchId = branchByTerminalGroupId.get(terminalGroupId);
      const zone = zoneByName.get(zoneName);
      if (!branchId || !zone) {
        skippedRestrictions += 1;
        continue;
      }

      const minSumRaw = Number(restriction?.minSum);
      const minOrderAmount = Number.isFinite(minSumRaw) ? Math.max(0, minSumRaw) : 0;
      const durationRaw = Number(restriction?.deliveryDurationInMinutes);
      const deliveryTime = Number.isFinite(durationRaw) ? Math.max(1, Math.trunc(durationRaw)) : 30;
      const externalId = buildIikoPolygonExternalId({ organizationId, terminalGroupId, zoneName });
      const existing = polygonsByExternalId.get(externalId);

      if (!existing) {
        polygonsByExternalId.set(externalId, {
          externalId,
          branchId,
          name: zone.zoneName,
          iikoTerminalGroupId: terminalGroupId,
          deliveryTime,
          minOrderAmount,
          wkt: coordinatesToWkt(zone.coordinates),
        });
        continue;
      }

      existing.minOrderAmount = Math.min(existing.minOrderAmount, minOrderAmount);
      existing.deliveryTime = Math.min(existing.deliveryTime, deliveryTime);
    }
  }

  const polygonsToSync = [...polygonsByExternalId.values()];
  let createdCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (mappedBranchIds.length > 0) {
      const placeholders = mappedBranchIds.map(() => "?").join(",");
      const [deactivatedResult] = await connection.query(
        `UPDATE delivery_polygons
         SET is_active = 0
         WHERE source = 'iiko'
           AND branch_id IN (${placeholders})
           AND is_active = 1`,
        mappedBranchIds,
      );
      deactivatedCount = Number(deactivatedResult?.affectedRows || 0);
    }

    for (const polygon of polygonsToSync) {
      const [existingRows] = await connection.query(
        `SELECT id
         FROM delivery_polygons
         WHERE source = 'iiko' AND external_id = ?
         LIMIT 1`,
        [polygon.externalId],
      );
      const existed = existingRows.length > 0;

      await connection.query(
        `INSERT INTO delivery_polygons
           (branch_id, name, source, external_id, iiko_terminal_group_id, polygon, delivery_time, min_order_amount, delivery_cost, is_active)
         VALUES (?, ?, 'iiko', ?, ?, ST_GeomFromText(?, 4326), ?, ?, 0, 1)
         ON DUPLICATE KEY UPDATE
           branch_id = VALUES(branch_id),
           name = VALUES(name),
           iiko_terminal_group_id = VALUES(iiko_terminal_group_id),
           polygon = VALUES(polygon),
           delivery_time = VALUES(delivery_time),
           min_order_amount = VALUES(min_order_amount),
           delivery_cost = 0,
           is_active = 1,
           is_blocked = 0,
           blocked_from = NULL,
           blocked_until = NULL,
           block_reason = NULL,
           blocked_by = NULL,
           blocked_at = NULL`,
        [polygon.branchId, polygon.name || null, polygon.externalId, polygon.iikoTerminalGroupId, polygon.wkt, polygon.deliveryTime, polygon.minOrderAmount],
      );

      if (existed) updatedCount += 1;
      else createdCount += 1;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.DELIVERY_ZONES,
    action: "sync_delivery_zones",
    status: "success",
    requestData: { reason },
    responseData: {
      hasData: Boolean(response),
      keys: response ? Object.keys(response).slice(0, 20) : [],
      mappedBranches: mappedBranchIds.length,
      syncedPolygons: polygonsToSync.length,
      createdCount,
      updatedCount,
      deactivatedCount,
      skippedRestrictions,
    },
    durationMs: Date.now() - startedAt,
  });

  return {
    response,
    stats: {
      mappedBranches: mappedBranchIds.length,
      syncedPolygons: polygonsToSync.length,
      createdCount,
      updatedCount,
      deactivatedCount,
      skippedRestrictions,
    },
  };
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
    `SELECT id FROM orders
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
      await processPremiumBonusPurchaseSync(row.id, "create", "retry");
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
