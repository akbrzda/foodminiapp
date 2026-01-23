import db from "../config/database.js";
const DEFAULT_LOYALTY_LEVELS = {
  1: { name: "Бронза", earnRate: 0.03, redeemPercent: 0.2, threshold: 0 },
  2: { name: "Серебро", earnRate: 0.05, redeemPercent: 0.25, threshold: 10000 },
  3: { name: "Золото", earnRate: 0.07, redeemPercent: 0.3, threshold: 20000 },
};
const DEFAULT_MAX_USE_PERCENT = 0.5;
const MANUAL_PREFIX = {
  rollback: "[CANCEL_ROLLBACK]",
  refund: "[CANCEL_REFUND]",
  reapply: "[CANCEL_REAPPLY]",
};
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
     (user_id, order_id, type, amount, balance_before, balance_after, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.order_id,
      payload.type,
      payload.amount,
      payload.balance_before,
      payload.balance_after,
      payload.description,
    ],
  );
  return result.insertId;
};
const updateLoyaltyTransaction = async (executor, id, payload) => {
  await executor.query(
    `UPDATE loyalty_transactions
     SET amount = ?, balance_before = ?, balance_after = ?, description = ?
     WHERE id = ?`,
    [payload.amount, payload.balance_before, payload.balance_after, payload.description, id],
  );
};
const getManualEntry = async (executor, orderId, prefix, legacyPrefix) => {
  const [rows] = await executor.query(
    `SELECT id, amount
     FROM bonus_history
     WHERE order_id = ?
       AND type = 'manual'
       AND (
         description LIKE ? OR description LIKE ?
       )
     ORDER BY id DESC
     LIMIT 1`,
    [orderId, `${prefix}%`, `${legacyPrefix}%`],
  );
  return rows[0] || null;
};
const setManualEntryAmount = async (executor, { userId, orderId, entry, prefix, label, amount, balanceAfter }) => {
  const description = `${prefix} ${label}`;
  if (entry) {
    await executor.query("UPDATE bonus_history SET amount = ?, balance_after = ?, description = ? WHERE id = ?", [
      amount,
      balanceAfter,
      description,
      entry.id,
    ]);
    return entry.id;
  }
  if (amount <= 0) return null;
  const [result] = await executor.query(
    `INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description)
     VALUES (?, ?, 'manual', ?, ?, ?)`,
    [userId, orderId, amount, balanceAfter, description],
  );
  return result.insertId;
};
const getEarnedEntry = async (executor, orderId) => {
  const [rows] = await executor.query(
    `SELECT id
     FROM bonus_history
     WHERE order_id = ?
       AND type = 'earned'
     ORDER BY id DESC
     LIMIT 1`,
    [orderId],
  );
  return rows[0] || null;
};
const upsertEarnedEntry = async (executor, { userId, orderId, amount, balanceAfter, description }) => {
  const entry = await getEarnedEntry(executor, orderId);
  if (entry) {
    await executor.query("UPDATE bonus_history SET amount = ?, balance_after = ?, description = ? WHERE id = ?", [
      amount,
      balanceAfter,
      description,
      entry.id,
    ]);
    return entry.id;
  }
  const [result] = await executor.query(
    `INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description)
     VALUES (?, ?, 'earned', ?, ?, ?)`,
    [userId, orderId, amount, balanceAfter, description],
  );
  return result.insertId;
};
const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const normalizeString = (value, fallback) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};
export function getLoyaltyLevelsFromSettings(settings = {}) {
  const level2Threshold = normalizeNumber(settings.loyalty_level_2_threshold, DEFAULT_LOYALTY_LEVELS[2].threshold);
  const level3Threshold = normalizeNumber(settings.loyalty_level_3_threshold, DEFAULT_LOYALTY_LEVELS[3].threshold);
  const fallbackRedeemPercent = getMaxUsePercentFromSettings(settings);
  return {
    1: {
      name: normalizeString(settings.loyalty_level_1_name, DEFAULT_LOYALTY_LEVELS[1].name),
      earnRate: normalizeNumber(settings.loyalty_level_1_rate, DEFAULT_LOYALTY_LEVELS[1].earnRate),
      redeemPercent: normalizeNumber(settings.loyalty_level_1_redeem_percent, fallbackRedeemPercent),
      threshold: 0,
    },
    2: {
      name: normalizeString(settings.loyalty_level_2_name, DEFAULT_LOYALTY_LEVELS[2].name),
      earnRate: normalizeNumber(settings.loyalty_level_2_rate, DEFAULT_LOYALTY_LEVELS[2].earnRate),
      redeemPercent: normalizeNumber(settings.loyalty_level_2_redeem_percent, fallbackRedeemPercent),
      threshold: Math.max(0, level2Threshold),
    },
    3: {
      name: normalizeString(settings.loyalty_level_3_name, DEFAULT_LOYALTY_LEVELS[3].name),
      earnRate: normalizeNumber(settings.loyalty_level_3_rate, DEFAULT_LOYALTY_LEVELS[3].earnRate),
      redeemPercent: normalizeNumber(settings.loyalty_level_3_redeem_percent, fallbackRedeemPercent),
      threshold: Math.max(0, level3Threshold),
    },
  };
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
export function calculateEarnedBonuses(orderTotal, loyaltyLevel = 1, levels = DEFAULT_LOYALTY_LEVELS) {
  const level = levels[loyaltyLevel] || levels[1];
  return Math.floor(orderTotal * level.earnRate);
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
export async function checkLevelUp(userId, levels = DEFAULT_LOYALTY_LEVELS, connection = null) {
  const executor = connection || db;
  const [users] = await executor.query("SELECT loyalty_level, total_spent FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return null;
  }
  const currentLevel = users[0].loyalty_level || 1;
  const totalSpent = parseFloat(users[0].total_spent) || 0;
  let newLevel = 1;
  if (totalSpent >= levels[3].threshold) {
    newLevel = 3;
  } else if (totalSpent >= levels[2].threshold) {
    newLevel = 2;
  }
  if (newLevel !== currentLevel) {
    await executor.query("UPDATE users SET loyalty_level = ? WHERE id = ?", [newLevel, userId]);
    try {
      const { wsServer } = await import("../index.js");
      wsServer.notifyLevelUp(userId, newLevel, levels[newLevel].name);
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }
    return {
      old_level: currentLevel,
      new_level: newLevel,
      level_name: levels[newLevel].name,
    };
  }
  return null;
}
export async function spendBonuses(order, connection = null) {
  const executor = connection || db;
  const bonusUsed = parseFloat(order.bonus_used) || 0;
  if (bonusUsed <= 0) return null;
  const [users] = await executor.query("SELECT bonus_balance FROM users WHERE id = ?", [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = parseFloat(users[0].bonus_balance) || 0;
  if (currentBalance < bonusUsed) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  const spendTx = await getLoyaltyTransaction(executor, order.id, "spend");
  const refundTx = await getLoyaltyTransaction(executor, order.id, "refund");
  const refundedAmount = parseFloat(refundTx?.amount) || 0;
  if (spendTx && refundedAmount <= 0) {
    return spendTx;
  }
  if (spendTx && refundedAmount > 0) {
    const reapplyAmount = Math.min(refundedAmount, bonusUsed);
    const newBalance = currentBalance - reapplyAmount;
    await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, order.user_id]);
    await updateLoyaltyTransaction(executor, refundTx.id, {
      amount: Math.max(0, refundedAmount - reapplyAmount),
      balance_before: currentBalance,
      balance_after: newBalance,
      description: `Возврат списанных бонусов за отменённый заказ #${order.order_number}`,
    });
    return spendTx;
  }
  const newBalance = currentBalance - bonusUsed;
  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, order.user_id]);
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "spend",
    amount: -bonusUsed,
    balance_before: currentBalance,
    balance_after: newBalance,
    description: `Списание бонусов за заказ #${order.order_number}`,
  });
  await executor.query("UPDATE orders SET bonus_spend_transaction_id = ? WHERE id = ?", [txId, order.id]);
  return { id: txId, amount: -bonusUsed, balance_after: newBalance };
}
export async function earnBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;
  const [users] = await executor.query("SELECT loyalty_level, bonus_balance, total_spent FROM users WHERE id = ?", [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const loyaltyLevel = users[0].loyalty_level || 1;
  const amountForBonus = Math.max(0, (parseFloat(order.subtotal) || 0) - (parseFloat(order.bonus_used) || 0));
  const amount = calculateEarnedBonuses(amountForBonus, loyaltyLevel, levels);
  if (amount <= 0) {
    return null;
  }
  const existing = await getLoyaltyTransaction(executor, order.id, "earn");
  const cancelTx = await getLoyaltyTransaction(executor, order.id, "cancel_earn");
  const cancelledAmount = Math.abs(parseFloat(cancelTx?.amount) || 0);
  if (existing && cancelledAmount > 0) {
    const restoreAmount = Math.min(cancelledAmount, amount);
    if (restoreAmount <= 0) return existing;
    const balanceBefore = parseFloat(users[0].bonus_balance) || 0;
    const newBalance = balanceBefore + restoreAmount;
    await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [
      newBalance,
      (parseFloat(users[0].total_spent) || 0) + (parseFloat(order.total) || 0),
      order.user_id,
    ]);
    await updateLoyaltyTransaction(executor, cancelTx.id, {
      amount: -(cancelledAmount - restoreAmount),
      balance_before: balanceBefore,
      balance_after: newBalance,
      description: `Отмена начисления бонусов за заказ #${order.order_number}`,
    });
    await updateLoyaltyTransaction(executor, existing.id, {
      amount,
      balance_before: balanceBefore,
      balance_after: newBalance,
      description: `Начисление бонусов за заказ #${order.order_number}`,
    });
    await executor.query("UPDATE orders SET bonus_earned = ?, bonus_earn_transaction_id = ? WHERE id = ?", [amount, existing.id, order.id]);
    const levelUp = await checkLevelUp(order.user_id, levels, executor);
    return { id: existing.id, amount, balance_after: newBalance, level_up: levelUp };
  }
  if (existing) {
    return existing;
  }
  const balanceBefore = parseFloat(users[0].bonus_balance) || 0;
  const newBalance = balanceBefore + amount;
  await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [
    newBalance,
    (parseFloat(users[0].total_spent) || 0) + (parseFloat(order.total) || 0),
    order.user_id,
  ]);
  const txId = await insertLoyaltyTransaction(executor, {
    user_id: order.user_id,
    order_id: order.id,
    type: "earn",
    amount,
    balance_before: balanceBefore,
    balance_after: newBalance,
    description: `Начисление бонусов за заказ #${order.order_number}`,
  });
  await executor.query("UPDATE orders SET bonus_earned = ?, bonus_earn_transaction_id = ? WHERE id = ?", [amount, txId, order.id]);
  const levelUp = await checkLevelUp(order.user_id, levels, executor);
  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyBonusUpdate(order.user_id, newBalance, {
      type: "earned",
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

export async function refundBonuses(order, connection = null) {
  const executor = connection || db;
  const bonusUsed = parseFloat(order.bonus_used) || 0;
  if (bonusUsed <= 0) return null;
  const spendTx = await getLoyaltyTransaction(executor, order.id, "spend");
  if (!spendTx) return null;
  const existingRefund = await getLoyaltyTransaction(executor, order.id, "refund");
  const [users] = await executor.query("SELECT bonus_balance FROM users WHERE id = ?", [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = parseFloat(users[0].bonus_balance) || 0;
  const desiredRefund = bonusUsed;
  const currentRefund = parseFloat(existingRefund?.amount) || 0;
  const delta = desiredRefund - currentRefund;
  if (delta === 0) return existingRefund;
  const balanceBefore = currentBalance;
  const newBalance = currentBalance + delta;
  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, order.user_id]);
  const payload = {
    amount: desiredRefund,
    balance_before: balanceBefore,
    balance_after: newBalance,
    description: `Возврат списанных бонусов за отменённый заказ #${order.order_number}`,
  };
  let txId = existingRefund?.id || null;
  if (txId) {
    await updateLoyaltyTransaction(executor, txId, payload);
  } else {
    txId = await insertLoyaltyTransaction(executor, {
      user_id: order.user_id,
      order_id: order.id,
      type: "refund",
      ...payload,
    });
  }
  return { id: txId, amount: desiredRefund, balance_after: newBalance };
}

export async function cancelEarnedBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const executor = connection || db;
  const earnedAmount = parseFloat(order.bonus_earned) || 0;
  if (earnedAmount <= 0) return null;
  const earnTx = await getLoyaltyTransaction(executor, order.id, "earn");
  if (!earnTx) return null;
  const existingCancel = await getLoyaltyTransaction(executor, order.id, "cancel_earn");
  const [users] = await executor.query("SELECT bonus_balance, total_spent FROM users WHERE id = ?", [order.user_id]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const currentBalance = parseFloat(users[0].bonus_balance) || 0;
  const currentTotalSpent = parseFloat(users[0].total_spent) || 0;
  const desiredCancel = -earnedAmount;
  const currentCancel = parseFloat(existingCancel?.amount) || 0;
  const delta = desiredCancel - currentCancel;
  if (delta === 0) return existingCancel;
  const balanceBefore = currentBalance;
  const newBalance = currentBalance + delta;
  if (newBalance < 0) {
    throw new Error("Невозможно отменить начисление: недостаточно бонусов на балансе");
  }
  await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [
    newBalance,
    Math.max(0, currentTotalSpent - (parseFloat(order.total) || 0)),
    order.user_id,
  ]);
  const payload = {
    amount: desiredCancel,
    balance_before: balanceBefore,
    balance_after: newBalance,
    description: `Отмена начисления бонусов за заказ #${order.order_number}`,
  };
  let txId = existingCancel?.id || null;
  if (txId) {
    await updateLoyaltyTransaction(executor, txId, payload);
  } else {
    txId = await insertLoyaltyTransaction(executor, {
      user_id: order.user_id,
      order_id: order.id,
      type: "cancel_earn",
      ...payload,
    });
  }
  await executor.query("UPDATE orders SET bonus_earned = 0, bonus_earn_transaction_id = NULL WHERE id = ?", [order.id]);
  await checkLevelUp(order.user_id, levels, executor);
  return { id: txId, amount: desiredCancel, balance_after: newBalance };
}
export async function rollbackOrderBonuses({
  userId,
  orderId,
  orderNumber,
  bonusUsed = 0,
  orderTotal = 0,
  connection = null,
  levels = DEFAULT_LOYALTY_LEVELS,
}) {
  const executor = connection || db;
  const selectBalanceSql = connection
    ? "SELECT bonus_balance, total_spent FROM users WHERE id = ? FOR UPDATE"
    : "SELECT bonus_balance, total_spent FROM users WHERE id = ?";
  const [users] = await executor.query(selectBalanceSql, [userId]);
  const currentBalance = parseFloat(users[0]?.bonus_balance) || 0;
  const currentTotalSpent = parseFloat(users[0]?.total_spent) || 0;
  let balanceAfter = currentBalance;
  if (bonusUsed > 0) {
    const refundEntry = await getManualEntry(executor, orderId, MANUAL_PREFIX.refund, "Возврат бонусов за отмену заказа");
    const refundedTotal = parseFloat(refundEntry?.amount) || 0;
    const desiredRefund = Math.max(0, bonusUsed);
    const refundDelta = desiredRefund - refundedTotal;
    if (refundDelta !== 0) {
      balanceAfter = currentBalance + refundDelta;
      await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [balanceAfter, userId]);
      await setManualEntryAmount(executor, {
        userId,
        orderId,
        entry: refundEntry,
        prefix: MANUAL_PREFIX.refund,
        label: `Возврат бонусов за отмену заказа #${orderNumber}`,
        amount: desiredRefund,
        balanceAfter,
      });
    }
  }
  const earnedEntry = await getEarnedEntry(executor, orderId);
  const earnedTotal = parseFloat(earnedEntry?.amount) || 0;
  if (earnedTotal > 0) {
    const rollbackEntry = await getManualEntry(executor, orderId, MANUAL_PREFIX.rollback, "Аннулирование бонусов за отмену заказа");
    const rolledBackTotal = parseFloat(rollbackEntry?.amount) || 0;
    const desiredRollback = Math.max(0, earnedTotal);
    const rollbackDelta = desiredRollback - rolledBackTotal;
    if (rollbackDelta !== 0) {
      balanceAfter = Math.max(0, balanceAfter - rollbackDelta);
      const spendDelta = desiredRollback > 0 ? orderTotal * (rollbackDelta / desiredRollback) : 0;
      const updatedTotalSpent = Math.max(0, currentTotalSpent - spendDelta);
      await executor.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [balanceAfter, updatedTotalSpent, userId]);
      await setManualEntryAmount(executor, {
        userId,
        orderId,
        entry: rollbackEntry,
        prefix: MANUAL_PREFIX.rollback,
        label: `Аннулирование бонусов за отмену заказа #${orderNumber}`,
        amount: desiredRollback,
        balanceAfter,
      });
    }
  }
  await checkLevelUp(userId, levels, executor);
}
export async function reapplyOrderBonuses({ userId, orderId, orderNumber, bonusUsed = 0, connection = null }) {
  if (bonusUsed <= 0) return;
  const executor = connection || db;
  const refundEntry = await getManualEntry(executor, orderId, MANUAL_PREFIX.refund, "Возврат бонусов за отмену заказа");
  const refundedTotal = parseFloat(refundEntry?.amount) || 0;
  const amountToReapply = Math.max(0, Math.min(bonusUsed, refundedTotal));
  if (amountToReapply <= 0) return;
  const selectBalanceSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";
  const [users] = await executor.query(selectBalanceSql, [userId]);
  const currentBalance = parseFloat(users[0]?.bonus_balance) || 0;
  if (amountToReapply > currentBalance) {
    throw new Error("Недостаточно бонусов для восстановления заказа");
  }
  const newBalance = currentBalance - amountToReapply;
  await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);
  const updatedRefund = Math.max(0, refundedTotal - amountToReapply);
  await setManualEntryAmount(executor, {
    userId,
    orderId,
    entry: refundEntry,
    prefix: MANUAL_PREFIX.refund,
    label: `Возврат бонусов за отмену заказа #${orderNumber}`,
    amount: updatedRefund,
    balanceAfter: newBalance,
  });
}
export async function useBonuses(userId, orderId, amount, description = null, connection = null) {
  if (amount <= 0) {
    return null;
  }
  const executor = connection || db;
  const maxAttempts = 3;
  const selectBalanceSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [users] = await executor.query(selectBalanceSql, [userId]);
      if (users.length === 0) {
        throw new Error("User not found");
      }
      const currentBalance = parseFloat(users[0].bonus_balance);
      if (amount > currentBalance) {
        throw new Error("Insufficient bonus balance");
      }
      const newBalance = currentBalance - amount;
      await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);
      const [result] = await executor.query(
        `INSERT INTO bonus_history 
         (user_id, order_id, type, amount, balance_after, description)
         VALUES (?, ?, 'used', ?, ?, ?)`,
        [userId, orderId, amount, newBalance, description || "Списание бонусов"],
      );
      try {
        const { wsServer } = await import("../index.js");
        wsServer.notifyBonusUpdate(userId, newBalance, {
          type: "used",
          amount,
          orderId,
        });
      } catch (wsError) {
        console.error("Failed to send WebSocket notification:", wsError);
      }
      return {
        id: result.insertId,
        amount,
        balance_after: newBalance,
      };
    } catch (error) {
      const isLockError = error?.code === "ER_LOCK_WAIT_TIMEOUT" || error?.code === "ER_LOCK_DEADLOCK";
      if (!isLockError || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
  return null;
}
export async function getBonusHistory(userId, limit = 50, offset = 0) {
  const [rows] = await db.query(
    `SELECT 
      lt.id,
      lt.order_id,
      o.order_number,
      lt.type,
      lt.amount,
      lt.balance_after,
      lt.description,
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
export default {
  calculateEarnedBonuses,
  calculateMaxUsableBonuses,
  getLoyaltyLevelsFromSettings,
  getMaxUsePercentFromSettings,
  getRedeemPercentForLevel,
  validateBonusUsage,
  earnBonuses,
  spendBonuses,
  refundBonuses,
  cancelEarnedBonuses,
  getBonusHistory,
  checkLevelUp,
};
