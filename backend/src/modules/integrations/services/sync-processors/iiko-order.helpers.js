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
    const offsetMinutes = Number.isFinite(Number(userTimezoneOffset))
      ? Number(userTimezoneOffset)
      : 0;
    const utcTimestamp =
      Date.UTC(year, month - 1, day, hours, minutes, seconds, 0) + offsetMinutes * 60 * 1000;
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

export function resolveCompleteBefore(order) {
  const desired = parseDesiredTime(order?.desired_time, order?.user_timezone_offset);
  if (!desired) return null;
  return formatDateTimeForIiko(desired, order?.city_timezone);
}

export function resolveDeliveryPoint(order) {
  const isDelivery =
    String(order?.order_type || "")
      .trim()
      .toLowerCase() === "delivery";
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

export function resolveOrderTypePayload(orderType, settings) {
  const localOrderType = String(orderType || "")
    .trim()
    .toLowerCase();
  const mapping = settings?.iikoOrderTypeMapping?.[localOrderType] || {};
  const mappedOrderTypeId = String(mapping.orderTypeId || "").trim();
  const mappedOrderServiceType = String(mapping.orderServiceType || "").trim();
  const fallbackOrderServiceType =
    DEFAULT_ORDER_SERVICE_TYPE_BY_LOCAL_TYPE[localOrderType] || "DeliveryByCourier";

  if (mappedOrderTypeId) {
    return { orderTypeId: mappedOrderTypeId };
  }

  return {
    orderServiceType: ALLOWED_ORDER_SERVICE_TYPES.has(mappedOrderServiceType)
      ? mappedOrderServiceType
      : fallbackOrderServiceType,
  };
}

export function resolveCommentWithCashChange(order) {
  const baseComment = String(order?.comment || "").trim();
  const paymentMethod = String(order?.payment_method || "")
    .trim()
    .toLowerCase();
  if (paymentMethod !== "cash") {
    return baseComment || null;
  }

  const changeFrom = Number(order?.change_from);
  const cashLine =
    Number.isFinite(changeFrom) && changeFrom > 0 ? `Сдача с: ${changeFrom}` : "Без сдачи";

  if (!baseComment) return cashLine;
  return `${baseComment}\n${cashLine}`;
}

export function resolvePaymentPayload(order, settings, terminalGroupId) {
  const localPaymentMethod = String(order?.payment_method || "")
    .trim()
    .toLowerCase();
  const mapping = settings?.iikoPaymentTypeMapping?.[localPaymentMethod] || {};
  const paymentTypeId = String(mapping.paymentTypeId || "").trim();
  if (!paymentTypeId) return null;

  const sum = Number(order?.total);
  if (!Number.isFinite(sum) || sum < 0) {
    return null;
  }

  const paymentTypeKind =
    String(mapping.paymentTypeKind || "").trim() ||
    DEFAULT_PAYMENT_KIND_BY_LOCAL_METHOD[localPaymentMethod] ||
    "Cash";
  const paymentProcessingType = String(mapping.paymentProcessingType || "")
    .trim()
    .toLowerCase();
  const mappedTerminalGroups = Array.isArray(mapping.terminalGroupIds)
    ? mapping.terminalGroupIds
    : [];

  if (
    mappedTerminalGroups.length > 0 &&
    terminalGroupId &&
    !mappedTerminalGroups.includes(terminalGroupId)
  ) {
    throw new Error("Выбранный тип оплаты iiko недоступен для terminal group филиала");
  }

  let isProcessedExternally = mapping.isProcessedExternally === true;
  if (paymentProcessingType === "external" && !isProcessedExternally) {
    isProcessedExternally = true;
  }
  if (paymentProcessingType === "internal" && isProcessedExternally) {
    throw new Error(
      "Тип оплаты iiko поддерживает только внутреннюю обработку, external-флаг недопустим"
    );
  }

  const payments = [
    {
      paymentTypeKind,
      paymentTypeId,
      sum,
      isProcessedExternally,
    },
  ];

  const hasBonusDiscountType = String(settings?.iikoBonusDiscountTypeId || "").trim().length > 0;
  const bonusSpent = Number(order?.bonus_spent);
  const normalizedBonusSpent = Number.isFinite(bonusSpent) ? Number(bonusSpent.toFixed(2)) : 0;
  if (normalizedBonusSpent > 0 && !hasBonusDiscountType) {
    const bonusMapping = settings?.iikoPaymentTypeMapping?.bonus || {};
    const bonusPaymentTypeId = String(bonusMapping.paymentTypeId || "").trim();
    if (bonusPaymentTypeId) {
      const bonusPaymentTypeKind = String(bonusMapping.paymentTypeKind || "").trim() || "Card";
      const bonusProcessingType = String(bonusMapping.paymentProcessingType || "")
        .trim()
        .toLowerCase();
      const bonusMappedTerminalGroups = Array.isArray(bonusMapping.terminalGroupIds)
        ? bonusMapping.terminalGroupIds
        : [];

      if (
        bonusMappedTerminalGroups.length > 0 &&
        terminalGroupId &&
        !bonusMappedTerminalGroups.includes(terminalGroupId)
      ) {
        throw new Error("Бонусный тип оплаты iiko недоступен для terminal group филиала");
      }

      let bonusIsProcessedExternally = bonusMapping.isProcessedExternally === true;
      if (bonusProcessingType === "external" && !bonusIsProcessedExternally) {
        bonusIsProcessedExternally = true;
      }
      if (bonusProcessingType === "internal" && bonusIsProcessedExternally) {
        throw new Error(
          "Бонусный тип оплаты iiko поддерживает только внутреннюю обработку, external-флаг недопустим"
        );
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

export function resolveDiscountsInfoPayload(order, settings) {
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
    const state = String(statusPayload?.state || "")
      .trim()
      .toLowerCase();
    if (state === "success") return { state: "success" };
    if (state === "error") {
      const reason =
        statusPayload?.errorReason || statusPayload?.exception || "Команда завершилась ошибкой";
      throw new Error(`iiko commands/status: ${String(reason)}`);
    }
    if (attempt < COMMAND_STATUS_POLL_ATTEMPTS - 1) {
      await sleep(COMMAND_STATUS_POLL_DELAY_MS);
    }
  }

  return { state: "inprogress" };
}

export async function ensureIikoOrderVisible({
  client,
  organizationId,
  iikoOrderId,
  correlationId,
}) {
  await waitForCommandCompletion(client, organizationId, correlationId);
  let visible = false;

  for (let attempt = 0; attempt < ORDER_PRESENCE_POLL_ATTEMPTS; attempt += 1) {
    visible = await isOrderPresentInIiko(client, organizationId, iikoOrderId);
    if (visible) break;

    if (attempt < ORDER_PRESENCE_POLL_ATTEMPTS - 1) {
      await sleep(ORDER_PRESENCE_POLL_DELAY_MS);
    }
  }

  return visible;
}

export async function isExistingIikoOrderVisible({ client, organizationId, iikoOrderId }) {
  return isOrderPresentInIiko(client, organizationId, iikoOrderId);
}
