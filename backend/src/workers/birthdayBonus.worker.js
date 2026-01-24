import db from "../config/database.js";
import { getSystemSettings } from "../utils/settings.js";
import { getLoyaltySettings } from "../utils/loyaltySettings.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RUN_HOUR = 6;
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

async function issueBirthdayBonuses() {
  const systemSettings = await getSystemSettings();
  if (!systemSettings.bonuses_enabled) return;
  const settings = await getLoyaltySettings();
  if (!settings.birthday_bonus_enabled) return;
  const daysBefore = Math.max(0, Number(settings.birthday_bonus_days_before) || 0);
  const daysAfter = Math.max(0, Number(settings.birthday_bonus_days_after) || 0);
  const amount = Math.max(0, Number(settings.birthday_bonus_amount) || 0);
  if (amount <= 0) return;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBefore);
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();
  const targetYear = targetDate.getFullYear();
  const [users] = await db.query(
    `SELECT id, bonus_balance, birthday_bonus_last_granted_year
     FROM users
     WHERE date_of_birth IS NOT NULL
       AND MONTH(date_of_birth) = ?
       AND DAY(date_of_birth) = ?
       AND (birthday_bonus_last_granted_year IS NULL OR birthday_bonus_last_granted_year <> ?)`,
    [targetMonth, targetDay, targetYear],
  );
  for (const user of users) {
    const currentBalance = Math.round(parseFloat(user.bonus_balance) || 0);
    const newBalance = currentBalance + Math.round(amount);
    const birthdayDate = new Date(targetYear, targetMonth - 1, targetDay);
    const expiresAt = new Date(birthdayDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
    const [result] = await db.query(
      `INSERT INTO loyalty_transactions
       (user_id, order_id, type, amount, earned_at, expires_at, status, description)
       VALUES (?, NULL, 'birthday_bonus', ?, NOW(), ?, 'completed', 'Бонус ко дню рождения')`,
      [user.id, Math.round(amount), expiresAt],
    );
    await db.query("UPDATE users SET bonus_balance = ?, birthday_bonus_last_granted_year = ? WHERE id = ?", [newBalance, targetYear, user.id]);
    await db.query(
      `INSERT INTO user_loyalty_stats (user_id, bonus_balance, total_earned)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
        bonus_balance = VALUES(bonus_balance),
        total_earned = total_earned + VALUES(total_earned)`,
      [user.id, newBalance, Math.round(amount)],
    );
    await logLoyaltyEvent({
      eventType: "cron_execution",
      severity: "info",
      userId: user.id,
      transactionId: result.insertId,
      message: "Начислен бонус ко дню рождения",
      details: { amount: Math.round(amount), targetDate: targetDate.toISOString().slice(0, 10) },
    });
  }
}

export function createBirthdayBonusWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(async () => {
        const shouldRun = shouldRunNow();
        if (!shouldRun) return;
        try {
          await issueBirthdayBonuses();
        } catch (error) {
          console.error("Ошибка начисления бонусов ко дню рождения:", error);
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
  createBirthdayBonusWorker,
};
