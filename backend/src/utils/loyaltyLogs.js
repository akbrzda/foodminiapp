import db from "../config/database.js";

export async function logLoyaltyEvent({
  eventType,
  userId = null,
  orderId = null,
  oldValue = null,
  newValue = null,
  metadata = null,
} = {}) {
  try {
    await db.query(
      `INSERT INTO loyalty_logs
       (event_type, user_id, order_id, old_value, new_value, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventType, userId, orderId, oldValue, newValue, metadata ? JSON.stringify(metadata) : null],
    );
  } catch (error) {
    console.error("Не удалось записать лог лояльности:", error);
  }
}

export default {
  logLoyaltyEvent,
};
