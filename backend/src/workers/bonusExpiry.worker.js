import db from "../config/database.js";
import { invalidateBonusCache } from "../utils/bonuses.js";
import { logSystem } from "../utils/logger.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const EXPIRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function processExpiredBonuses() {
  try {
    const [rows] = await db.query(
      `SELECT user_id, SUM(amount) as expired_total
       FROM loyalty_transactions
       WHERE type = 'earn'
         AND status = 'completed'
         AND expires_at <= NOW()
         AND amount > 0
       GROUP BY user_id`,
    );
    if (!rows.length) return;
    for (const row of rows) {
      const userId = row.user_id;
      const expiredTotal = parseFloat(row.expired_total) || 0;
      if (expiredTotal <= 0) continue;
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.query("SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE", [userId]);
        if (users.length === 0) {
          await connection.rollback();
          continue;
        }
        const currentBalance = parseFloat(users[0].bonus_balance) || 0;
        const newBalance = Math.max(0, currentBalance - expiredTotal);
        const [expiredEarns] = await connection.query(
          "SELECT id, amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type = 'earn' AND status = 'completed' AND expires_at <= NOW() AND amount > 0",
          [userId],
        );
        for (const earn of expiredEarns) {
          const amount = Math.round(parseFloat(earn.amount) || 0);
          if (amount <= 0) continue;
          await connection.query("UPDATE loyalty_transactions SET amount = 0 WHERE id = ?", [earn.id]);
          await connection.query(
            `INSERT INTO loyalty_transactions
             (user_id, order_id, type, amount, earned_at, expires_at, status, description, metadata)
             VALUES (?, NULL, 'expire', ?, NOW(), ?, 'completed', 'Истечение бонусов', ?)`,
            [userId, amount, earn.expires_at, JSON.stringify({ cancels_transaction_id: earn.id })],
          );
        }
        await connection.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);
        await connection.query(
          `INSERT INTO user_loyalty_stats (user_id, bonus_balance, total_expired)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
            bonus_balance = VALUES(bonus_balance),
            total_expired = total_expired + VALUES(total_expired)`,
          [userId, newBalance, Math.round(expiredTotal)],
        );
        await connection.commit();
        await invalidateBonusCache(userId);
        logSystem("info", "bonus", `Списано ${expiredTotal} бонусов по истечению у пользователя ${userId}`, {
          userId,
          amount: expiredTotal,
        });
        await logLoyaltyEvent({
          eventType: "cron_execution",
          severity: "info",
          userId,
          message: "Истечение бонусов",
          details: { amount: Math.round(expiredTotal) },
        });
      } catch (error) {
        await connection.rollback();
        console.error("Ошибка при списании истёкших бонусов:", error);
      } finally {
        connection.release();
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
      processExpiredBonuses();
      intervalId = setInterval(processExpiredBonuses, EXPIRY_INTERVAL_MS);
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
