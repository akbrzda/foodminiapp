import db from "../config/database.js";
import redis from "../config/redis.js";
import { logLoyaltyEvent } from "./loyaltyLogs.js";
const DEFAULT_LOYALTY_LEVELS = {
  1: { id: 1, name: "Бронза", earnRate: 0.03, maxSpendPercent: 0.25, threshold: 0 },
  2: { id: 2, name: "Серебро", earnRate: 0.05, maxSpendPercent: 0.25, threshold: 10000 },
  3: { id: 3, name: "Золото", earnRate: 0.07, maxSpendPercent: 0.25, threshold: 20000 },
};
const LOYALTY_LEVEL_PERIOD_DAYS = 60;
const DEFAULT_BONUS_EXPIRES_DAYS = 60;
const REGISTRATION_BONUS_AMOUNT = 1000;
const REGISTRATION_BONUS_EXPIRES_DAYS = 30;
const BIRTHDAY_BONUS_AMOUNT = 500;
const BIRTHDAY_BONUS_DAYS_BEFORE = 3;
const BIRTHDAY_BONUS_DAYS_AFTER = 7;
const getBonusCacheKey = (userId) => `bonuses:user_${userId}`;
const getLoyaltyTransaction = async (executor, orderId, type) => {
  const [rows] = await executor.query(
    `SELECT id, amount, remaining_amount, status
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
     (user_id, type, status, amount, remaining_amount, order_id, related_transaction_id, description, expires_at, admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.type,
      payload.status || "completed",
      payload.amount,
      payload.remaining_amount ?? null,
      payload.order_id || null,
      payload.related_transaction_id || null,
      payload.description || null,
      payload.expires_at || null,
      payload.admin_id || null,
    ],
  );
  return result.insertId;
};
const updateLoyaltyTransactionRemaining = async (executor, id, remainingAmount) => {
  await executor.query("UPDATE loyalty_transactions SET remaining_amount = ? WHERE id = ?", [remainingAmount, id]);
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
const toInt = (value) => Math.floor(Number(value) || 0);
const getSelectEarnForUpdateSql = (connection) =>
  connection
    ? "SELECT id, amount, remaining_amount, expires_at, created_at FROM loyalty_transactions WHERE user_id = ? AND type IN ('earn','registration','birthday') AND status = 'completed' AND remaining_amount > 0 ORDER BY created_at ASC, id ASC FOR UPDATE"
    : "SELECT id, amount, remaining_amount, expires_at, created_at FROM loyalty_transactions WHERE user_id = ? AND type IN ('earn','registration','birthday') AND status = 'completed' AND remaining_amount > 0 ORDER BY created_at ASC, id ASC";
const getSelectActiveEarnForUpdateSql = (connection) =>
  connection
    ? "SELECT id, amount, remaining_amount, expires_at, created_at FROM loyalty_transactions WHERE user_id = ? AND type IN ('earn','registration','birthday') AND status = 'completed' AND remaining_amount > 0 AND expires_at > NOW() ORDER BY created_at ASC, id ASC FOR UPDATE"
    : "SELECT id, amount, remaining_amount, expires_at, created_at FROM loyalty_transactions WHERE user_id = ? AND type IN ('earn','registration','birthday') AND status = 'completed' AND remaining_amount > 0 AND expires_at > NOW() ORDER BY created_at ASC, id ASC";
const getExpiryDateFromSettings = (settings = {}) => {
  const days = Math.max(1, normalizeNumber(settings.default_bonus_expires_days, DEFAULT_BONUS_EXPIRES_DAYS));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};
const getEarnBaseAmount = (order) => {
  const subtotal = normalizeNumber(order.subtotal, null);
  const total = normalizeNumber(order.total, 0);
  const deliveryCost = normalizeNumber(order.delivery_cost, 0);
  const bonusSpent = normalizeNumber(order.bonus_spent, 0);
  const baseSource = Number.isFinite(subtotal) ? subtotal : total - deliveryCost;
  const base = baseSource - bonusSpent;
  return Math.max(0, base);
};
const consumeEarnAmounts = async (executor, userId, amount, connection = null) => {
  if (amount <= 0) return [];
  const [earns] = await executor.query(getSelectActiveEarnForUpdateSql(connection), [userId]);
  let remaining = amount;
  const allocations = [];
  for (const earn of earns) {
    if (remaining <= 0) break;
    const available = parseFloat(earn.remaining_amount) || 0;
    if (available <= 0) continue;
    const delta = Math.min(available, remaining);
    const newAmount = Math.max(0, available - delta);
    await updateLoyaltyTransactionRemaining(executor, earn.id, newAmount);
    allocations.push({ earnId: earn.id, amount: delta });
    remaining -= delta;
  }
  if (remaining > 0) {
    throw new Error("Недостаточно активных бонусов для списания");
  }
  return allocations;
};
const restoreEarnAmounts = async (executor, userId, amount, connection = null) => {
  if (amount <= 0) return;
  const [earns] = await executor.query(getSelectEarnForUpdateSql(connection), [userId]);
  let remaining = amount;
  for (const earn of earns) {
    if (remaining <= 0) break;
    const currentAmount = parseFloat(earn.remaining_amount) || 0;
    const add = remaining;
    const newAmount = currentAmount + add;
    await updateLoyaltyTransactionRemaining(executor, earn.id, newAmount);
    remaining = 0;
  }
  if (remaining > 0) {
    await insertLoyaltyTransaction(executor, {
      user_id: userId,
      type: "earn",
      amount: remaining,
      remaining_amount: remaining,
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

export async function getLoyaltyLevelsFromDb(connection = null) {
  const executor = connection || db;
  const [rows] = await executor.query(
    "SELECT id, name, threshold_amount, earn_percentage, max_spend_percentage FROM loyalty_levels WHERE is_enabled = TRUE ORDER BY threshold_amount ASC",
  );
  if (!rows.length) {
    return DEFAULT_LOYALTY_LEVELS;
  }
  const levels = {};
  for (const row of rows) {
    levels[row.id] = {
      id: row.id,
      name: row.name,
      earnRate: Number(row.earn_percentage) / 100,
      maxSpendPercent: Number(row.max_spend_percentage) / 100,
      threshold: Number(row.threshold_amount),
    };
  }
  return levels;
}

export async function getTotalSpentForPeriod(userId, periodDays = LOYALTY_LEVEL_PERIOD_DAYS, executor = db) {
  try {
    const [totals] = await executor.query(
      `SELECT COALESCE(SUM(GREATEST(0, total - delivery_cost - bonus_spent)), 0) as total_spent
       FROM orders
       WHERE user_id = ?
         AND status IN ('delivered','completed')
         AND created_at >= (NOW() - INTERVAL ? DAY)`,
      [userId, periodDays],
    );
    return parseFloat(totals[0]?.total_spent) || 0;
  } catch (error) {
    // Фолбек для старой схемы с колонкой bonus_used
    if (String(error?.message || "").includes("bonus_spent")) {
      const [totals] = await executor.query(
        `SELECT COALESCE(SUM(GREATEST(0, total - delivery_cost - bonus_used)), 0) as total_spent
         FROM orders
         WHERE user_id = ?
           AND status IN ('delivered','completed')
           AND created_at >= (NOW() - INTERVAL ? DAY)`,
        [userId, periodDays],
      );
      return parseFloat(totals[0]?.total_spent) || 0;
    }
    throw error;
  }
}
export function getRedeemPercentForLevel(levelId = 1, levels = DEFAULT_LOYALTY_LEVELS, fallback = 0.25) {
  const level = levels[levelId];
  const value = level?.maxSpendPercent;
  if (!Number.isFinite(value)) return fallback;
  return value;
}
export function calculateEarnedBonuses(baseAmount, loyaltyLevel = 1, levels = DEFAULT_LOYALTY_LEVELS) {
  const level = levels[loyaltyLevel] || levels[1];
  return Math.floor(baseAmount * level.earnRate);
}
export function calculateMaxUsableBonuses(orderSubtotal, maxUsePercent = 0.25) {
  return Math.floor(orderSubtotal * maxUsePercent);
}
export async function validateBonusUsage(userId, bonusToUse, orderSubtotal, maxUsePercent = 0.25) {
  if (!bonusToUse || bonusToUse <= 0) {
    return { valid: true, amount: 0 };
  }
  const [users] = await db.query("SELECT loyalty_balance FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return { valid: false, error: "User not found" };
  }
  const userBalance = parseFloat(users[0].loyalty_balance);
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
  const [users] = await executor.query("SELECT current_loyalty_level_id FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return null;
  }
  const currentLevelId = users[0].current_loyalty_level_id || 1;

  const totalSpent = await getTotalSpentForPeriod(userId, LOYALTY_LEVEL_PERIOD_DAYS, executor);
  const sortedLevels = Object.values(activeLevels).sort((a, b) => b.threshold - a.threshold);
  let newLevelId = sortedLevels.length ? sortedLevels[sortedLevels.length - 1].id : 1;
  for (const level of sortedLevels) {
    if (totalSpent >= level.threshold) {
      newLevelId = level.id || newLevelId;
      break;
    }
  }

  if (newLevelId !== currentLevelId && newLevelId > currentLevelId) {
    await executor.query("UPDATE users SET current_loyalty_level_id = ? WHERE id = ?", [newLevelId, userId]);
    await executor.query(
      `INSERT INTO user_loyalty_levels (user_id, loyalty_level_id, previous_level_id, reason, threshold_sum)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, newLevelId, currentLevelId, "threshold_reached", totalSpent],
    );
    await logLoyaltyEvent({
      eventType: "level_changed",
      userId,
      oldValue: String(currentLevelId),
      newValue: String(newLevelId),
      metadata: { total_spent: totalSpent },
    });
    try {
      const { wsServer } = await import("../index.js");
      wsServer.notifyLevelUp(userId, newLevelId, activeLevels[newLevelId]?.name);
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }
    return {
      old_level_id: currentLevelId,
      new_level_id: newLevelId,
      level_name: activeLevels[newLevelId]?.name,
      total_spent: totalSpent,
    };
  }
  return null;
}
export async function spendBonuses(order, connection = null) {
  const executor = connection || db;
  const bonusSpent = toInt(parseFloat(order.bonus_spent) || 0);
  if (bonusSpent <= 0) return null;
  const [existing] = await executor.query(
    "SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_transactions WHERE order_id = ? AND type = 'spend' AND status IN ('pending','completed')",
    [order.id],
  );
  if (Number(existing[0]?.total) > 0) {
    return { amount: Number(existing[0].total) };
  }
  const selectBalanceSql = connection
    ? "SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE"
    : "SELECT loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectBalanceSql, [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = toInt(parseFloat(users[0].loyalty_balance) || 0);
  if (currentBalance < bonusSpent) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  const allocations = await consumeEarnAmounts(executor, order.user_id, bonusSpent, connection);
  const newBalance = currentBalance - bonusSpent;
  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, order.user_id]);
  const transactionIds = [];
  for (const allocation of allocations) {
    const txId = await insertLoyaltyTransaction(executor, {
      user_id: order.user_id,
      order_id: order.id,
      type: "spend",
      amount: toInt(allocation.amount),
      status: "pending",
      related_transaction_id: allocation.earnId,
      description: "Списание бонусов",
    });
    transactionIds.push(txId);
  }
  await invalidateBonusCache(order.user_id);
  return { ids: transactionIds, amount: bonusSpent, balance_after: newBalance };
}

export async function earnBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;

  const existing = await getLoyaltyTransaction(executor, order.id, "earn");
  if (existing) {
    return existing;
  }

  const [lockedOrders] = await executor.query("SELECT id, bonus_earn_locked, bonus_earn_amount FROM orders WHERE id = ? FOR UPDATE", [order.id]);

  if (!lockedOrders.length) {
    throw new Error("Заказ не найден");
  }

  const lockedOrder = lockedOrders[0];

  if (lockedOrder.bonus_earn_locked) {
    console.log(`Начисление за заказ ${order.id} уже заблокировано, пропуск дублирования`);
    return null;
  }

  const [updateResult] = await executor.query("UPDATE orders SET bonus_earn_locked = TRUE WHERE id = ? AND bonus_earn_locked = FALSE", [order.id]);

  if (updateResult.affectedRows === 0) {
    console.log(`Не удалось установить блокировку для заказа ${order.id}, возможно другой процесс уже обработал`);
    return null;
  }

  const selectUserSql = connection
    ? "SELECT current_loyalty_level_id, loyalty_balance FROM users WHERE id = ? FOR UPDATE"
    : "SELECT current_loyalty_level_id, loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const loyaltyLevelId = users[0].current_loyalty_level_id || 1;
  const baseAmount = getEarnBaseAmount(order);
  const amount = calculateEarnedBonuses(baseAmount, loyaltyLevelId, levels);

  if (amount <= 0) {
    await executor.query("UPDATE orders SET bonus_earn_amount = 0 WHERE id = ?", [order.id]);
    return null;
  }

  const balanceBefore = toInt(parseFloat(users[0].loyalty_balance) || 0);
  const newBalance = balanceBefore + toInt(amount);
  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, order.user_id]);

  await executor.query("UPDATE orders SET bonus_earn_amount = ? WHERE id = ?", [toInt(amount), order.id]);

  const expiresAt = new Date(Date.now() + DEFAULT_BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    type: "earn",
    amount: toInt(amount),
    remaining_amount: toInt(amount),
    order_id: order.id,
    expires_at: expiresAt,
    status: "completed",
  });

  const levelUp = await checkLevelUp(order.user_id, levels, executor);
  await invalidateBonusCache(order.user_id);

  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId: order.user_id,
    orderId: order.id,
    oldValue: String(balanceBefore),
    newValue: String(newBalance),
    metadata: { amount: toInt(amount), base_amount: baseAmount, level_id: loyaltyLevelId },
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

export async function removeEarnedBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;

  const earnTx = await getLoyaltyTransaction(executor, order.id, "earn");
  if (!earnTx) return null;

  const selectUserSql = connection ? "SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const currentBalance = parseFloat(users[0].loyalty_balance) || 0;
  const earnedAmount = parseFloat(earnTx.amount) || 0;
  const newBalance = currentBalance - earnedAmount;
  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, order.user_id]);

  await executor.query("UPDATE loyalty_transactions SET status = 'cancelled', remaining_amount = 0 WHERE id = ?", [earnTx.id]);

  const adjustmentId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    type: "adjustment",
    amount: -toInt(earnedAmount),
    status: "completed",
    description: "Отмена начисления при смене статуса",
    related_transaction_id: earnTx.id,
  });

  if (newBalance < 0) {
    await logLoyaltyEvent({
      eventType: "negative_balance",
      userId: order.user_id,
      orderId: order.id,
      oldValue: String(currentBalance),
      newValue: String(newBalance),
      metadata: { earned: earnedAmount },
    });
  }

  await executor.query("UPDATE orders SET bonus_earn_locked = FALSE WHERE id = ?", [order.id]);

  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId: order.user_id,
    orderId: order.id,
    oldValue: String(currentBalance),
    newValue: String(newBalance),
    metadata: { adjustment_id: adjustmentId, amount: toInt(earnedAmount) },
  });

  await invalidateBonusCache(order.user_id);
  await checkLevelUp(order.user_id, levels, executor);

  return { id: earnTx.id, amount: earnedAmount, balance_after: newBalance };
}

export async function redeliveryEarnBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;

  const [orders] = await executor.query("SELECT bonus_earn_amount FROM orders WHERE id = ?", [order.id]);

  if (!orders.length || !orders[0].bonus_earn_amount) {
    console.log(`Нет сохранённой суммы начисления для заказа ${order.id}, пропуск`);
    return null;
  }

  const savedAmount = parseFloat(orders[0].bonus_earn_amount);
  if (savedAmount <= 0) return null;

  const selectUserSql = connection ? "SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);

  if (users.length === 0) {
    throw new Error("Пользователь не найден");
  }

  const balanceBefore = toInt(parseFloat(users[0].loyalty_balance) || 0);
  const newBalance = balanceBefore + toInt(savedAmount);

  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, order.user_id]);

  const expiresAt = new Date(Date.now() + DEFAULT_BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "earn",
    amount: toInt(savedAmount),
    remaining_amount: toInt(savedAmount),
    expires_at: expiresAt,
    status: "completed",
    description: "Повторное начисление при повторной доставке",
  });

  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId: order.user_id,
    orderId: order.id,
    oldValue: String(balanceBefore),
    newValue: String(newBalance),
    metadata: { amount: toInt(savedAmount), transaction_id: txId },
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
  const selectUserSql = connection ? "SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const [transactions] = await executor.query(
    "SELECT id, type, amount, status, related_transaction_id FROM loyalty_transactions WHERE order_id = ?",
    [order.id],
  );
  if (transactions.length === 0) return null;
  const earnedAmount = transactions.filter((tx) => tx.type === "earn" && tx.status !== "cancelled");
  const spentAmount = transactions.filter((tx) => tx.type === "spend" && tx.status !== "cancelled");
  if (spentAmount.length > 0) {
    for (const tx of spentAmount) {
      if (tx.related_transaction_id) {
        const [earns] = await executor.query("SELECT remaining_amount FROM loyalty_transactions WHERE id = ? FOR UPDATE", [
          tx.related_transaction_id,
        ]);
        if (earns.length) {
          const currentRemaining = parseFloat(earns[0].remaining_amount) || 0;
          await updateLoyaltyTransactionRemaining(executor, tx.related_transaction_id, currentRemaining + (parseFloat(tx.amount) || 0));
        }
      }
      await executor.query("UPDATE loyalty_transactions SET status = 'cancelled' WHERE id = ?", [tx.id]);
    }
  }
  if (earnedAmount.length > 0) {
    for (const tx of earnedAmount) {
      await executor.query("UPDATE loyalty_transactions SET status = 'cancelled', remaining_amount = 0 WHERE id = ?", [tx.id]);
    }
  }
  const spentTotal = spentAmount.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const earnedTotal = earnedAmount.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const currentBalance = parseFloat(users[0].loyalty_balance) || 0;
  const newBalance = currentBalance + spentTotal - earnedTotal;
  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, order.user_id]);
  if (newBalance < 0) {
    await logLoyaltyEvent({
      eventType: "negative_balance",
      userId: order.user_id,
      orderId: order.id,
      oldValue: String(currentBalance),
      newValue: String(newBalance),
      metadata: { spent: spentTotal, earned: earnedTotal },
    });
  }
  await invalidateBonusCache(order.user_id);
  await checkLevelUp(order.user_id, levels, executor);
  await executor.query("UPDATE orders SET bonus_spent = 0 WHERE id = ?", [order.id]);
  return { spent: spentTotal, earned: earnedTotal, balance_after: newBalance };
}

export async function applyManualBonusAdjustment({ userId, delta, description, connection = null, adminId = null }) {
  const executor = connection || db;
  const selectUserSql = connection ? "SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectUserSql, [userId]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = toInt(parseFloat(users[0].loyalty_balance) || 0);
  if (delta === 0) {
    return { balance: currentBalance };
  }
  const newBalance = currentBalance + toInt(delta);
  if (newBalance < 0) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  if (delta < 0) {
    await consumeEarnAmounts(executor, userId, Math.abs(delta), connection);
  }
  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [newBalance, userId]);
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: userId,
    type: "adjustment",
    amount: toInt(delta),
    status: "completed",
    description: description || "Ручная корректировка",
    admin_id: adminId,
  });
  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId,
    oldValue: String(currentBalance),
    newValue: String(newBalance),
    metadata: { amount: toInt(delta), transaction_id: txId },
  });
  await invalidateBonusCache(userId);
  return { balance: newBalance };
}
export async function grantRegistrationBonus(userId, connection = null) {
  const executor = connection || db;
  const amount = REGISTRATION_BONUS_AMOUNT;
  if (amount <= 0) {
    return null;
  }
  const selectSql = connection ? "SELECT loyalty_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT loyalty_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectSql, [userId]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const [existing] = await executor.query("SELECT id FROM loyalty_transactions WHERE user_id = ? AND type = 'registration' LIMIT 1", [userId]);
  if (existing.length > 0) {
    return null;
  }
  const currentBalance = toInt(parseFloat(users[0].loyalty_balance) || 0);
  const newBalance = currentBalance + amount;
  const expiresAt = new Date(Date.now() + REGISTRATION_BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await executor.query(
    "UPDATE users SET loyalty_balance = ?, loyalty_joined_at = COALESCE(loyalty_joined_at, NOW()), current_loyalty_level_id = COALESCE(current_loyalty_level_id, 1) WHERE id = ?",
    [newBalance, userId],
  );
  await executor.query(
    `INSERT INTO user_loyalty_levels (user_id, loyalty_level_id, previous_level_id, reason, threshold_sum)
     VALUES (?, 1, NULL, 'registration', 0)`,
    [userId],
  );
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: userId,
    type: "registration",
    amount,
    remaining_amount: amount,
    expires_at: expiresAt,
    status: "completed",
    description: "Бонус за регистрацию",
  });
  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId,
    oldValue: String(currentBalance),
    newValue: String(newBalance),
    metadata: { amount, transaction_id: txId },
  });
  await invalidateBonusCache(userId);
  return { id: txId, amount, balance_after: newBalance };
}
export default {
  calculateEarnedBonuses,
  calculateMaxUsableBonuses,
  getLoyaltyLevelsFromDb,
  getRedeemPercentForLevel,
  validateBonusUsage,
  earnBonuses,
  redeliveryEarnBonuses,
  spendBonuses,
  removeEarnedBonuses,
  cancelOrderBonuses,
  applyManualBonusAdjustment,
  grantRegistrationBonus,
  checkLevelUp,
  getTotalSpentForPeriod,
  invalidateBonusCache,
};
