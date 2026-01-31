import db from "../../../config/database.js";
import {
  createSegment,
  updateSegment,
  updateSegmentEstimate,
  deleteSegment,
  getSegmentById,
  listSegments,
} from "../models/broadcastSegments.js";
import {
  getCachedSegmentSize,
  setCachedSegmentSize,
  invalidateSegmentSize,
} from "../utils/cache.js";

const GROUP_OPERATORS = new Set(["AND", "OR"]);
const COMPARISON_OPERATORS = new Set(["=", "<", ">", "<=", ">=", "!=", "<>", "BETWEEN", "IN"]);
const ORDER_STATUSES = ["completed", "delivered"];

const normalizeGroupOperator = (value) => {
  const operator = String(value || "AND").toUpperCase();
  return GROUP_OPERATORS.has(operator) ? operator : "AND";
};

const normalizeComparisonOperator = (value, fallback = "=") => {
  const operator = String(value || fallback).toUpperCase();
  if (!COMPARISON_OPERATORS.has(operator)) {
    throw new Error(`Недопустимый оператор сравнения: ${operator}`);
  }
  return operator;
};

const ensureNumber = (value, fallback = null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

const resolveDateRange = (condition) => {
  const source = condition?.value && typeof condition.value === "object" ? condition.value : condition || {};
  const dateFrom = source.date_from || source.from || source.start;
  const dateTo = source.date_to || source.to || source.end;
  if (!dateFrom || !dateTo) {
    throw new Error("Не указан диапазон дат для условия сегментации");
  }
  return { dateFrom, dateTo };
};

const buildBetweenCondition = (expression, value, params) => {
  const values = Array.isArray(value) ? value : [value?.from ?? value?.date_from, value?.to ?? value?.date_to];
  const [from, to] = values;
  if (from === undefined || to === undefined) {
    throw new Error("Некорректный диапазон BETWEEN для условия сегментации");
  }
  params.push(from, to);
  return `${expression} BETWEEN ? AND ?`;
};

const buildInCondition = (expression, value, params) => {
  const values = ensureArray(value).filter((item) => item !== undefined && item !== null);
  if (!values.length) {
    throw new Error("Пустой список значений для IN условия сегментации");
  }
  params.push(...values);
  return `${expression} IN (${values.map(() => "?").join(", ")})`;
};

const buildComparison = (expression, operator, value, params) => {
  const normalized = normalizeComparisonOperator(operator);
  if (normalized === "BETWEEN") {
    return buildBetweenCondition(expression, value, params);
  }
  if (normalized === "IN") {
    return buildInCondition(expression, value, params);
  }
  const numericValue = ensureNumber(value, null);
  const normalizedValue = numericValue === null ? value : numericValue;
  if (normalizedValue === undefined || normalizedValue === null) {
    throw new Error("Не указано значение для условия сегментации");
  }
  params.push(normalizedValue);
  return `${expression} ${normalized} ?`;
};

const buildCityCondition = (condition, params) => {
  const operator = normalizeComparisonOperator(condition.operator, "=");
  if (!["=", "IN"].includes(operator)) {
    throw new Error("Для условия city допускаются только операторы '=' или 'IN'");
  }
  const selectedCityExpr = "MAX(us.selected_city_id)";
  if (operator === "IN") {
    const inSql = buildInCondition(selectedCityExpr, condition.value, params);
    const values = ensureArray(condition.value).filter((item) => item !== undefined && item !== null);
    params.push(...values);
    const orderExpr = `SUM(CASE WHEN o.city_id IN (${values.map(() => "?").join(", ")}) THEN 1 ELSE 0 END) > 0`;
    return `(${inSql} OR ${orderExpr})`;
  }
  const compareSql = buildComparison(selectedCityExpr, operator, condition.value, params);
  params.push(condition.value);
  const orderExpr = "SUM(CASE WHEN o.city_id = ? THEN 1 ELSE 0 END) > 0";
  return `(${compareSql} OR ${orderExpr})`;
};

const buildBranchCondition = (condition, params) => {
  const operator = normalizeComparisonOperator(condition.operator, "=");
  if (!["=", "IN"].includes(operator)) {
    throw new Error("Для условия branch допускаются только операторы '=' или 'IN'");
  }
  if (operator === "IN") {
    const values = ensureArray(condition.value).filter((item) => item !== undefined && item !== null);
    if (!values.length) {
      throw new Error("Пустой список филиалов для сегментации");
    }
    params.push(...values);
    return `SUM(CASE WHEN o.branch_id IN (${values.map(() => "?").join(", ")}) THEN 1 ELSE 0 END) > 0`;
  }
  params.push(condition.value);
  return "SUM(CASE WHEN o.branch_id = ? THEN 1 ELSE 0 END) > 0";
};

const buildBirthdayMonthCondition = (condition, params) => {
  const operator = normalizeComparisonOperator(condition.operator, "=");
  const expression = "MONTH(MAX(u.date_of_birth))";
  return buildComparison(expression, operator, condition.value, params);
};

const buildCondition = (condition, params) => {
  if (!condition || typeof condition !== "object") {
    throw new Error("Условие сегментации должно быть объектом");
  }
  if (Array.isArray(condition.conditions)) {
    return buildConditionGroup(condition, params);
  }
  if (!condition.type) {
    throw new Error("Не указан тип условия сегментации");
  }
  const type = String(condition.type);
  switch (type) {
    case "inactive_days": {
      const operator = normalizeComparisonOperator(condition.operator, ">=");
      const expression = `DATEDIFF(CURDATE(), COALESCE(MAX(CASE WHEN o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")}) THEN o.created_at END), MAX(u.created_at)))`;
      params.push(...ORDER_STATUSES);
      return buildComparison(expression, operator, condition.value, params);
    }
    case "active_in_period": {
      const { dateFrom, dateTo } = resolveDateRange(condition);
      const operator = normalizeComparisonOperator(condition.operator, ">=");
      const threshold = ensureNumber(condition.value ?? 1, 1);
      const expression = `SUM(CASE WHEN o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")}) AND o.created_at BETWEEN ? AND ? THEN 1 ELSE 0 END)`;
      params.push(...ORDER_STATUSES, dateFrom, dateTo);
      return buildComparison(expression, operator, threshold, params);
    }
    case "new_users": {
      const { dateFrom, dateTo } = resolveDateRange(condition);
      params.push(dateFrom, dateTo);
      return "MAX(u.created_at) BETWEEN ? AND ?";
    }
    case "total_spent": {
      const expression = `SUM(CASE WHEN o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")}) THEN o.total ELSE 0 END)`;
      params.push(...ORDER_STATUSES);
      return buildComparison(expression, condition.operator, condition.value, params);
    }
    case "avg_check": {
      const expression = `AVG(CASE WHEN o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")}) THEN o.total ELSE NULL END)`;
      params.push(...ORDER_STATUSES);
      return buildComparison(expression, condition.operator, condition.value, params);
    }
    case "order_count": {
      const expression = `SUM(CASE WHEN o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")}) THEN 1 ELSE 0 END)`;
      params.push(...ORDER_STATUSES);
      return buildComparison(expression, condition.operator, condition.value, params);
    }
    case "city": {
      return buildCityCondition(condition, params);
    }
    case "branch": {
      return buildBranchCondition(condition, params);
    }
    case "birthday_month": {
      return buildBirthdayMonthCondition(condition, params);
    }
    case "birthday_range": {
      const { dateFrom, dateTo } = resolveDateRange(condition);
      params.push(dateFrom, dateTo);
      return "MAX(u.date_of_birth) BETWEEN ? AND ?";
    }
    case "loyalty_level": {
      const expression = "MAX(u.current_loyalty_level_id)";
      return buildComparison(expression, condition.operator, condition.value, params);
    }
    case "bonus_balance": {
      const expression = "MAX(u.loyalty_balance)";
      return buildComparison(expression, condition.operator, condition.value, params);
    }
    default:
      throw new Error(`Неизвестный тип условия сегментации: ${type}`);
  }
};

const buildConditionGroup = (group, params) => {
  const operator = normalizeGroupOperator(group.operator);
  const conditions = Array.isArray(group.conditions) ? group.conditions : [];
  if (!conditions.length) {
    throw new Error("Группа условий сегментации пустая");
  }
  const parts = conditions.map((item) => {
    const sql = buildCondition(item, params);
    return `(${sql})`;
  });
  return parts.join(` ${operator} `);
};

const normalizeSegmentConfig = (config) => {
  if (!config || typeof config !== "object") {
    throw new Error("Конфигурация сегментации должна быть объектом");
  }
  if (!Array.isArray(config.conditions) || !config.conditions.length) {
    throw new Error("В конфигурации сегментации отсутствуют условия");
  }
  return config;
};

export const buildSegmentQuery = (config, { select = "u.id" } = {}) => {
  const normalizedConfig = normalizeSegmentConfig(config);
  const params = [];
  const havingSql = buildConditionGroup(normalizedConfig, params);
  const sql = `
    SELECT ${select}
    FROM users u
    LEFT JOIN user_states us ON us.user_id = u.id
    LEFT JOIN orders o ON o.user_id = u.id
    GROUP BY u.id
    HAVING ${havingSql}
  `;
  return { sql, params };
};

export async function calculateSegmentSize(config, { segmentId, useCache = true, refreshCache = false } = {}) {
  if (segmentId && useCache && !refreshCache) {
    const cached = await getCachedSegmentSize(segmentId);
    if (cached !== null) {
      return cached;
    }
  }
  const { sql, params } = buildSegmentQuery(config, { select: "u.id" });
  const countSql = `SELECT COUNT(*) as total FROM (${sql}) as segment`;
  const [rows] = await db.query(countSql, params);
  const total = Number(rows[0]?.total || 0);
  if (segmentId) {
    await updateSegmentEstimate(segmentId, total, new Date());
    await setCachedSegmentSize(segmentId, total);
  }
  return total;
}

export async function createSegmentWithEstimate(payload) {
  const segmentId = await createSegment(payload);
  const estimatedSize = await calculateSegmentSize(payload.config, { segmentId, refreshCache: true });
  return { id: segmentId, estimated_size: estimatedSize };
}

export async function updateSegmentWithEstimate(segmentId, payload) {
  await updateSegment(segmentId, payload);
  await invalidateSegmentSize(segmentId);
  if (payload.config) {
    await calculateSegmentSize(payload.config, { segmentId, refreshCache: true });
  }
  return getSegmentById(segmentId);
}

export async function deleteSegmentWithCache(segmentId) {
  await deleteSegment(segmentId);
  await invalidateSegmentSize(segmentId);
}

export { getSegmentById, listSegments };

export default {
  buildSegmentQuery,
  calculateSegmentSize,
  createSegmentWithEstimate,
  updateSegmentWithEstimate,
  deleteSegmentWithCache,
  getSegmentById,
  listSegments,
};
