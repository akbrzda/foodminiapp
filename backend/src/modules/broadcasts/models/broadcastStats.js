import db from "../../../config/database.js";

export async function upsertCampaignStats(campaignId, totalRecipients = 0, executor = db) {
  await executor.query(
    `INSERT INTO broadcast_stats (campaign_id, total_recipients, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       total_recipients = VALUES(total_recipients),
       updated_at = NOW()`,
    [campaignId, totalRecipients],
  );
}

export async function incrementCampaignStat(campaignId, field, delta, executor = db) {
  const allowed = new Set(["sent_count", "failed_count", "click_count", "unique_clicks", "conversion_count", "conversion_amount"]);
  if (!allowed.has(field)) {
    throw new Error(`Недопустимое поле статистики: ${field}`);
  }
  await executor.query(
    `UPDATE broadcast_stats
     SET ${field} = ${field} + ?, updated_at = NOW()
     WHERE campaign_id = ?`,
    [delta, campaignId],
  );
}

export async function incrementTotalRecipients(campaignId, delta, executor = db) {
  await executor.query(
    `INSERT INTO broadcast_stats (campaign_id, total_recipients, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       total_recipients = total_recipients + VALUES(total_recipients),
       updated_at = NOW()`,
    [campaignId, delta],
  );
}

export default {
  upsertCampaignStats,
  incrementCampaignStat,
  incrementTotalRecipients,
};
