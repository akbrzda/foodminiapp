/**
 * Утилиты для создания ошибок с HTTP статусами
 */

/**
 * Создает ошибку с заданным статусом
 * @param {number} status - HTTP статус код
 * @param {string} message - Сообщение об ошибке
 * @returns {Error} Ошибка с установленным статусом
 */
export const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

/**
 * Создает ошибку 400 Bad Request
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const badRequest = (message = "Bad Request") => {
  return createError(400, message);
};

/**
 * Создает ошибку 401 Unauthorized
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const unauthorized = (message = "Unauthorized") => {
  return createError(401, message);
};

/**
 * Создает ошибку 403 Forbidden
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const forbidden = (message = "Forbidden") => {
  return createError(403, message);
};

/**
 * Создает ошибку 404 Not Found
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const notFound = (message = "Not Found") => {
  return createError(404, message);
};

/**
 * Создает ошибку 409 Conflict
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const conflict = (message = "Conflict") => {
  return createError(409, message);
};

/**
 * Создает ошибку 422 Unprocessable Entity
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const unprocessableEntity = (message = "Unprocessable Entity") => {
  return createError(422, message);
};

/**
 * Создает ошибку 500 Internal Server Error
 * @param {string} message - Сообщение об ошибке
 * @returns {Error}
 */
export const internalError = (message = "Internal Server Error") => {
  return createError(500, message);
};
