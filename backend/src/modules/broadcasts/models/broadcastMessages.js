import db from "../../../config/database.js";

export async function insertMessages(messages, executor = db) {
  if (!messages.length) return { insertId: null, affectedRows: 0 };
  const values = messages.map((message) => [
    message.campaign_id,
    message.user_id,
    message.status || "pending",
    message.telegram_message_id || null,
    message.personalized_text,
    message.scheduled_at || null,
    message.sent_at || null,
    message.error_message || null,
    message.retry_count || 0,
  ]);
  const [result] = await executor.query(
    `INSERT INTO broadcast_messages
     (campaign_id, user_id, status, telegram_message_id, personalized_text, scheduled_at, sent_at, error_message, retry_count)
     VALUES ?`,
    [values],
  );
  return result;
}

export async function updateMessageStatus(messageId, status, payload = {}, executor = db) {
  const updates = ["status = ?"];
  const values = [status];
  if (payload.telegram_message_id !== undefined) {
    updates.push("telegram_message_id = ?");
    values.push(payload.telegram_message_id || null);
  }
  if (payload.sent_at !== undefined) {
    updates.push("sent_at = ?");
    values.push(payload.sent_at || null);
  }
  if (payload.error_message !== undefined) {
    updates.push("error_message = ?");
    values.push(payload.error_message || null);
  }
  if (payload.retry_count !== undefined) {
    updates.push("retry_count = ?");
    values.push(payload.retry_count);
  }
  values.push(messageId);
  await executor.query(`UPDATE broadcast_messages SET ${updates.join(", ")} WHERE id = ?`, values);
}

export async function countPendingMessages(campaignId, executor = db) {
  const [rows] = await executor.query(
    `SELECT COUNT(*) as total
     FROM broadcast_messages
     WHERE campaign_id = ?
       AND status IN ('pending','sending')`,
    [campaignId],
  );
  return Number(rows[0]?.total || 0);
}

export default {
  insertMessages,
  updateMessageStatus,
  countPendingMessages,
};
