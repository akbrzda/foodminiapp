import { logger } from "./logger.js";

/**
 * Вычисляет статус списания бонусов на основе транзакций
 * @param {Array} transactions - Массив транзакций списания
 * @returns {Object} Объект со статусами
 */
export function calculateBonusSpendStatus(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      hasPending: false,
      hasCompleted: false,
      allCancelled: false,
      status: null,
    };
  }

  const hasPending = transactions.some((row) => row.status === "pending");
  const hasCompleted = transactions.some((row) => row.status === "completed");
  const allCancelled = transactions.every((row) => row.status === "cancelled");

  let status = null;
  if (allCancelled) {
    status = "cancelled";
  } else if (hasPending) {
    status = "pending";
  } else if (hasCompleted) {
    status = "completed";
  }

  return { hasPending, hasCompleted, allCancelled, status };
}

/**
 * Вычисляет статус начисления бонусов на основе транзакций
 * @param {Array} transactions - Массив транзакций начисления
 * @returns {Object} Объект со статусами
 */
export function calculateBonusEarnStatus(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      hasPending: false,
      hasCompleted: false,
      allCancelled: false,
      status: null,
      amount: 0,
    };
  }

  const hasPending = transactions.some((row) => row.status === "pending");
  const hasCompleted = transactions.some((row) => row.status === "completed");
  const allCancelled = transactions.every((row) => row.status === "cancelled");

  const amount = transactions.filter((tx) => tx.status !== "cancelled").reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

  let status = null;
  if (allCancelled) {
    status = "cancelled";
  } else if (hasPending) {
    status = "pending";
  } else if (hasCompleted) {
    status = "completed";
  }

  return { hasPending, hasCompleted, allCancelled, status, amount };
}

/**
 * Безопасное логирование ошибки
 * @param {string} message - Сообщение об ошибке
 * @param {Error|any} error - Объект ошибки
 * @param {Object} context - Дополнительный контекст
 */
export function logError(message, error, context = {}) {
  logger.error(message, {
    error: error?.message || error,
    stack: error?.stack,
    ...context,
  });
}

/**
 * Безопасное логирование предупреждения
 * @param {string} message - Сообщение
 * @param {Object} context - Контекст
 */
export function logWarning(message, context = {}) {
  logger.warn(message, context);
}

/**
 * Безопасное логирование информации
 * @param {string} message - Сообщение
 * @param {Object} context - Контекст
 */
export function logInfo(message, context = {}) {
  logger.info(message, context);
}
