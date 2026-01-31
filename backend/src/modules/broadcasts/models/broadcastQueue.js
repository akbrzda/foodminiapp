import db from "../../../config/database.js";

export async function insertQueueItems(items, executor = db) {
  if (!items.length) return { insertId: null, affectedRows: 0 };
  const values = items.map((item) => [item.message_id, item.priority || 0, item.scheduled_at || null]);
  const [result] = await executor.query(
    `INSERT INTO broadcast_queue (message_id, priority, scheduled_at)
     VALUES ?`,
    [values],
  );
  return result;
}

export async function deleteQueueItem(queueId, executor = db) {
  await executor.query("DELETE FROM broadcast_queue WHERE id = ?", [queueId]);
}

export async function updateQueueSchedule(queueId, scheduledAt, executor = db) {
  await executor.query(
    "UPDATE broadcast_queue SET scheduled_at = ?, locked_at = NULL, locked_by = NULL WHERE id = ?",
    [scheduledAt, queueId],
  );
}

export default {
  insertQueueItems,
  deleteQueueItem,
  updateQueueSchedule,
};
