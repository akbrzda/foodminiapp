import db from "../config/database.js";
import { logSystem } from "../utils/logger.js";
import { expireBonusesForUser } from "../modules/loyalty/services/loyaltyService.js";

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
          const result = await expireBonusesForUser(userId, connection);
          if (result.expiredTotal > 0) {
            await connection.commit();
            logSystem("info", "bonus", `Списано ${result.expiredTotal} бонусов по истечению у пользователя ${userId}`, {
              userId,
              amount: result.expiredTotal,
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
