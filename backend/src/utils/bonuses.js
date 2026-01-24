import db from "../config/database.js";
import redis from "../config/redis.js";
import { getLoyaltySettings } from "./loyaltySettings.js";
import { logLoyaltyEvent } from "./loyaltyLogs.js";
const DEFAULT_LOYALTY_LEVELS = {
  1: { level_number: 1, name: "Бронза", earnRate: 0.03, redeemPercent: 0.3, threshold: 0 },
  2: { level_number: 2, name: "Серебро", earnRate: 0.05, redeemPercent: 0.3, threshold: 10000 },
  3: { level_number: 3, name: "Золото", earnRate: 0.07, redeemPercent: 0.3, threshold: 20000 },
};
const DEFAULT_MAX_USE_PERCENT = 0.3;
const getBonusCacheKey = (userId) => `bonuses:user_${userId}`;
const getLoyaltyTransaction = async (executor, orderId, type) => {
  const [rows] = await executor.query(
    `SELECT id, amount
     FROM loyalty_transactions
     WHERE order_id = ?
       AND type = ?
     ORDER BY id DESC
     LIMIT 1`,
    [orderId, type],
  );
  return rows[0] || null;
};
const insertLoyaltyTransaction = async (executor, payload) => {
  const [result] = await executor.query(
    `INSERT INTO loyalty_transactions
     (user_id, order_id, type, amount, earned_at, expires_at, status, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.order_id,
      payload.type,
      payload.amount,
      payload.earned_at || null,
      payload.expires_at || null,
      payload.status || "completed",
      payload.description || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
    ],
  );
  return result.insertId;
};
const updateLoyaltyTransactionAmount = async (executor, id, amount) => {
  await executor.query("UPDATE loyalty_transactions SET amount = ? WHERE id = ?", [amount, id]);
};
const updateUserLoyaltyStats = async (executor, userId, { balance, earned = 0, spent = 0, expired = 0 } = {}) => {
  await executor.query(
    `INSERT INTO user_loyalty_stats
     (user_id, bonus_balance, total_earned, total_spent, total_expired)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      bonus_balance = VALUES(bonus_balance),
      total_earned = total_earned + VALUES(total_earned),
      total_spent = total_spent + VALUES(total_spent),
      total_expired = total_expired + VALUES(total_expired)`,
    [userId, balance, earned, spent, expired],
  );
};
const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const normalizeBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
};
const normalizeString = (value, fallback) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};
const getSelectEarnForUpdateSql = (connection) =>
  connection
    ? "SELECT id, amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type = 'earn' AND status = 'completed' AND amount > 0 ORDER BY expires_at ASC, id ASC FOR UPDATE"
    : "SELECT id, amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type = 'earn' AND status = 'completed' AND amount > 0 ORDER BY expires_at ASC, id ASC";
const getSelectActiveEarnForUpdateSql = (connection) =>
  connection
    ? "SELECT id, amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type = 'earn' AND status = 'completed' AND amount > 0 AND expires_at > NOW() ORDER BY expires_at ASC, id ASC FOR UPDATE"
    : "SELECT id, amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type = 'earn' AND status = 'completed' AND amount > 0 AND expires_at > NOW() ORDER BY expires_at ASC, id ASC";
const getExpiryDateFromSettings = (settings = {}) => {
  const days = Math.max(1, normalizeNumber(settings.default_bonus_expires_days, 60));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};
const getEarnBaseAmount = (order, settings = {}) => {
  const total = normalizeNumber(order.total, 0);
  const deliveryCost = normalizeNumber(order.delivery_cost, 0);
  const bonusUsed = normalizeNumber(order.bonus_used, 0);
  const includeDelivery = normalizeBoolean(settings.include_delivery_in_earn, false);
  const calculateAfterBonus = normalizeBoolean(settings.calculate_from_amount_after_bonus, true);
  let base = total;
  if (calculateAfterBonus) {
    base -= bonusUsed;
  }
  if (!includeDelivery) {
    base -= deliveryCost;
  }
  return Math.max(0, base);
};
const consumeEarnAmounts = async (executor, userId, amount, connection = null) => {
  if (amount <= 0) return;
  const [earns] = await executor.query(getSelectActiveEarnForUpdateSql(connection), [userId]);
  let remaining = amount;
  for (const earn of earns) {
    if (remaining <= 0) break;
    const available = parseFloat(earn.amount) || 0;
    if (available <= 0) continue;
    const delta = Math.min(available, remaining);
    const newAmount = Math.max(0, available - delta);
    await updateLoyaltyTransactionAmount(executor, earn.id, newAmount);
    remaining -= delta;
  }
  if (remaining > 0) {
    throw new Error("Недостаточно активных бонусов для списания");
  }
};
const restoreEarnAmounts = async (executor, userId, amount, connection = null) => {
  if (amount <= 0) return;
  const [earns] = await executor.query(getSelectEarnForUpdateSql(connection), [userId]);
  let remaining = amount;
  for (const earn of earns) {
    if (remaining <= 0) break;
    const currentAmount = parseFloat(earn.amount) || 0;
    const add = remaining;
    const newAmount = currentAmount + add;
    await updateLoyaltyTransactionAmount(executor, earn.id, newAmount);
    remaining = 0;
  }
  if (remaining > 0) {
    await insertLoyaltyTransaction(executor, {
      user_id: userId,
      order_id: null,
      type: "earn",
      amount: remaining,
      earned_at: new Date(),
      expires_at: getExpiryDateFromSettings(),
      status: "completed",
      description: "Восстановление бонусов",
    });
  }
};
export async function invalidateBonusCache(userId) {
  try {
    await redis.del(getBonusCacheKey(userId));
  } catch (error) {
    console.error("Не удалось инвалидировать кеш бонусов:", error);
  }
}

// Получение активных уровней лояльности из БД
export async function getLoyaltyLevelsFromDb(connection = null) {
  const executor = connection || db;
  const [rows] = await executor.query(
    "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent FROM loyalty_levels WHERE is_active = TRUE ORDER BY level_number ASC",
  );
  if (!rows.length) {
    return DEFAULT_LOYALTY_LEVELS;
  }
  const levels = {};
  for (const row of rows) {
    levels[row.level_number] = {
      id: row.id,
      name: row.name,
      level_number: row.level_number,
      earnRate: Number(row.earn_percent),
      redeemPercent: Number(row.max_spend_percent) / 100,
      threshold: Number(row.threshold_amount),
    };
  }
  return levels;
}
export function getMaxUsePercentFromSettings(settings = {}) {
  return normalizeNumber(settings.bonus_max_redeem_percent, DEFAULT_MAX_USE_PERCENT);
}
export function getRedeemPercentForLevel(loyaltyLevel = 1, levels = DEFAULT_LOYALTY_LEVELS, fallback = DEFAULT_MAX_USE_PERCENT) {
  const level = levels[loyaltyLevel];
  const value = level?.redeemPercent;
  if (!Number.isFinite(value)) return fallback;
  return value;
}
export function calculateEarnedBonuses(baseAmount, loyaltyLevel = 1, levels = DEFAULT_LOYALTY_LEVELS) {
  const level = levels[loyaltyLevel] || levels[1];
  return Math.floor(baseAmount * level.earnRate);
}
export function calculateMaxUsableBonuses(orderSubtotal, maxUsePercent = DEFAULT_MAX_USE_PERCENT) {
  return Math.floor(orderSubtotal * maxUsePercent);
}
export async function validateBonusUsage(userId, bonusToUse, orderSubtotal, maxUsePercent = DEFAULT_MAX_USE_PERCENT) {
  if (!bonusToUse || bonusToUse <= 0) {
    return { valid: true, amount: 0 };
  }
  const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return { valid: false, error: "User not found" };
  }
  const userBalance = parseFloat(users[0].bonus_balance);
  if (bonusToUse > userBalance) {
    return {
      valid: false,
      error: `Insufficient bonus balance. Available: ${userBalance}`,
    };
  }
  const maxUsable = calculateMaxUsableBonuses(orderSubtotal, maxUsePercent);
  if (bonusToUse > maxUsable) {
    return {
      valid: false,
      error: `Maximum ${maxUsable} bonuses can be used for this order`,
    };
  }
  return { valid: true, amount: bonusToUse };
}
export async function checkLevelUp(userId, levels = null, connection = null) {
  const executor = connection || db;
  const activeLevels = levels || (await getLoyaltyLevelsFromDb(executor));
  const [users] = await executor.query("SELECT loyalty_level, current_loyalty_level_id FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return null;
  }
  const currentLevel = users[0].loyalty_level || 1;
  const currentLevelId = users[0].current_loyalty_level_id;
  const [statsRows] = await executor.query("SELECT total_spent_60_days FROM user_loyalty_stats WHERE user_id = ?", [userId]);
  const totalSpent = parseFloat(statsRows[0]?.total_spent_60_days) || 0;
  const sortedLevels = Object.values(activeLevels).sort((a, b) => b.threshold - a.threshold);
  let newLevel = sortedLevels.length ? sortedLevels[sortedLevels.length - 1].level_number : 1;
  for (const level of sortedLevels) {
    if (totalSpent >= level.threshold) {
      newLevel = level.level_number || newLevel;
      break;
    }
  }
  if (newLevel !== currentLevel) {
    const newLevelId = activeLevels[newLevel]?.id || currentLevelId;
    await executor.query("UPDATE users SET loyalty_level = ?, current_loyalty_level_id = ? WHERE id = ?", [newLevel, newLevelId, userId]);
    await executor.query("UPDATE user_loyalty_levels SET ended_at = NOW() WHERE user_id = ? AND ended_at IS NULL", [userId]);
    await executor.query(
      `INSERT INTO user_loyalty_levels (user_id, level_id, reason, triggered_by_order_id, total_spent_amount, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, newLevelId, "threshold_reached", null, Math.round(totalSpent), new Date()],
    );
    await executor.query("UPDATE user_loyalty_stats SET last_level_check_at = NOW() WHERE user_id = ?", [userId]);
    await logLoyaltyEvent({
      eventType: "cron_execution",
      severity: "info",
      userId,
      message: `Изменение уровня: ${currentLevel} → ${newLevel}`,
    });
    try {
      const { wsServer } = await import("../index.js");
      wsServer.notifyLevelUp(userId, newLevel, activeLevels[newLevel].name);
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }
    return {
      old_level: currentLevel,
      new_level: newLevel,
      level_name: activeLevels[newLevel].name,
    };
  }
  return null;
}
export async function spendBonuses(order, connection = null) {
  const executor = connection || db;
  const bonusUsed = Math.round(parseFloat(order.bonus_used) || 0);
  if (bonusUsed <= 0) return null;
  const spendTx = await getLoyaltyTransaction(executor, order.id, "spend");
  if (spendTx) {
    return spendTx;
  }
  const selectBalanceSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectBalanceSql, [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = Math.round(parseFloat(users[0].bonus_balance) || 0);
  if (currentBalance < bonusUsed) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  await consumeEarnAmounts(executor, order.user_id, bonusUsed, connection);
  const newBalance = currentBalance - bonusUsed;
  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, order.user_id]);
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "spend",
    amount: bonusUsed,
    expires_at: null,
    status: "pending",
  });
  await updateUserLoyaltyStats(executor, order.user_id, {
    balance: newBalance,
    spent: bonusUsed,
  });
  await invalidateBonusCache(order.user_id);
  return { id: txId, amount: bonusUsed, balance_after: newBalance };
}
// Начисление бонусов за заказ с защитой от дублирования
export async function earnBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS, loyaltySettings = null) {
  const executor = connection || db;

  // Проверка: если уже есть начисление, вернуть его
  const existing = await getLoyaltyTransaction(executor, order.id, "earn");
  if (existing) {
    return existing;
  }

  // Блокировка строки заказа для проверки флага bonus_earn_locked
  const [lockedOrders] = await executor.query("SELECT id, bonus_earn_locked, bonus_earn_amount FROM orders WHERE id = ? FOR UPDATE", [order.id]);

  if (!lockedOrders.length) {
    throw new Error("Заказ не найден");
  }

  const lockedOrder = lockedOrders[0];

  // Если bonus_earn_locked = TRUE, значит начисление уже в процессе/завершено
  if (lockedOrder.bonus_earn_locked) {
    console.log(`Начисление за заказ ${order.id} уже заблокировано, пропуск дублирования`);
    return null;
  }

  // Устанавливаем флаг блокировки
  const [updateResult] = await executor.query("UPDATE orders SET bonus_earn_locked = TRUE WHERE id = ? AND bonus_earn_locked = FALSE", [order.id]);

  if (updateResult.affectedRows === 0) {
    console.log(`Не удалось установить блокировку для заказа ${order.id}, возможно другой процесс уже обработал`);
    return null;
  }

  const settings = loyaltySettings || (await getLoyaltySettings());

  const selectUserSql = connection
    ? "SELECT loyalty_level, bonus_balance, total_spent FROM users WHERE id = ? FOR UPDATE"
    : "SELECT loyalty_level, bonus_balance, total_spent FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const loyaltyLevel = users[0].loyalty_level || 1;
  const orderTotal = parseFloat(order.total) || 0;

  const baseAmount = getEarnBaseAmount(order, settings);
  const amount = calculateEarnedBonuses(baseAmount, loyaltyLevel, levels);

  if (amount <= 0) {
    // Сохраняем 0 в bonus_earn_amount для истории
    await executor.query("UPDATE orders SET bonus_earn_amount = 0 WHERE id = ?", [order.id]);
    return null;
  }

  const balanceBefore = Math.round(parseFloat(users[0].bonus_balance) || 0);
  const newBalance = balanceBefore + Math.round(amount);
  const newTotalSpent = (parseFloat(users[0].total_spent) || 0) + orderTotal;

  await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [newBalance, newTotalSpent, order.user_id]);

  // Сохраняем начисленную сумму в заказе для повторных доставок
  await executor.query("UPDATE orders SET bonus_earn_amount = ? WHERE id = ?", [Math.round(amount), order.id]);

  const expiresAt = getExpiryDateFromSettings(settings);
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "earn",
    amount: Math.round(amount),
    earned_at: new Date(),
    expires_at: expiresAt,
    status: "completed",
  });

  await updateUserLoyaltyStats(executor, order.user_id, {
    balance: newBalance,
    earned: Math.round(amount),
  });

  const levelUp = await checkLevelUp(order.user_id, levels, executor);
  await invalidateBonusCache(order.user_id);

  await logLoyaltyEvent({
    eventType: "bonus_earn",
    severity: "info",
    userId: order.user_id,
    orderId: order.id,
    transactionId: txId,
    message: `Начислено ${Math.round(amount)} бонусов за заказ`,
    metadata: { loyalty_level: loyaltyLevel, base_amount: baseAmount },
  });

  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyBonusUpdate(order.user_id, newBalance, {
      type: "earn",
      amount,
      orderId: order.id,
      level_up: levelUp,
    });
  } catch (wsError) {
    console.error("Failed to send WebSocket notification:", wsError);
  }

  return {
    id: txId,
    amount,
    balance_after: newBalance,
    level_up: levelUp,
  };
}

// Откат начисленных бонусов (при смене статуса delivered → другой)
export async function removeEarnedBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;

  // Проверяем, было ли начисление
  const earnTx = await getLoyaltyTransaction(executor, order.id, "earn");
  if (!earnTx) return null;

  const selectUserSql = connection
    ? "SELECT bonus_balance, total_spent FROM users WHERE id = ? FOR UPDATE"
    : "SELECT bonus_balance, total_spent FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const currentBalance = parseFloat(users[0].bonus_balance) || 0;
  const earnedAmount = parseFloat(earnTx.amount) || 0;
  const newBalance = Math.max(0, currentBalance - earnedAmount);
  const newTotalSpent = Math.max(0, (parseFloat(users[0].total_spent) || 0) - (parseFloat(order.total) || 0));

  await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [newBalance, newTotalSpent, order.user_id]);

  // Отменяем транзакцию начисления
  await executor.query("UPDATE loyalty_transactions SET status = 'cancelled' WHERE id = ?", [earnTx.id]);

  // Создаём транзакцию отмены
  const refundId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "refund_earn",
    amount: Math.round(earnedAmount),
    earned_at: new Date(),
    expires_at: null,
    status: "completed",
    description: "Отмена начисления при смене статуса",
    metadata: { cancels_transaction_id: earnTx.id },
  });

  await updateUserLoyaltyStats(executor, order.user_id, {
    balance: newBalance,
    earned: -Math.round(earnedAmount),
  });

  // Сбрасываем флаг блокировки для повторного начисления
  await executor.query("UPDATE orders SET bonus_earn_locked = FALSE WHERE id = ?", [order.id]);

  await logLoyaltyEvent({
    eventType: "bonus_refund",
    severity: "info",
    userId: order.user_id,
    orderId: order.id,
    transactionId: refundId,
    message: `Отменено начисление ${Math.round(earnedAmount)} бонусов`,
  });

  await invalidateBonusCache(order.user_id);
  await checkLevelUp(order.user_id, levels, executor);

  return { id: earnTx.id, amount: earnedAmount, balance_after: newBalance };
}

// Повторное начисление бонусов (при повторной доставке)
// Использует сохранённую сумму из bonus_earn_amount
export async function redeliveryEarnBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;

  // Проверяем, есть ли сохранённая сумма начисления
  const [orders] = await executor.query("SELECT bonus_earn_amount FROM orders WHERE id = ?", [order.id]);

  if (!orders.length || !orders[0].bonus_earn_amount) {
    console.log(`Нет сохранённой суммы начисления для заказа ${order.id}, пропуск`);
    return null;
  }

  const savedAmount = parseFloat(orders[0].bonus_earn_amount);
  if (savedAmount <= 0) return null;

  const selectUserSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const balanceBefore = Math.round(parseFloat(users[0].bonus_balance) || 0);
  const newBalance = balanceBefore + Math.round(savedAmount);

  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, order.user_id]);

  const settings = await getLoyaltySettings();
  const expiresAt = getExpiryDateFromSettings(settings);

  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "earn",
    amount: Math.round(savedAmount),
    earned_at: new Date(),
    expires_at: expiresAt,
    status: "completed",
    description: "Повторное начисление при повторной доставке",
  });

  await updateUserLoyaltyStats(executor, order.user_id, {
    balance: newBalance,
    earned: Math.round(savedAmount),
  });

  await logLoyaltyEvent({
    eventType: "bonus_earn",
    severity: "info",
    userId: order.user_id,
    orderId: order.id,
    transactionId: txId,
    message: `Повторное начисление ${Math.round(savedAmount)} бонусов`,
  });

  await invalidateBonusCache(order.user_id);

  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyBonusUpdate(order.user_id, newBalance, {
      type: "earn",
      amount: savedAmount,
      orderId: order.id,
    });
  } catch (wsError) {
    console.error("Failed to send WebSocket notification:", wsError);
  }

  return {
    id: txId,
    amount: savedAmount,
    balance_after: newBalance,
  };
}

export async function cancelOrderBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;
  const selectUserSql = connection
    ? "SELECT bonus_balance, total_spent FROM users WHERE id = ? FOR UPDATE"
    : "SELECT bonus_balance, total_spent FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const [transactions] = await executor.query("SELECT id, type, amount, status FROM loyalty_transactions WHERE order_id = ?", [order.id]);
  if (transactions.length === 0) return null;
  const earnedAmount = transactions
    .filter((tx) => tx.type === "earn" && tx.status !== "cancelled")
    .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const spentAmount = transactions
    .filter((tx) => tx.type === "spend" && tx.status !== "cancelled")
    .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  if (spentAmount > 0) {
    await restoreEarnAmounts(executor, order.user_id, spentAmount, connection);
  }
  const currentBalance = parseFloat(users[0].bonus_balance) || 0;
  const newBalance = Math.max(0, currentBalance + spentAmount - earnedAmount);
  const totalSpent = parseFloat(users[0].total_spent) || 0;
  const newTotalSpent = earnedAmount > 0 ? Math.max(0, totalSpent - (parseFloat(order.total) || 0)) : totalSpent;
  await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [newBalance, newTotalSpent, order.user_id]);
  for (const tx of transactions) {
    if (tx.status === "cancelled") continue;
    await executor.query("UPDATE loyalty_transactions SET status = 'cancelled' WHERE id = ?", [tx.id]);
    if (tx.type === "spend") {
      const refundId = await insertLoyaltyTransaction(executor, {
        user_id: order.user_id,
        order_id: order.id,
        type: "refund_spend",
        amount: Math.round(parseFloat(tx.amount) || 0),
        earned_at: new Date(),
        expires_at: null,
        status: "completed",
        description: "Возврат списанных бонусов",
        metadata: { cancels_transaction_id: tx.id },
      });
      await logLoyaltyEvent({
        eventType: "cron_execution",
        severity: "info",
        userId: order.user_id,
        orderId: order.id,
        transactionId: refundId,
        message: "Возврат списания при отмене заказа",
      });
    }
    if (tx.type === "earn") {
      const refundId = await insertLoyaltyTransaction(executor, {
        user_id: order.user_id,
        order_id: order.id,
        type: "refund_earn",
        amount: Math.round(parseFloat(tx.amount) || 0),
        earned_at: new Date(),
        expires_at: null,
        status: "completed",
        description: "Отмена начисления",
        metadata: { cancels_transaction_id: tx.id },
      });
      await logLoyaltyEvent({
        eventType: "cron_execution",
        severity: "info",
        userId: order.user_id,
        orderId: order.id,
        transactionId: refundId,
        message: "Отмена начисления при отмене заказа",
      });
    }
  }
  await updateUserLoyaltyStats(executor, order.user_id, {
    balance: newBalance,
    earned: -Math.round(earnedAmount),
    spent: -Math.round(spentAmount),
  });
  await invalidateBonusCache(order.user_id);
  await checkLevelUp(order.user_id, levels, executor);
  return { spent: spentAmount, earned: earnedAmount, balance_after: newBalance };
}

// Корректировка бонусов при изменении заказа после доставки
export async function adjustOrderBonuses(order, newTotal, connection = null, levels = DEFAULT_LOYALTY_LEVELS, loyaltySettings = null) {
  const executor = connection || db;

  // Проверяем, было ли начисление
  const earnTx = await getLoyaltyTransaction(executor, order.id, "earn");
  if (!earnTx) {
    console.log(`Нет начисления для заказа ${order.id}, корректировка не требуется`);
    return null;
  }

  const settings = loyaltySettings || (await getLoyaltySettings());

  const selectUserSql = connection
    ? "SELECT loyalty_level, bonus_balance FROM users WHERE id = ? FOR UPDATE"
    : "SELECT loyalty_level, bonus_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const loyaltyLevel = users[0].loyalty_level || 1;

  // Создаём временный объект заказа с новой суммой для расчёта
  const adjustedOrder = { ...order, total: newTotal };
  const newBaseAmount = getEarnBaseAmount(adjustedOrder, settings);
  const newEarnAmount = calculateEarnedBonuses(newBaseAmount, loyaltyLevel, levels);

  const oldEarnAmount = parseFloat(earnTx.amount) || 0;
  const delta = Math.round(newEarnAmount - oldEarnAmount);

  if (delta === 0) {
    console.log(`Корректировка не требуется для заказа ${order.id}, разница = 0`);
    return null;
  }

  const currentBalance = parseFloat(users[0].bonus_balance) || 0;
  const newBalance = Math.max(0, currentBalance + delta);

  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, order.user_id]);

  // Обновляем bonus_earn_amount в заказе
  await executor.query("UPDATE orders SET bonus_earn_amount = ? WHERE id = ?", [Math.round(newEarnAmount), order.id]);

  // Создаём транзакцию корректировки
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "adjustment",
    amount: delta, // может быть отрицательным
    earned_at: new Date(),
    expires_at: null,
    status: "completed",
    description: delta > 0 ? "Доначисление при изменении заказа" : "Списание при изменении заказа",
    metadata: {
      old_amount: oldEarnAmount,
      new_amount: newEarnAmount,
      old_total: order.total,
      new_total: newTotal,
    },
  });

  await updateUserLoyaltyStats(executor, order.user_id, {
    balance: newBalance,
    earned: delta > 0 ? delta : 0,
    spent: delta < 0 ? Math.abs(delta) : 0,
  });

  await logLoyaltyEvent({
    eventType: "bonus_adjustment",
    severity: "info",
    userId: order.user_id,
    orderId: order.id,
    transactionId: txId,
    message: `Корректировка начисления: ${delta > 0 ? "+" : ""}${delta} бонусов`,
    metadata: { old_amount: oldEarnAmount, new_amount: newEarnAmount },
  });

  await invalidateBonusCache(order.user_id);

  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyBonusUpdate(order.user_id, newBalance, {
      type: "adjustment",
      amount: delta,
      orderId: order.id,
    });
  } catch (wsError) {
    console.error("Failed to send WebSocket notification:", wsError);
  }

  return {
    id: txId,
    delta,
    old_amount: oldEarnAmount,
    new_amount: newEarnAmount,
    balance_after: newBalance,
  };
}

export async function applyManualBonusAdjustment({ userId, delta, connection = null, loyaltySettings = null }) {
  const executor = connection || db;
  const settings = loyaltySettings || (await getLoyaltySettings());
  const selectUserSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [userId]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = Math.round(parseFloat(users[0].bonus_balance) || 0);
  if (delta === 0) {
    return { balance: currentBalance };
  }
  if (delta > 0) {
    const newBalance = currentBalance + Math.round(delta);
    await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);
    await insertLoyaltyTransaction(executor, {
      user_id: userId,
      order_id: null,
      type: "earn",
      amount: Math.round(delta),
      earned_at: new Date(),
      expires_at: getExpiryDateFromSettings(settings),
      status: "completed",
      description: "Ручная корректировка",
    });
    await updateUserLoyaltyStats(executor, userId, {
      balance: newBalance,
      earned: Math.round(delta),
    });
    await invalidateBonusCache(userId);
    return { balance: newBalance };
  }
  const spendAmount = Math.abs(Math.round(delta));
  if (currentBalance < spendAmount) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  await consumeEarnAmounts(executor, userId, spendAmount, connection);
  const newBalance = currentBalance - spendAmount;
  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);
  await insertLoyaltyTransaction(executor, {
    user_id: userId,
    order_id: null,
    type: "spend",
    amount: spendAmount,
    expires_at: null,
    status: "completed",
    description: "Ручная корректировка",
  });
  await updateUserLoyaltyStats(executor, userId, {
    balance: newBalance,
    spent: spendAmount,
  });
  await invalidateBonusCache(userId);
  return { balance: newBalance };
}
export async function getBonusHistory(userId, limit = 50, offset = 0) {
  const [rows] = await db.query(
    `SELECT 
      lt.id,
      lt.order_id,
      o.order_number,
      lt.type,
      lt.amount,
      lt.expires_at,
      lt.created_at
     FROM loyalty_transactions lt
     LEFT JOIN orders o ON lt.order_id = o.id
     WHERE lt.user_id = ?
     ORDER BY lt.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return rows;
}
export async function grantRegistrationBonus(userId, connection = null, loyaltySettings = null) {
  const executor = connection || db;
  const settings = loyaltySettings || (await getLoyaltySettings());
  if (!normalizeBoolean(settings.registration_bonus_enabled, true)) {
    return null;
  }
  const amount = Math.max(0, Math.round(normalizeNumber(settings.registration_bonus_amount, 0)));
  if (amount <= 0) {
    return null;
  }
  const selectSql = connection
    ? "SELECT bonus_balance, registration_bonus_granted, loyalty_registered_at FROM users WHERE id = ? FOR UPDATE"
    : "SELECT bonus_balance, registration_bonus_granted, loyalty_registered_at FROM users WHERE id = ?";
  const [users] = await executor.query(selectSql, [userId]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  if (users[0].registration_bonus_granted) {
    return null;
  }
  const currentBalance = Math.round(parseFloat(users[0].bonus_balance) || 0);
  const newBalance = currentBalance + amount;
  const expiresDays = Math.max(1, normalizeNumber(settings.registration_bonus_expires_days, 30));
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
  await executor.query(
    "UPDATE users SET bonus_balance = ?, registration_bonus_granted = TRUE, loyalty_registered_at = COALESCE(loyalty_registered_at, NOW()) WHERE id = ?",
    [newBalance, userId],
  );
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: userId,
    order_id: null,
    type: "register_bonus",
    amount,
    earned_at: new Date(),
    expires_at: expiresAt,
    status: "completed",
    description: "Бонус за регистрацию",
  });
  await updateUserLoyaltyStats(executor, userId, {
    balance: newBalance,
    earned: amount,
  });
  await logLoyaltyEvent({
    eventType: "cron_execution",
    severity: "info",
    userId,
    transactionId: txId,
    message: "Начислен бонус за регистрацию",
    details: { amount },
  });
  await invalidateBonusCache(userId);
  return { id: txId, amount, balance_after: newBalance };
}
export default {
  calculateEarnedBonuses,
  calculateMaxUsableBonuses,
  getLoyaltyLevelsFromDb,
  getMaxUsePercentFromSettings,
  getRedeemPercentForLevel,
  validateBonusUsage,
  earnBonuses,
  redeliveryEarnBonuses,
  spendBonuses,
  removeEarnedBonuses,
  adjustOrderBonuses,
  cancelOrderBonuses,
  applyManualBonusAdjustment,
  getBonusHistory,
  grantRegistrationBonus,
  checkLevelUp,
  invalidateBonusCache,
};
