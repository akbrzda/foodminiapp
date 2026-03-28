export function parseIntParam(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

export function validateCalculateMaxSpendQuery(query = {}) {
  const orderTotal = Number(query.orderTotal);
  const deliveryCost = Number(query.deliveryCost) || 0;
  if (!Number.isFinite(orderTotal)) {
    return { error: "orderTotal обязателен и должен быть числом" };
  }
  return { value: { orderTotal, deliveryCost } };
}

export function validateHistoryQuery(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 50));
  return { value: { page, limit } };
}

export function validateToggleBody(body = {}) {
  const { enabled } = body;
  if (typeof enabled !== "boolean") {
    return { error: "enabled должен быть булевым" };
  }
  return { value: { enabled } };
}

export function validateAdjustBody(body = {}) {
  const parsedUserId = Number(body.user_id);
  if (!Number.isInteger(parsedUserId)) {
    return { error: "user_id обязателен" };
  }
  if (!body.reason || typeof body.reason !== "string" || !body.reason.trim()) {
    return { error: "Причина корректировки обязательна" };
  }
  const numericAmount = Number(body.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { error: "Сумма должна быть положительным числом" };
  }
  if (!body.type || !["earn", "spend"].includes(body.type)) {
    return { error: "type должен быть earn или spend" };
  }
  return {
    value: {
      userId: parsedUserId,
      amount: numericAmount,
      reason: body.reason.trim(),
      type: body.type,
    },
  };
}

export function validateBulkAccrualCalculateBody(body = {}) {
  const config = body.segment_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { error: "segment_config обязателен и должен быть объектом" };
  }
  if (!Array.isArray(config.conditions) || config.conditions.length === 0) {
    return { error: "segment_config.conditions должен содержать хотя бы одно условие" };
  }
  return { value: { segmentConfig: config } };
}

export function validateBulkAccrualCreateBody(body = {}) {
  const parsedAmount = Number(body.bonus_amount);
  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    return { error: "bonus_amount должен быть положительным целым числом" };
  }

  const config = body.segment_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { error: "segment_config обязателен и должен быть объектом" };
  }
  if (!Array.isArray(config.conditions) || config.conditions.length === 0) {
    return { error: "segment_config.conditions должен содержать хотя бы одно условие" };
  }

  const rawName = String(body.name || "").trim();
  const name = rawName || `Массовое начисление ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  const messageTemplate = String(body.message_template || "").trim();

  return {
    value: {
      name,
      bonusAmount: parsedAmount,
      segmentConfig: config,
      messageTemplate,
    },
  };
}
