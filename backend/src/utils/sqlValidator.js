/**
 * SQL Whitelist Validator
 * Защита от SQL инъекций при динамическом построении запросов
 */

// Белый список разрешенных таблиц
const ALLOWED_TABLES = [
  "users",
  "admin_users",
  "cities",
  "branches",
  "menu_categories",
  "menu_items",
  "item_variants",
  "modifier_groups",
  "modifiers",
  "orders",
  "order_items",
  "delivery_addresses",
  "admin_action_logs",
  "loyalty_levels",
  "loyalty_transactions",
  "menu_stop_list",
  "tags",
];

// Белый список разрешенных полей для сортировки
const ALLOWED_SORT_FIELDS = ["id", "name", "created_at", "updated_at", "sort_order", "price", "total", "status", "email", "role"];

// Белый список разрешенных направлений сортировки
const ALLOWED_SORT_DIRECTIONS = ["ASC", "DESC", "asc", "desc"];

// Белый список разрешенных операторов
const ALLOWED_OPERATORS = ["=", "!=", "<", ">", "<=", ">=", "LIKE", "IN", "NOT IN", "IS NULL", "IS NOT NULL"];

/**
 * Валидирует имя таблицы
 * @param {string} tableName - Имя таблицы
 * @throws {Error} Если таблица не в whitelist
 * @returns {string} Валидное имя таблицы
 */
export function validateTableName(tableName) {
  if (!tableName || typeof tableName !== "string") {
    throw new Error("Invalid table name");
  }

  const normalized = tableName.trim().toLowerCase();

  if (!ALLOWED_TABLES.includes(normalized)) {
    throw new Error(`Table '${tableName}' is not allowed`);
  }

  return normalized;
}

/**
 * Валидирует поле для сортировки
 * @param {string} field - Имя поля
 * @throws {Error} Если поле не в whitelist
 * @returns {string} Валидное имя поля
 */
export function validateSortField(field) {
  if (!field || typeof field !== "string") {
    throw new Error("Invalid sort field");
  }

  const normalized = field.trim().toLowerCase();

  if (!ALLOWED_SORT_FIELDS.includes(normalized)) {
    throw new Error(`Sort field '${field}' is not allowed`);
  }

  return normalized;
}

/**
 * Валидирует направление сортировки
 * @param {string} direction - Направление (ASC/DESC)
 * @throws {Error} Если направление не валидно
 * @returns {string} Валидное направление
 */
export function validateSortDirection(direction) {
  if (!direction || typeof direction !== "string") {
    return "ASC"; // По умолчанию
  }

  const normalized = direction.trim().toUpperCase();

  if (!ALLOWED_SORT_DIRECTIONS.includes(normalized)) {
    throw new Error(`Sort direction '${direction}' is not allowed`);
  }

  return normalized;
}

/**
 * Валидирует SQL оператор
 * @param {string} operator - SQL оператор
 * @throws {Error} Если оператор не в whitelist
 * @returns {string} Валидный оператор
 */
export function validateOperator(operator) {
  if (!operator || typeof operator !== "string") {
    throw new Error("Invalid operator");
  }

  const normalized = operator.trim().toUpperCase();

  if (!ALLOWED_OPERATORS.includes(normalized)) {
    throw new Error(`Operator '${operator}' is not allowed`);
  }

  return normalized;
}

/**
 * Валидирует имя колонки
 * @param {string} column - Имя колонки
 * @throws {Error} Если колонка содержит опасные символы
 * @returns {string} Валидное имя колонки
 */
export function validateColumnName(column) {
  if (!column || typeof column !== "string") {
    throw new Error("Invalid column name");
  }

  // Разрешаем только буквы, цифры, подчеркивания и точки (для table.column)
  const safePattern = /^[a-zA-Z0-9_.]+$/;

  if (!safePattern.test(column)) {
    throw new Error(`Column name '${column}' contains invalid characters`);
  }

  return column;
}

/**
 * Валидирует и строит безопасное ORDER BY выражение
 * @param {string} field - Поле для сортировки
 * @param {string} direction - Направление сортировки
 * @returns {string} Безопасное ORDER BY выражение
 */
export function buildSafeOrderBy(field, direction = "ASC") {
  const validField = validateSortField(field);
  const validDirection = validateSortDirection(direction);
  return `ORDER BY ${validField} ${validDirection}`;
}

/**
 * Экранирует идентификаторы для MySQL
 * @param {string} identifier - Идентификатор (таблица/колонка)
 * @returns {string} Экранированный идентификатор
 */
export function escapeIdentifier(identifier) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

/**
 * Валидирует LIMIT и OFFSET значения
 * @param {number} limit - Лимит
 * @param {number} offset - Смещение
 * @returns {Object} Валидные limit и offset
 */
export function validatePagination(limit, offset = 0) {
  const safeLimit = parseInt(limit);
  const safeOffset = parseInt(offset);

  if (isNaN(safeLimit) || safeLimit < 1 || safeLimit > 1000) {
    throw new Error("Invalid limit value (must be 1-1000)");
  }

  if (isNaN(safeOffset) || safeOffset < 0) {
    throw new Error("Invalid offset value");
  }

  return { limit: safeLimit, offset: safeOffset };
}
