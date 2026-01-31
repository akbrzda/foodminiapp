import db from "../../../config/database.js";

export async function insertTriggerLogs(entries, executor = db) {
  if (!entries.length) return { affectedRows: 0 };
  const values = entries.map((entry) => [entry.campaign_id, entry.user_id, entry.trigger_date]);
  const [result] = await executor.query(
    `INSERT IGNORE INTO broadcast_trigger_log (campaign_id, user_id, trigger_date)
     VALUES ?`,
    [values],
  );
  return result;
}

export default {
  insertTriggerLogs,
};
