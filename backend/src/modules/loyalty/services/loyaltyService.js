import db from "../../../config/database.js";
import redis from "../../../config/redis.js";
import { getSystemSettings } from "../../../utils/settings.js";
import {
  getUserLoyaltySnapshot,
  updateUserBalance,
  updateUserLevel,
  ensureUserLoyaltyDefaults,
  getLoyaltyLevels,
  getTotalSpentForPeriod as getTotalSpentForPeriodRepo,
  getExpiringBonuses,
  getLoyaltyHistory,
  getLoyaltyTransactions,
  getLoyaltySummary,
  getLoyaltyLevelHistory,
  getLoyaltyTransaction,
  getOrderLoyaltyTransactions,
  insertLoyaltyTransaction,
  updateTransactionRemaining,
  updateTransactionStatus,
  updateTransactionStatusAndRemaining,
  getTransactionById,
  getEarnTransactions,
  insertLevelHistory,
  markSpendTransactionsCompleted,
  getOrderBonusLock,
  lockOrderBonusEarn,
  updateOrderBonusEarnAmount,
  unlockOrderBonusEarn,
  resetOrderBonusSpent,
  getOrderSpendTotal,
  getUserById,
  getUsersForBirthday,
  getBirthdayTransaction,
  getRegistrationTransaction,
  insertExpireTransaction,
} from "../repositories/loyaltyRepository.js";
import { logLoyaltyEvent } from "../repositories/loyaltyLogRepository.js";

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

const BONUS_CACHE_PREFIX = "bonuses:user_";
const getBonusCacheKey = (userId) => `${BONUS_CACHE_PREFIX}${userId}`;

const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const toInt = (value) => Math.floor(Number(value) || 0);

const mapLevels = (rows) => {
  if (!rows.length) return DEFAULT_LOYALTY_LEVELS;
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
};

const getSortedLevels = (levelsMap) => Object.values(levelsMap).sort((a, b) => a.threshold - b.threshold);

const getCurrentLevel = (totalSpent, sortedLevels) => {
  let current = sortedLevels[0] || null;
  for (const level of sortedLevels) {
    if (totalSpent >= level.threshold) {
      current = level;
    }
  }
  return current;
};

const getNextLevel = (current, sortedLevels) => {
  if (!current) return null;
  const index = sortedLevels.findIndex((level) => level.id === current.id);
  if (index < 0 || index >= sortedLevels.length - 1) return null;
  return sortedLevels[index + 1];
};

const getProgress = (totalSpent, current, next) => {
  if (!current || !next) {
    return { progress: 1, amount_to_next: 0 };
  }
  const span = next.threshold - current.threshold;
  if (span <= 0) {
    return { progress: 1, amount_to_next: 0 };
  }
  const progress = Math.min(1, Math.max(0, (totalSpent - current.threshold) / span));
  return {
    progress,
    amount_to_next: Math.max(0, next.threshold - totalSpent),
  };
};

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

const notifyWsBonusUpdate = async (userId, balance, payload) => {
  try {
    const { wsServer } = await import("../../../index.js");
    wsServer.notifyBonusUpdate(userId, balance, payload);
  } catch (error) {
    console.error("Failed to send WebSocket notification:", error);
  }
};

const notifyWsLevelUp = async (userId, levelId, levelName) => {
  try {
    const { wsServer } = await import("../../../index.js");
    wsServer.notifyLevelUp(userId, levelId, levelName);
  } catch (error) {
    console.error("Failed to send WebSocket notification:", error);
  }
};

export async function invalidateBonusCache(userId) {
  try {
    await redis.del(getBonusCacheKey(userId));
  } catch (error) {
    console.error("Не удалось инвалидировать кеш бонусов:", error);
  }
}

export function getConnection() {
  return db.getConnection();
}

export async function getLevelsMap(connection = null) {
  const rows = await getLoyaltyLevels({ connection });
  return mapLevels(rows);
}

export async function getLoyaltyLevelsFromDb(connection = null) {
  return getLevelsMap(connection);
}

export async function getTotalSpentForPeriod(userId, periodDays, connection = null) {
  return getTotalSpentForPeriodRepo(userId, periodDays, { connection });
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
  const snapshot = await getUserLoyaltySnapshot(userId);
  if (!snapshot) {
    return { valid: false, error: "User not found" };
  }
  const userBalance = parseFloat(snapshot.loyalty_balance);
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

export async function getBalanceSummary(userId) {
  const snapshot = await getUserLoyaltySnapshot(userId);
  if (!snapshot) {
    throw new Error("Пользователь не найден");
  }
  const levels = await getLevelsMap();
  const sortedLevels = getSortedLevels(levels);
  const totalSpent = await getTotalSpentForPeriodRepo(userId, LOYALTY_LEVEL_PERIOD_DAYS);
  const currentLevel = getCurrentLevel(totalSpent, sortedLevels);
  const nextLevel = getNextLevel(currentLevel, sortedLevels);
  const { progress, amount_to_next } = getProgress(totalSpent, currentLevel, nextLevel);
  const expiring = await getExpiringBonuses(userId, 14);
  const expiringTotal = expiring.reduce((sum, bonus) => sum + (parseFloat(bonus.amount) || 0), 0);

  return {
    balance: parseFloat(snapshot.loyalty_balance) || 0,
    total_spent_60_days: totalSpent,
    current_level: currentLevel,
    next_level: nextLevel,
    progress_to_next_level: progress,
    amount_to_next_level: amount_to_next,
    expiring_bonuses: expiring,
    total_expiring: Math.floor(expiringTotal),
  };
}

export async function calculateMaxSpend(userId, orderTotal, deliveryCost) {
  const snapshot = await getUserLoyaltySnapshot(userId);
  if (!snapshot) {
    throw new Error("Пользователь не найден");
  }
  const userBalance = parseFloat(snapshot.loyalty_balance) || 0;
  const loyaltyLevelId = snapshot.current_loyalty_level_id || 1;
  const loyaltyLevels = await getLevelsMap();
  const maxUsePercent = getRedeemPercentForLevel(loyaltyLevelId, loyaltyLevels);
  const baseAmount = Math.max(0, orderTotal - deliveryCost);
  const maxByRule = Math.floor(baseAmount * maxUsePercent);
  const maxUsable = Math.min(userBalance, maxByRule);
  return {
    max_usable: maxUsable,
    user_balance: userBalance,
    max_percent: maxUsePercent,
  };
}

export async function getHistory(userId, page, limit) {
  const offset = (page - 1) * limit;
  const rows = await getLoyaltyHistory(userId, limit + 1, offset);
  const hasMore = rows.length > limit;
  return {
    page,
    limit,
    has_more: hasMore,
    transactions: hasMore ? rows.slice(0, limit) : rows,
  };
}

export async function getLevelsSummary(userId) {
  const levels = await getLevelsMap();
  const sortedLevels = getSortedLevels(levels);
  const totalSpent = await getTotalSpentForPeriodRepo(userId, LOYALTY_LEVEL_PERIOD_DAYS);
  const currentLevel = getCurrentLevel(totalSpent, sortedLevels);
  const nextLevel = getNextLevel(currentLevel, sortedLevels);
  const { progress, amount_to_next } = getProgress(totalSpent, currentLevel, nextLevel);

  return {
    current_level: currentLevel,
    next_level: nextLevel,
    total_spent_60_days: totalSpent,
    progress_to_next_level: progress,
    amount_to_next_level: amount_to_next,
    levels: sortedLevels,
    period_days: LOYALTY_LEVEL_PERIOD_DAYS,
  };
}

export async function getAdminUserLoyalty(userId) {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("Пользователь не найден");
  }
  const levels = await getLevelsMap();
  const sortedLevels = getSortedLevels(levels);
  const totalSpent = await getTotalSpentForPeriodRepo(userId, LOYALTY_LEVEL_PERIOD_DAYS);
  const currentLevel = getCurrentLevel(totalSpent, sortedLevels);
  const nextLevel = getNextLevel(currentLevel, sortedLevels);
  const { progress, amount_to_next } = getProgress(totalSpent, currentLevel, nextLevel);
  const transactions = await getLoyaltyTransactions(userId, 50);
  const summary = await getLoyaltySummary(userId);
  const levelHistory = await getLoyaltyLevelHistory(userId);

  return {
    user,
    stats: {
      total_spent_60_days: Math.floor(totalSpent),
      total_earned: Math.floor(summary.total_earned || 0),
      total_spent: Math.floor(summary.total_spent || 0),
      total_expired: Math.floor(summary.total_expired || 0),
      progress_to_next_level: progress,
      amount_to_next_level: Math.floor(amount_to_next),
      current_level: currentLevel,
      next_level: nextLevel,
    },
    transactions,
    level_history: levelHistory,
  };
}

export async function applyManualBonusAdjustment({ userId, delta, description, connection = null, adminId = null }) {
  const snapshot = await getUserLoyaltySnapshot(userId, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("User not found");
  }
  const currentBalance = toInt(parseFloat(snapshot.loyalty_balance) || 0);
  if (delta === 0) {
    return { balance: currentBalance };
  }
  const newBalance = currentBalance + toInt(delta);
  if (newBalance < 0) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  if (delta < 0) {
    await consumeEarnAmounts(userId, Math.abs(delta), connection);
  }
  await updateUserBalance(userId, newBalance, { connection });
  const txId = await insertLoyaltyTransaction(
    {
      user_id: userId,
      type: "adjustment",
      amount: toInt(delta),
      status: "completed",
      description: description || "Ручная корректировка",
      admin_id: adminId,
    },
    { connection },
  );
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

async function consumeEarnAmounts(userId, amount, connection = null) {
  if (amount <= 0) return [];
  const earns = await getEarnTransactions(userId, { onlyActive: true, connection, forUpdate: Boolean(connection) });
  let remaining = amount;
  const allocations = [];
  for (const earn of earns) {
    if (remaining <= 0) break;
    const available = parseFloat(earn.remaining_amount) || 0;
    if (available <= 0) continue;
    const delta = Math.min(available, remaining);
    const newAmount = Math.max(0, available - delta);
    await updateTransactionRemaining(earn.id, newAmount, { connection });
    allocations.push({ earnId: earn.id, amount: delta });
    remaining -= delta;
  }
  if (remaining > 0) {
    throw new Error("Недостаточно активных бонусов для списания");
  }
  return allocations;
}

async function restoreEarnAmounts(userId, amount, connection = null) {
  if (amount <= 0) return;
  const earns = await getEarnTransactions(userId, { onlyActive: false, connection, forUpdate: Boolean(connection) });
  let remaining = amount;
  for (const earn of earns) {
    if (remaining <= 0) break;
    const currentAmount = parseFloat(earn.remaining_amount) || 0;
    const add = remaining;
    const newAmount = currentAmount + add;
    await updateTransactionRemaining(earn.id, newAmount, { connection });
    remaining = 0;
  }
  if (remaining > 0) {
    await insertLoyaltyTransaction(
      {
        user_id: userId,
        type: "earn",
        amount: remaining,
        remaining_amount: remaining,
        expires_at: getExpiryDateFromSettings(await getSystemSettings()),
        status: "completed",
        description: "Восстановление бонусов",
      },
      { connection },
    );
  }
}

export async function checkLevelUp(userId, levels = null, connection = null) {
  const activeLevels = levels || (await getLevelsMap(connection));
  const snapshot = await getUserLoyaltySnapshot(userId, { connection });
  if (!snapshot) return null;
  const currentLevelId = snapshot.current_loyalty_level_id || 1;
  const totalSpent = await getTotalSpentForPeriodRepo(userId, LOYALTY_LEVEL_PERIOD_DAYS, { connection });
  const sortedLevels = Object.values(activeLevels).sort((a, b) => b.threshold - a.threshold);
  let newLevelId = sortedLevels.length ? sortedLevels[sortedLevels.length - 1].id : 1;
  for (const level of sortedLevels) {
    if (totalSpent >= level.threshold) {
      newLevelId = level.id || newLevelId;
      break;
    }
  }

  if (newLevelId !== currentLevelId && newLevelId > currentLevelId) {
    await updateUserLevel(userId, newLevelId, { connection });
    await insertLevelHistory(
      {
        userId,
        levelId: newLevelId,
        previousLevelId: currentLevelId,
        reason: "threshold_reached",
        thresholdSum: totalSpent,
      },
      { connection },
    );
    await logLoyaltyEvent({
      eventType: "level_changed",
      userId,
      oldValue: String(currentLevelId),
      newValue: String(newLevelId),
      metadata: { total_spent: totalSpent },
    });
    await notifyWsLevelUp(userId, newLevelId, activeLevels[newLevelId]?.name);
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
  const bonusSpent = toInt(parseFloat(order.bonus_spent) || 0);
  if (bonusSpent <= 0) return null;
  const existingTotal = await getOrderSpendTotal(order.id, { connection });
  if (existingTotal > 0) {
    return { amount: Number(existingTotal) };
  }
  const snapshot = await getUserLoyaltySnapshot(order.user_id, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("User not found");
  }
  const currentBalance = toInt(parseFloat(snapshot.loyalty_balance) || 0);
  if (currentBalance < bonusSpent) {
    throw new Error("Недостаточно бонусов на балансе");
  }
  const allocations = await consumeEarnAmounts(order.user_id, bonusSpent, connection);
  const newBalance = currentBalance - bonusSpent;
  await updateUserBalance(order.user_id, newBalance, { connection });
  const transactionIds = [];
  for (const allocation of allocations) {
    const txId = await insertLoyaltyTransaction(
      {
        user_id: order.user_id,
        order_id: order.id,
        type: "spend",
        amount: toInt(allocation.amount),
        status: "pending",
        related_transaction_id: allocation.earnId,
        description: "Списание бонусов",
      },
      { connection },
    );
    transactionIds.push(txId);
  }
  await invalidateBonusCache(order.user_id);
  return { ids: transactionIds, amount: bonusSpent, balance_after: newBalance };
}

export async function earnBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const existing = await getLoyaltyTransaction(order.id, "earn", { connection });
  if (existing) {
    return existing;
  }

  const lockedOrder = await getOrderBonusLock(order.id, { connection, forUpdate: true });
  if (!lockedOrder) {
    throw new Error("Заказ не найден");
  }

  if (lockedOrder.bonus_earn_locked) {
    console.log(`Начисление за заказ ${order.id} уже заблокировано, пропуск дублирования`);
    return null;
  }

  const affected = await lockOrderBonusEarn(order.id, { connection });
  if (affected === 0) {
    console.log(`Не удалось установить блокировку для заказа ${order.id}, возможно другой процесс уже обработал`);
    return null;
  }

  const snapshot = await getUserLoyaltySnapshot(order.user_id, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("Пользователь не найден");
  }

  const loyaltyLevelId = snapshot.current_loyalty_level_id || 1;
  const baseAmount = getEarnBaseAmount(order);
  const amount = calculateEarnedBonuses(baseAmount, loyaltyLevelId, levels);

  if (amount <= 0) {
    await updateOrderBonusEarnAmount(order.id, 0, { connection });
    return null;
  }

  const balanceBefore = toInt(parseFloat(snapshot.loyalty_balance) || 0);
  const newBalance = balanceBefore + toInt(amount);
  await updateUserBalance(order.user_id, newBalance, { connection });

  await updateOrderBonusEarnAmount(order.id, toInt(amount), { connection });

  const expiresAt = new Date(Date.now() + DEFAULT_BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  const txId = await insertLoyaltyTransaction(
    {
      user_id: order.user_id,
      type: "earn",
      amount: toInt(amount),
      remaining_amount: toInt(amount),
      order_id: order.id,
      expires_at: expiresAt,
      status: "completed",
    },
    { connection },
  );

  const levelUp = await checkLevelUp(order.user_id, levels, connection);
  await invalidateBonusCache(order.user_id);

  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId: order.user_id,
    orderId: order.id,
    oldValue: String(balanceBefore),
    newValue: String(newBalance),
    metadata: { amount: toInt(amount), base_amount: baseAmount, level_id: loyaltyLevelId },
  });

  await notifyWsBonusUpdate(order.user_id, newBalance, {
    type: "earn",
    amount,
    orderId: order.id,
    level_up: levelUp,
  });

  return {
    id: txId,
    amount,
    balance_after: newBalance,
    level_up: levelUp,
  };
}

export async function removeEarnedBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const earnTx = await getLoyaltyTransaction(order.id, "earn", { connection });
  if (!earnTx) return null;

  const snapshot = await getUserLoyaltySnapshot(order.user_id, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("Пользователь не найден");
  }

  const currentBalance = parseFloat(snapshot.loyalty_balance) || 0;
  const earnedAmount = parseFloat(earnTx.amount) || 0;
  const newBalance = currentBalance - earnedAmount;
  await updateUserBalance(order.user_id, newBalance, { connection });

  await updateTransactionStatusAndRemaining(earnTx.id, "cancelled", 0, { connection });
  const adjustmentId = await insertLoyaltyTransaction(
    {
      user_id: order.user_id,
      type: "adjustment",
      amount: -toInt(earnedAmount),
      status: "completed",
      description: "Отмена начисления при смене статуса",
      related_transaction_id: earnTx.id,
    },
    { connection },
  );

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

  await unlockOrderBonusEarn(order.id, { connection });

  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId: order.user_id,
    orderId: order.id,
    oldValue: String(currentBalance),
    newValue: String(newBalance),
    metadata: { adjustment_id: adjustmentId, amount: toInt(earnedAmount) },
  });

  await invalidateBonusCache(order.user_id);
  await checkLevelUp(order.user_id, levels, connection);

  return { id: earnTx.id, amount: earnedAmount, balance_after: newBalance };
}

export async function redeliveryEarnBonuses(order, connection = null) {
  const lockedOrder = await getOrderBonusLock(order.id, { connection });
  if (!lockedOrder || !lockedOrder.bonus_earn_amount) {
    console.log(`Нет сохранённой суммы начисления для заказа ${order.id}, пропуск`);
    return null;
  }

  const savedAmount = parseFloat(lockedOrder.bonus_earn_amount);
  if (savedAmount <= 0) return null;

  const snapshot = await getUserLoyaltySnapshot(order.user_id, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("Пользователь не найден");
  }

  const balanceBefore = toInt(parseFloat(snapshot.loyalty_balance) || 0);
  const newBalance = balanceBefore + toInt(savedAmount);

  await updateUserBalance(order.user_id, newBalance, { connection });

  const expiresAt = new Date(Date.now() + DEFAULT_BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  const txId = await insertLoyaltyTransaction(
    {
      user_id: order.user_id,
      order_id: order.id,
      type: "earn",
      amount: toInt(savedAmount),
      remaining_amount: toInt(savedAmount),
      expires_at: expiresAt,
      status: "completed",
      description: "Повторное начисление при повторной доставке",
    },
    { connection },
  );

  await logLoyaltyEvent({
    eventType: "balance_calculated",
    userId: order.user_id,
    orderId: order.id,
    oldValue: String(balanceBefore),
    newValue: String(newBalance),
    metadata: { amount: toInt(savedAmount), transaction_id: txId },
  });

  await invalidateBonusCache(order.user_id);
  await notifyWsBonusUpdate(order.user_id, newBalance, {
    type: "earn",
    amount: savedAmount,
    orderId: order.id,
  });

  return {
    id: txId,
    amount: savedAmount,
    balance_after: newBalance,
  };
}

export async function cancelOrderBonuses(order, connection = null, levels = DEFAULT_LOYALTY_LEVELS) {
  const snapshot = await getUserLoyaltySnapshot(order.user_id, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("User not found");
  }
  const transactions = await getOrderLoyaltyTransactions(order.id, { connection });
  if (!transactions.length) return null;

  const earnedAmount = transactions.filter((tx) => tx.type === "earn" && tx.status !== "cancelled");
  const spentAmount = transactions.filter((tx) => tx.type === "spend" && tx.status !== "cancelled");

  if (spentAmount.length > 0) {
    for (const tx of spentAmount) {
      if (tx.related_transaction_id) {
        const related = await getTransactionById(tx.related_transaction_id, { connection, forUpdate: true });
        if (related) {
          const currentRemaining = parseFloat(related.remaining_amount) || 0;
          await updateTransactionRemaining(related.id, currentRemaining + (parseFloat(tx.amount) || 0), { connection });
        }
      }
      await updateTransactionStatus(tx.id, "cancelled", { connection });
    }
  }

  if (earnedAmount.length > 0) {
    for (const tx of earnedAmount) {
      await updateTransactionStatusAndRemaining(tx.id, "cancelled", 0, { connection });
    }
  }

  const spentTotal = spentAmount.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const earnedTotal = earnedAmount.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const currentBalance = parseFloat(snapshot.loyalty_balance) || 0;
  const newBalance = currentBalance + spentTotal - earnedTotal;
  await updateUserBalance(order.user_id, newBalance, { connection });

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
  await checkLevelUp(order.user_id, levels, connection);
  await resetOrderBonusSpent(order.id, { connection });
  return { spent: spentTotal, earned: earnedTotal, balance_after: newBalance };
}

export async function grantRegistrationBonus(userId, connection = null) {
  const amount = REGISTRATION_BONUS_AMOUNT;
  if (amount <= 0) {
    return null;
  }
  const snapshot = await getUserLoyaltySnapshot(userId, { connection, forUpdate: Boolean(connection) });
  if (!snapshot) {
    throw new Error("User not found");
  }
  const existing = await getRegistrationTransaction(userId, { connection });
  if (existing) {
    return null;
  }
  const currentBalance = toInt(parseFloat(snapshot.loyalty_balance) || 0);
  const newBalance = currentBalance + amount;
  const expiresAt = new Date(Date.now() + REGISTRATION_BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await updateUserBalance(userId, newBalance, { connection });
  await ensureUserLoyaltyDefaults(userId, { connection });
  await insertLevelHistory(
    {
      userId,
      levelId: 1,
      previousLevelId: null,
      reason: "registration",
      thresholdSum: 0,
    },
    { connection },
  );
  const txId = await insertLoyaltyTransaction(
    {
      user_id: userId,
      type: "registration",
      amount,
      remaining_amount: amount,
      expires_at: expiresAt,
      status: "completed",
      description: "Бонус за регистрацию",
    },
    { connection },
  );
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

export async function expireBonusesForUser(userId, connection) {
  const snapshot = await getUserLoyaltySnapshot(userId, { connection, forUpdate: true });
  if (!snapshot) {
    return { expiredTotal: 0, balance: null };
  }

  const earns = await getEarnTransactions(userId, { onlyActive: false, connection, forUpdate: true });
  const expiredEarns = earns.filter((earn) => earn.expires_at && new Date(earn.expires_at) <= new Date() && (parseFloat(earn.remaining_amount) || 0) > 0);

  let expiredTotal = 0;
  for (const earn of expiredEarns) {
    const amount = Math.floor(parseFloat(earn.remaining_amount) || 0);
    if (amount <= 0) continue;
    expiredTotal += amount;
    await updateTransactionRemaining(earn.id, 0, { connection });
    await insertExpireTransaction({ userId, amount, relatedId: earn.id, expiresAt: earn.expires_at }, { connection });
  }

  if (expiredTotal > 0) {
    const currentBalance = parseFloat(snapshot.loyalty_balance) || 0;
    const newBalance = currentBalance - expiredTotal;
    await updateUserBalance(userId, newBalance, { connection });
    await invalidateBonusCache(userId);
    await logLoyaltyEvent({
      eventType: "bonus_expired",
      userId,
      oldValue: String(currentBalance),
      newValue: String(newBalance),
      metadata: { amount: expiredTotal },
    });
    return { expiredTotal, balance: newBalance };
  }

  return { expiredTotal: 0, balance: parseFloat(snapshot.loyalty_balance) || 0 };
}

export async function issueBirthdayBonuses() {
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
  const users = await getUsersForBirthday(targetMonth, targetDay);
  for (const user of users) {
    const existing = await getBirthdayTransaction(user.id, targetYear);
    if (existing) {
      continue;
    }
    const currentBalance = Math.floor(parseFloat(user.loyalty_balance) || 0);
    const newBalance = currentBalance + Math.floor(amount);
    const birthdayDate = new Date(targetYear, targetMonth - 1, targetDay);
    const expiresAt = new Date(birthdayDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
    const txId = await insertLoyaltyTransaction({
      user_id: user.id,
      type: "birthday",
      status: "completed",
      amount: Math.floor(amount),
      remaining_amount: Math.floor(amount),
      expires_at: expiresAt,
      description: "Бонус ко дню рождения",
    });
    await updateUserBalance(user.id, newBalance);
    await logLoyaltyEvent({
      eventType: "balance_calculated",
      userId: user.id,
      oldValue: String(currentBalance),
      newValue: String(newBalance),
      metadata: { amount: Math.floor(amount), transaction_id: txId, target_date: targetDate.toISOString().slice(0, 10) },
    });
  }
}

export default {
  invalidateBonusCache,
  getConnection,
  getLevelsMap,
  getLoyaltyLevelsFromDb,
  getRedeemPercentForLevel,
  calculateEarnedBonuses,
  calculateMaxUsableBonuses,
  validateBonusUsage,
  getBalanceSummary,
  calculateMaxSpend,
  getHistory,
  getLevelsSummary,
  getAdminUserLoyalty,
  applyManualBonusAdjustment,
  checkLevelUp,
  spendBonuses,
  earnBonuses,
  removeEarnedBonuses,
  redeliveryEarnBonuses,
  cancelOrderBonuses,
  grantRegistrationBonus,
  expireBonusesForUser,
  issueBirthdayBonuses,
  getTotalSpentForPeriod,
};
