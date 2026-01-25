import db from "../config/database.js";
import { invalidateBonusCache } from "../utils/bonuses.js";
import { logSystem } from "../utils/logger.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RUN_HOUR = 4;
const RUN_WINDOW_MINUTES = 10;
const BATCH_LIMIT = 1000;
let lastRunDate = null;

const shouldRunNow = () => {
  const now = new Date();
  if (now.getHours() !== RUN_HOUR || now.getMinutes() >= RUN_WINDOW_MINUTES) return null;
  const dateKey = now.toISOString().slice(0, 10);
  if (lastRunDate === dateKey) return null;
  lastRunDate = dateKey;
  return now;
};

async function processExpiredBonuses() {
  try {
    while (true) {
      const [rows] = await db.query(
        `SELECT user_id
         FROM loyalty_transactions
         WHERE type IN ('earn','registration','birthday')
           AND status = 'completed'
           AND expires_at <= NOW()
           AND remaining_amount > 0
         GROUP BY user_id
         ORDER BY user_id
         LIMIT ?`,
        [BATCH_LIMIT],
      );
      if (!rows.length) return;
      for (const row of rows) {
        const userId = row.user_id;
        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          const [users] = await connection.query("SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE", [userId]);
          if (users.length === 0) {
            await connection.rollback();
            continue;
          }
          const [expiredEarns] = await connection.query(
            "SELECT id, remaining_amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type IN ('earn','registration','birthday') AND status = 'completed' AND expires_at <= NOW() AND remaining_amount > 0",
            [userId],
          );
          let expiredTotal = 0;
          for (const earn of expiredEarns) {
            const amount = Math.floor(parseFloat(earn.remaining_amount) || 0);
            if (amount <= 0) continue;
            expiredTotal += amount;
            await connection.query("UPDATE loyalty_transactions SET remaining_amount = 0 WHERE id = ?", [earn.id]);
            await connection.query(
              `INSERT INTO loyalty_transactions
               (user_id, type, status, amount, related_transaction_id, description, expires_at)
               VALUES (?, 'expire', 'completed', ?, ?, 'Истечение бонусов', ?)`,
              [userId, amount, earn.id, earn.expires_at],
            );
          }
          if (expiredTotal > 0) {
            const currentBalance = parseFloat(users[0].loyalty_balance) || 0;
            const newBalance = currentBalance - expiredTotal;
            await connection.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, userId]);
            await connection.commit();
            await invalidateBonusCache(userId);
            logSystem("info", "bonus", `Списано ${expiredTotal} бонусов по истечению у пользователя ${userId}`, {
              userId,
              amount: expiredTotal,
            });
            await logLoyaltyEvent({
              eventType: "bonus_expired",
              userId,
              oldValue: String(currentBalance),
              newValue: String(newBalance),
              metadata: { amount: expiredTotal },
            });
          } else {
            await connection.rollback();
          }
        } catch (error) {
          await connection.rollback();
          console.error("Ошибка при списании истёкших бонусов:", error);
        } finally {
          connection.release();
        }
      }
    }
  } catch (error) {
    console.error("Ошибка при обработке истекших бонусов:", error);
  }
}

export function createBonusExpiryWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(async () => {
        const shouldRun = shouldRunNow();
        if (!shouldRun) return;
        await processExpiredBonuses();
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
  createBonusExpiryWorker,
};
