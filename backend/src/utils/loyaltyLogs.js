import db from "../config/database.js";

export async function logLoyaltyEvent({
  eventType,
  severity = "info",
  userId = null,
  orderId = null,
  transactionId = null,
  message,
  details = null,
} = {}) {
  try {
    await db.query(
      `INSERT INTO loyalty_logs
       (event_type, severity, user_id, order_id, transaction_id, message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [eventType, severity, userId, orderId, transactionId, message, details ? JSON.stringify(details) : null],
    );
  } catch (error) {
    console.error("Не удалось записать лог лояльности:", error);
  }
}

export default {
  logLoyaltyEvent,
};
