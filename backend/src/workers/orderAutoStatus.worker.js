import db from "../config/database.js";
import { earnBonuses, cancelOrderBonuses, getLoyaltyLevelsFromDb } from "../modules/loyalty/services/loyaltyService.js";
import { getSystemSettings } from "../utils/settings.js";
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

async function rollbackBonuses(order, loyaltyLevels) {
  await cancelOrderBonuses(order, null, loyaltyLevels);
}

async function notifyStatusChange(orderId, userId, oldStatus, newStatus, orderType, orderNumber, branchId) {
  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyOrderStatusUpdate(orderId, userId, newStatus, oldStatus, branchId || null);
  } catch (wsError) {
    // WebSocket errors are non-critical, skip logging
  }
  try {
    const { sendTelegramNotification, formatOrderStatusMessage } = await import("../utils/telegram.js");
    const [users] = await db.query("SELECT telegram_id FROM users WHERE id = ?", [userId]);
    if (users.length > 0 && users[0].telegram_id) {
      const message = formatOrderStatusMessage(orderNumber, newStatus, orderType);
      await sendTelegramNotification(users[0].telegram_id, message);
    }
  } catch (telegramError) {
    // Telegram errors are non-critical, skip logging
  }
}

async function updateOrderStatus(order, localDate) {
  const newStatus = order.status === "pending" ? "cancelled" : "completed";
  const completedAt = newStatus === "completed" ? new Date() : null;
  await db.query("UPDATE orders SET status = ?, completed_at = ?, auto_status_date = ? WHERE id = ?", [newStatus, completedAt, localDate, order.id]);
  if (order.status !== newStatus) {
    await db.query(
      "INSERT INTO order_status_history (order_id, old_status, new_status, changed_by_type, changed_by_admin_id) VALUES (?, ?, ?, 'system', NULL)",
      [order.id, order.status, newStatus],
    );
  }
  if (newStatus === "completed") {
    const orderTotal = parseFloat(order.total) || 0;
    const settings = await getSystemSettings();
    const loyaltyLevels = await getLoyaltyLevelsFromDb();
    if (settings.bonuses_enabled && orderTotal > 0) {
      try {
        await db.query("UPDATE loyalty_transactions SET status = 'completed' WHERE order_id = ? AND type = 'spend' AND status = 'pending'", [
          order.id,
        ]);
        await earnBonuses(order, null, loyaltyLevels);
      } catch (bonusError) {
        logger.bonus.error(`Failed to earn bonuses for order ${order.id}`, { error: bonusError.message });
      }
    }
  } else if (newStatus === "cancelled") {
    try {
      const settings = await getSystemSettings();
      const loyaltyLevels = await getLoyaltyLevelsFromDb();
      await rollbackBonuses(order, loyaltyLevels);
    } catch (bonusError) {
      logger.bonus.error(`Failed to rollback bonuses for order ${order.id}`, { error: bonusError.message });
    }
  }
  await logger.order.statusChanged(order.id, order.status, newStatus, "system");
  await notifyStatusChange(order.id, order.user_id, order.status, newStatus, order.order_type, order.order_number, order.branch_id);
}

async function processOffset(offsetMinutes, nowUtc) {
  const localParts = getLocalParts(nowUtc, offsetMinutes);
  if (localParts.hour !== 0 || localParts.minute >= PROCESS_WINDOW_MINUTES) {
    return;
  }
  const localDate = buildLocalDateString(localParts);
  const utcMidnight = getUtcMidnightForLocalDate(localParts, offsetMinutes);
  const [orders] = await db.query(
    `SELECT id, status, user_id, total, subtotal, delivery_cost, bonus_spent, order_number, order_type, branch_id
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
    logger.system.dbError(`Failed to run auto status check: ${error.message}`);
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
