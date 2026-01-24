import db from "../config/database.js";
import { getLoyaltyLevelsFromDb } from "../utils/bonuses.js";
import { getLoyaltySettings } from "../utils/loyaltySettings.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RUN_HOUR = 1;
const RUN_WINDOW_MINUTES = 10;
let lastRunDate = null;

const shouldRunNow = () => {
  const now = new Date();
  if (now.getHours() !== RUN_HOUR || now.getMinutes() >= RUN_WINDOW_MINUTES) return null;
  const dateKey = now.toISOString().slice(0, 10);
  if (lastRunDate === dateKey) return null;
  lastRunDate = dateKey;
  return now;
};

async function degradeLevels() {
  const settings = await getLoyaltySettings();
  if (!settings.level_degradation_enabled) return;
  const periodDays = Math.max(1, Number(settings.level_degradation_period_days) || 180);
  const levels = await getLoyaltyLevelsFromDb();
  const [rows] = await db.query(
    `SELECT u.id, u.current_loyalty_level_id, u.loyalty_level, us.last_order_at
     FROM users u
     JOIN user_loyalty_stats us ON us.user_id = u.id
     WHERE us.last_order_at IS NOT NULL
       AND us.last_order_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND u.loyalty_level > 1`,
    [periodDays],
  );
  for (const row of rows) {
    const currentLevelNumber = row.loyalty_level;
    const newLevelNumber = Math.max(1, currentLevelNumber - 1);
    const newLevelId = levels[newLevelNumber]?.id;
    if (!newLevelId) continue;
    await db.query("UPDATE users SET loyalty_level = ?, current_loyalty_level_id = ? WHERE id = ?", [newLevelNumber, newLevelId, row.id]);
    await db.query("UPDATE user_loyalty_levels SET ended_at = NOW() WHERE user_id = ? AND ended_at IS NULL", [row.id]);
    await db.query(
      `INSERT INTO user_loyalty_levels (user_id, level_id, reason, triggered_by_order_id, total_spent_amount, started_at)
       VALUES (?, ?, 'degradation', NULL, ?, NOW())`,
      [row.id, newLevelId, 0],
    );
    await db.query("UPDATE user_loyalty_stats SET last_level_check_at = NOW() WHERE user_id = ?", [row.id]);
    await logLoyaltyEvent({
      eventType: "cron_execution",
      severity: "warning",
      userId: row.id,
      message: `Деградация уровня: ${currentLevelNumber} → ${newLevelNumber}`,
    });
  }
}

export function createLevelDegradationWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(async () => {
        const shouldRun = shouldRunNow();
        if (!shouldRun) return;
        try {
          await degradeLevels();
        } catch (error) {
          console.error("Ошибка деградации уровней:", error);
        }
      }, CHECK_INTERVAL_MS);
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}

export default {
  createLevelDegradationWorker,
};
