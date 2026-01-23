import db from "../config/database.js";
import { earnBonuses } from "../utils/bonuses.js";
import { logger } from "../utils/logger.js";

const AUTO_STATUS_INTERVAL_MS = 60 * 1000;
const PROCESS_WINDOW_MINUTES = 5;
const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "delivering"];

const pad2 = (value) => String(value).padStart(2, "0");

const getLocalParts = (utcDate, offsetMinutes) => {
  const localMs = utcDate.getTime() - offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
};

const buildLocalDateString = ({ year, month, day }) => `${year}-${pad2(month)}-${pad2(day)}`;

const getUtcMidnightForLocalDate = ({ year, month, day }, offsetMinutes) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + offsetMinutes * 60 * 1000);

async function rollbackBonuses(order) {
  const userId = order.user_id;
  const orderId = order.id;
  const bonusUsed = parseFloat(order.bonus_used) || 0;
  const orderTotal = parseFloat(order.total) || 0;
  const orderNumber = order.order_number;
  const [users] = await db.query("SELECT bonus_balance, total_spent FROM users WHERE id = ?", [userId]);
  const currentBalance = parseFloat(users[0]?.bonus_balance) || 0;
  const currentTotalSpent = parseFloat(users[0]?.total_spent) || 0;
  let balanceAfter = currentBalance;
  if (bonusUsed > 0) {
    balanceAfter = currentBalance + bonusUsed;
    await db.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [balanceAfter, userId]);
    await db.query(
      `INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description)
       VALUES (?, ?, 'manual', ?, ?, ?)`,
      [userId, orderId, bonusUsed, balanceAfter, `Возврат бонусов за отмену заказа #${orderNumber}`],
    );
  }
  const [earnedRows] = await db.query("SELECT SUM(amount) as earned_total FROM bonus_history WHERE order_id = ? AND type = 'earned'", [
    orderId,
  ]);
  const earnedTotal = parseFloat(earnedRows[0]?.earned_total) || 0;
  if (earnedTotal > 0) {
    balanceAfter = Math.max(0, balanceAfter - earnedTotal);
    const updatedTotalSpent = Math.max(0, currentTotalSpent - orderTotal);
    await db.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [balanceAfter, updatedTotalSpent, userId]);
    await db.query(
      `INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description)
       VALUES (?, ?, 'manual', ?, ?, ?)`,
      [userId, orderId, earnedTotal, balanceAfter, `Аннулирование бонусов за отмену заказа #${orderNumber}`],
    );
  }
}

async function notifyStatusChange(orderId, userId, oldStatus, newStatus, orderType, orderNumber) {
  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyOrderStatusUpdate(orderId, userId, newStatus, oldStatus);
  } catch (wsError) {
    console.error("Failed to send WebSocket notification:", wsError);
  }
  try {
    const { sendTelegramNotification, formatOrderStatusMessage } = await import("../utils/telegram.js");
    const [users] = await db.query("SELECT telegram_id FROM users WHERE id = ?", [userId]);
    if (users.length > 0 && users[0].telegram_id) {
      const message = formatOrderStatusMessage(orderNumber, newStatus, orderType);
      await sendTelegramNotification(users[0].telegram_id, message);
    }
  } catch (telegramError) {
    console.error("Failed to send Telegram notification:", telegramError);
  }
}

async function updateOrderStatus(order, localDate) {
  const newStatus = order.status === "pending" ? "cancelled" : "completed";
  const completedAt = newStatus === "completed" ? new Date() : null;
  await db.query("UPDATE orders SET status = ?, completed_at = ?, auto_status_date = ? WHERE id = ?", [
    newStatus,
    completedAt,
    localDate,
    order.id,
  ]);
  if (newStatus === "completed") {
    const orderTotal = parseFloat(order.total) || 0;
    if (orderTotal > 0) {
      try {
        await earnBonuses(order.user_id, order.id, orderTotal, "Bonus earned from completed order");
      } catch (bonusError) {
        console.error("Failed to earn bonuses:", bonusError);
      }
    }
  } else if (newStatus === "cancelled") {
    try {
      await rollbackBonuses(order);
    } catch (bonusError) {
      console.error("Failed to rollback bonuses for cancelled order:", bonusError);
    }
  }
  await logger.order.statusChanged(order.id, order.status, newStatus, "system");
  await notifyStatusChange(order.id, order.user_id, order.status, newStatus, order.order_type, order.order_number);
}

async function processOffset(offsetMinutes, nowUtc) {
  const localParts = getLocalParts(nowUtc, offsetMinutes);
  if (localParts.hour !== 0 || localParts.minute >= PROCESS_WINDOW_MINUTES) {
    return;
  }
  const localDate = buildLocalDateString(localParts);
  const utcMidnight = getUtcMidnightForLocalDate(localParts, offsetMinutes);
  const [orders] = await db.query(
    `SELECT id, status, user_id, total, bonus_used, order_number, order_type
     FROM orders
     WHERE status IN (?)
       AND user_timezone_offset = ?
       AND created_at < ?
       AND (auto_status_date IS NULL OR auto_status_date < ?)`,
    [ACTIVE_STATUSES, offsetMinutes, utcMidnight, localDate],
  );
  if (!orders.length) {
    return;
  }
  for (const order of orders) {
    await updateOrderStatus(order, localDate);
  }
}

async function runAutoStatusCheck() {
  const nowUtc = new Date();
  try {
    const [offsetRows] = await db.query(`SELECT DISTINCT user_timezone_offset as offset FROM orders WHERE status IN (?)`, [ACTIVE_STATUSES]);
    for (const row of offsetRows) {
      const offsetMinutes = Number(row.offset) || 0;
      await processOffset(offsetMinutes, nowUtc);
    }
  } catch (error) {
    console.error("Failed to run auto status check:", error);
  }
}

export function createOrderAutoStatusWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      runAutoStatusCheck();
      intervalId = setInterval(runAutoStatusCheck, AUTO_STATUS_INTERVAL_MS);
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}
