import { Worker } from "bullmq";
import db from "../config/database.js";
import { sendNotificationToUser } from "../modules/notifications/services/userNotificationService.js";
import { isOrderRatingWindowOpen } from "../modules/orders/services/orderRatingReminderService.js";
import { buildMiniAppOrderUrl, buildOrderDetailsReplyMarkup } from "../utils/telegram.js";
import { logger } from "../utils/logger.js";
import { BULLMQ_WORKER_OPTIONS } from "./bullmqWorkerOptions.js";

const QUEUE_NAME = "order-rating-reminders";

const buildReminderMessage = (orderNumber, orderId) => {
  const orderUrl = buildMiniAppOrderUrl(orderId);
  if (orderUrl) {
    return `⭐ Напоминание по заказу #${orderNumber}\n\nПожалуйста, оцените заказ. Это займет пару секунд.\nОценку можно поставить в течение 24 часов после закрытия заказа.\n\n${orderUrl}`;
  }

  return `⭐ Напоминание по заказу #${orderNumber}\n\nПожалуйста, оцените заказ. Это займет пару секунд.\nОценку можно поставить в течение 24 часов после закрытия заказа.`;
};

const processOrderRatingReminder = async (job) => {
  const orderId = Number(job?.data?.orderId);
  const fallbackUserId = Number(job?.data?.userId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("orderId обязателен для напоминания об оценке");
  }

  const [rows] = await db.query(
    `SELECT o.id, o.user_id, o.status, o.order_number, o.completed_at,
            r.id as rating_id
     FROM orders o
     LEFT JOIN order_ratings r ON r.order_id = o.id
     WHERE o.id = ?
     LIMIT 1`,
    [orderId],
  );

  const order = rows[0] || null;
  if (!order) {
    return { skipped: true, reason: "order_not_found" };
  }

  if (order.rating_id) {
    return { skipped: true, reason: "already_rated" };
  }

  if (order.status !== "completed" || !order.completed_at) {
    return { skipped: true, reason: "order_not_completed" };
  }

  if (!isOrderRatingWindowOpen(order.completed_at)) {
    return { skipped: true, reason: "rating_window_expired" };
  }

  const userId = Number(order.user_id) || fallbackUserId;
  if (!Number.isInteger(userId) || userId <= 0) {
    return { skipped: true, reason: "invalid_user_id" };
  }

  const message = buildReminderMessage(order.order_number, order.id);
  const replyMarkup = buildOrderDetailsReplyMarkup(order.id, "Оценить заказ");

  await sendNotificationToUser({
    userId,
    message,
    replyMarkup,
  });

  return { ok: true, orderId: order.id, userId };
};

export function createOrderRatingReminderWorker(connection) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      return processOrderRatingReminder(job);
    },
    { connection, concurrency: 5, ...BULLMQ_WORKER_OPTIONS },
  );

  worker.on("failed", (job, err) => {
    logger.error("Ошибка worker напоминаний об оценке заказа", {
      jobId: job?.id,
      error: err?.message || String(err),
    });
  });

  return worker;
}

export default {
  createOrderRatingReminderWorker,
};
