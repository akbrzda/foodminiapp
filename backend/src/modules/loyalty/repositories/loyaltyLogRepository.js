import db from "../../../config/database.js";

const getExecutor = (connection) => connection || db;

export async function logLoyaltyEvent(
  { eventType, userId = null, orderId = null, oldValue = null, newValue = null, metadata = null } = {},
  { connection = null } = {},
) {
  const executor = getExecutor(connection);
  const payload = [eventType, userId, orderId, oldValue, newValue, metadata ? JSON.stringify(metadata) : null];
  const query = `INSERT INTO loyalty_logs
       (event_type, user_id, order_id, old_value, new_value, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await executor.query(query, payload);
      return;
    } catch (error) {
      const isLockTimeout = error?.code === "ER_LOCK_WAIT_TIMEOUT";
      if (!isLockTimeout || attempt === 2) {
        console.error("Не удалось записать лог лояльности:", error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

export default {
  logLoyaltyEvent,
};
