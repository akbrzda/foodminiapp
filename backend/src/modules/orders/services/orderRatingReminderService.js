import { enqueueOrderRatingReminder } from "../../../queues/config.js";
import { logger } from "../../../utils/logger.js";

export const ORDER_RATING_WINDOW_HOURS = 24;
export const ORDER_RATING_REMINDER_DELAY_HOURS = 3;
export const ORDER_RATING_WINDOW_MS = ORDER_RATING_WINDOW_HOURS * 60 * 60 * 1000;
export const ORDER_RATING_REMINDER_DELAY_MS = ORDER_RATING_REMINDER_DELAY_HOURS * 60 * 60 * 1000;

export const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const getRatingWindowDeadline = (completedAt) => {
  const completedDate = normalizeDate(completedAt);
  if (!completedDate) return null;
  return new Date(completedDate.getTime() + ORDER_RATING_WINDOW_MS);
};

export const isOrderRatingWindowOpen = (completedAt, now = new Date()) => {
  const completedDate = normalizeDate(completedAt);
  if (!completedDate) return false;
  return now.getTime() <= completedDate.getTime() + ORDER_RATING_WINDOW_MS;
};

export const scheduleOrderRatingReminder = async ({ orderId, userId, orderNumber, completedAt }) => {
  const normalizedOrderId = Number(orderId);
  const normalizedUserId = Number(userId);

  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) {
    return { skipped: true, reason: "invalid_order_id" };
  }
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return { skipped: true, reason: "invalid_user_id" };
  }

  const completedDate = normalizeDate(completedAt);
  if (!completedDate) {
    return { skipped: true, reason: "invalid_completed_at" };
  }

  try {
    const job = await enqueueOrderRatingReminder({
      orderId: normalizedOrderId,
      userId: normalizedUserId,
      orderNumber: String(orderNumber || ""),
      completedAt: completedDate.toISOString(),
      delayMs: ORDER_RATING_REMINDER_DELAY_MS,
      priority: 2,
    });

    return {
      skipped: false,
      jobId: job?.id || null,
    };
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("Job is already waiting") || message.includes("Job already exists")) {
      return {
        skipped: true,
        reason: "job_already_exists",
      };
    }

    logger.error("Не удалось поставить напоминание об оценке заказа в очередь", {
      orderId: normalizedOrderId,
      userId: normalizedUserId,
      error: message || String(error),
    });

    return {
      skipped: true,
      reason: "queue_error",
    };
  }
};

export default {
  ORDER_RATING_WINDOW_HOURS,
  ORDER_RATING_REMINDER_DELAY_HOURS,
  ORDER_RATING_WINDOW_MS,
  ORDER_RATING_REMINDER_DELAY_MS,
  normalizeDate,
  getRatingWindowDeadline,
  isOrderRatingWindowOpen,
  scheduleOrderRatingReminder,
};
