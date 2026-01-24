import db from "../config/database.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RUN_HOUR = 3;
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

async function reconcileBalances() {
  const [rows] = await db.query(
    `SELECT u.id, u.bonus_balance as user_balance, us.bonus_balance as stats_balance,
            COALESCE(t.total_earned, 0) as total_earned,
            COALESCE(t.total_spent, 0) as total_spent,
            COALESCE(t.total_expired, 0) as total_expired
     FROM users u
     LEFT JOIN user_loyalty_stats us ON us.user_id = u.id
     LEFT JOIN (
       SELECT
         user_id,
         SUM(CASE WHEN type IN ('earn', 'register_bonus', 'birthday_bonus') THEN amount ELSE 0 END) AS total_earned,
         SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END) AS total_spent,
         SUM(CASE WHEN type = 'expire' THEN amount ELSE 0 END) AS total_expired
       FROM loyalty_transactions
       WHERE status = 'completed'
       GROUP BY user_id
     ) t ON t.user_id = u.id`,
  );
  for (const row of rows) {
    const calculated = Math.max(0, Number(row.total_earned) - Number(row.total_spent) - Number(row.total_expired));
    const userBalance = Number(row.user_balance) || 0;
    const statsBalance = Number(row.stats_balance) || 0;
    if (userBalance !== calculated || statsBalance !== calculated) {
      await db.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [calculated, row.id]);
      await db.query(
        `INSERT INTO user_loyalty_stats (user_id, bonus_balance, total_earned, total_spent, total_expired, last_balance_reconciliation_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
          bonus_balance = VALUES(bonus_balance),
          total_earned = VALUES(total_earned),
          total_spent = VALUES(total_spent),
          total_expired = VALUES(total_expired),
          last_balance_reconciliation_at = NOW()`,
        [row.id, calculated, row.total_earned, row.total_spent, row.total_expired],
      );
      await logLoyaltyEvent({
        eventType: "balance_mismatch",
        severity: "warning",
        userId: row.id,
        message: "Исправлено расхождение баланса",
        details: {
          calculated,
          user_balance: userBalance,
          stats_balance: statsBalance,
        },
      });
    }
  }
}

export function createBalanceReconcileWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(async () => {
        const shouldRun = shouldRunNow();
        if (!shouldRun) return;
        try {
          await reconcileBalances();
        } catch (error) {
          console.error("Ошибка сверки балансов:", error);
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
  createBalanceReconcileWorker,
};
