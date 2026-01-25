import db from "../config/database.js";
import { getSystemSettings } from "../utils/settings.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";

const BIRTHDAY_BONUS_AMOUNT = 500;
const BIRTHDAY_BONUS_DAYS_BEFORE = 3;
const BIRTHDAY_BONUS_DAYS_AFTER = 7;

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

async function issueBirthdayBonuses() {
  const systemSettings = await getSystemSettings();
  if (!systemSettings.bonuses_enabled) return;
  const daysBefore = BIRTHDAY_BONUS_DAYS_BEFORE;
  const daysAfter = BIRTHDAY_BONUS_DAYS_AFTER;
  const amount = BIRTHDAY_BONUS_AMOUNT;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBefore);
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();
  const targetYear = targetDate.getFullYear();
  const [users] = await db.query(
    `SELECT id, loyalty_balance
     FROM users
     WHERE date_of_birth IS NOT NULL
       AND MONTH(date_of_birth) = ?
       AND DAY(date_of_birth) = ?`,
    [targetMonth, targetDay],
  );
  for (const user of users) {
    const [existing] = await db.query(
      "SELECT id FROM loyalty_transactions WHERE user_id = ? AND type = 'birthday' AND YEAR(created_at) = ? LIMIT 1",
      [user.id, targetYear],
    );
    if (existing.length > 0) {
      continue;
    }
    const currentBalance = Math.floor(parseFloat(user.loyalty_balance) || 0);
    const newBalance = currentBalance + Math.floor(amount);
    const birthdayDate = new Date(targetYear, targetMonth - 1, targetDay);
    const expiresAt = new Date(birthdayDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
    const [result] = await db.query(
      `INSERT INTO loyalty_transactions
       (user_id, type, status, amount, remaining_amount, expires_at, description)
       VALUES (?, 'birthday', 'completed', ?, ?, ?, 'Бонус ко дню рождения')`,
      [user.id, Math.floor(amount), Math.floor(amount), expiresAt],
    );
    await db.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, user.id]);
    await logLoyaltyEvent({
      eventType: "balance_calculated",
      userId: user.id,
      oldValue: String(currentBalance),
      newValue: String(newBalance),
      metadata: { amount: Math.floor(amount), transaction_id: result.insertId, target_date: targetDate.toISOString().slice(0, 10) },
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
