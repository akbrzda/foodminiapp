import db from "../../../config/database.js";
import { getCachedActiveTriggers, setCachedActiveTriggers } from "../utils/cache.js";

const ORDER_STATUSES = ["completed", "delivered"];

export async function listActiveTriggers({ useCache = true, refreshCache = false } = {}) {
  if (useCache && !refreshCache) {
    const cached = await getCachedActiveTriggers();
    if (cached) return cached;
  }
  const [rows] = await db.query(
    `SELECT id, name, type, status, trigger_type, trigger_config, content_text, content_image_url, content_buttons,
            use_user_timezone, target_hour, is_active, created_by, created_at, updated_at
     FROM broadcast_campaigns
     WHERE type = 'trigger' AND is_active = 1`,
  );
  const triggers = rows.map((row) => {
    let triggerConfig = row.trigger_config;
    let contentButtons = row.content_buttons;
    if (typeof triggerConfig === "string") {
      try {
        triggerConfig = JSON.parse(triggerConfig);
      } catch (error) {
        triggerConfig = null;
      }
    }
    if (typeof contentButtons === "string") {
      try {
        contentButtons = JSON.parse(contentButtons);
      } catch (error) {
        contentButtons = null;
      }
    }
    return {
      ...row,
      trigger_config: triggerConfig,
      content_buttons: contentButtons,
    };
  });
  await setCachedActiveTriggers(triggers);
  return triggers;
}

const parseCheckTime = (value) => {
  if (!value || typeof value !== "string") return null;
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
};

export const shouldRunTriggerNow = (trigger, now = new Date()) => {
  const config = trigger.trigger_config || {};
  const check = parseCheckTime(config.check_time || "");
  if (!check) return true;
  return now.getHours() === check.hour && now.getMinutes() === check.minute;
};

export async function selectTriggerUsers(trigger, windowStart = null, windowEnd = null) {
  if (!trigger?.trigger_type) return [];
  const campaignId = trigger.id;
  const triggerType = trigger.trigger_type;
  const config = trigger.trigger_config || {};
  if (triggerType === "inactive_users") {
    const days = Number(config.days || 0);
    if (!days) return [];
    const [rows] = await db.query(
      `SELECT u.id, u.telegram_id
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id AND o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")})
       LEFT JOIN broadcast_trigger_log btl ON btl.campaign_id = ? AND btl.user_id = u.id AND btl.trigger_date = CURDATE()
       WHERE btl.id IS NULL
       GROUP BY u.id
       HAVING DATEDIFF(CURDATE(), COALESCE(MAX(o.created_at), MAX(u.created_at))) >= ?
          AND MAX(u.telegram_id) IS NOT NULL`,
      [...ORDER_STATUSES, campaignId, days],
    );
    return rows;
  }
  if (triggerType === "birthday") {
    const daysBefore = Number(config.days_before || 0);
    const [rows] = await db.query(
      `SELECT u.id, u.telegram_id
       FROM users u
       LEFT JOIN broadcast_trigger_log btl ON btl.campaign_id = ? AND btl.user_id = u.id AND btl.trigger_date = CURDATE()
       WHERE btl.id IS NULL
         AND u.telegram_id IS NOT NULL
         AND u.date_of_birth IS NOT NULL
         AND DATE_FORMAT(u.date_of_birth, '%m-%d') = DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL ? DAY), '%m-%d')`,
      [campaignId, daysBefore],
    );
    return rows;
  }
  if (triggerType === "new_registration") {
    const hoursAfter = Number(config.hours_after || 0);
    if (!hoursAfter) return [];
    const start = windowStart || new Date(Date.now() - (hoursAfter + 1) * 60 * 60 * 1000);
    const end = windowEnd || new Date(Date.now() - hoursAfter * 60 * 60 * 1000);
    const [rows] = await db.query(
      `SELECT u.id, u.telegram_id
       FROM users u
       LEFT JOIN broadcast_trigger_log btl ON btl.campaign_id = ? AND btl.user_id = u.id AND btl.trigger_date = CURDATE()
       WHERE btl.id IS NULL
         AND u.telegram_id IS NOT NULL
         AND u.created_at BETWEEN ? AND ?`,
      [campaignId, start, end],
    );
    return rows;
  }
  return [];
}

export default {
  listActiveTriggers,
  shouldRunTriggerNow,
  selectTriggerUsers,
};
