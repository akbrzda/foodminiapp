import db from "../config/database.js";
import { getLoyaltyLevelsFromDb } from "../utils/bonuses.js";
import { getLoyaltySettings } from "../utils/loyaltySettings.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RUN_HOUR = 2;
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

async function recalcLevels() {
  const settings = await getLoyaltySettings();
  const periodDays = Math.max(1, Number(settings.level_calculation_period_days) || 60);

  // Доставка НЕ учитывается в сумме заказов для определения уровня
  await db.query(
    `UPDATE user_loyalty_stats us
     LEFT JOIN (
       SELECT
         user_id,
         SUM(GREATEST(0, (total - bonus_used - delivery_cost))) AS total_spent_60_days
       FROM orders
       WHERE status = 'completed'
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY user_id
     ) calc ON calc.user_id = us.user_id
     SET us.total_spent_60_days = COALESCE(calc.total_spent_60_days, 0)`,
    [periodDays],
  );
  const levels = await getLoyaltyLevelsFromDb();
  const sorted = Object.values(levels).sort((a, b) => b.threshold - a.threshold);
  if (!sorted.length) return;
  const [rows] = await db.query(
    `SELECT u.id, u.loyalty_level, u.current_loyalty_level_id, us.total_spent_60_days
     FROM users u
     JOIN user_loyalty_stats us ON us.user_id = u.id`,
  );
  for (const row of rows) {
    const totalSpent = Number(row.total_spent_60_days) || 0;
    let newLevelNumber = sorted[sorted.length - 1].level_number;
    for (const level of sorted) {
      if (totalSpent >= level.threshold) {
        newLevelNumber = level.level_number;
        break;
      }
    }
    if (newLevelNumber === row.loyalty_level) {
      await db.query("UPDATE user_loyalty_stats SET last_level_check_at = NOW() WHERE user_id = ?", [row.id]);
      continue;
    }
    const newLevelId = levels[newLevelNumber]?.id;
    await db.query("UPDATE users SET loyalty_level = ?, current_loyalty_level_id = ? WHERE id = ?", [newLevelNumber, newLevelId, row.id]);
    await db.query("UPDATE user_loyalty_levels SET ended_at = NOW() WHERE user_id = ? AND ended_at IS NULL", [row.id]);
    await db.query(
      `INSERT INTO user_loyalty_levels (user_id, level_id, reason, triggered_by_order_id, total_spent_amount, started_at)
       VALUES (?, ?, 'threshold_reached', NULL, ?, NOW())`,
      [row.id, newLevelId, Math.round(totalSpent)],
    );
    await db.query("UPDATE user_loyalty_stats SET last_level_check_at = NOW() WHERE user_id = ?", [row.id]);
    await logLoyaltyEvent({
      eventType: "cron_execution",
      severity: "info",
      userId: row.id,
      message: `Пересчет уровня: ${row.loyalty_level} → ${newLevelNumber}`,
    });
  }
}

export function createLevelRecalcWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(async () => {
        const shouldRun = shouldRunNow();
        if (!shouldRun) return;
        try {
          await recalcLevels();
        } catch (error) {
          console.error("Ошибка пересчета уровней:", error);
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
  createLevelRecalcWorker,
};
