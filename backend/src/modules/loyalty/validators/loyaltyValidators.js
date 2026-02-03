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
