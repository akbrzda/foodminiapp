import express from "express";
import db from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  getLoyaltyLevelsFromDb,
  getRedeemPercentForLevel,
  getTotalSpentForPeriod,
} from "../utils/bonuses.js";
import { getSystemSettings } from "../utils/settings.js";

const router = express.Router();
const EXPIRING_DAYS = 14;
const LEVEL_PERIOD_DAYS = 60;

const ensureBonusesEnabled = async (res) => {
  const settings = await getSystemSettings();
  if (!settings.bonuses_enabled) {
    res.status(403).json({ error: "Бонусная система отключена" });
    return false;
  }
  return true;
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

const getExpiringBonuses = async (userId, days = EXPIRING_DAYS) => {
  const [rows] = await db.query(
    `SELECT 
      id,
      remaining_amount as amount,
      expires_at,
      DATEDIFF(expires_at, NOW()) as days_left
     FROM loyalty_transactions
     WHERE user_id = ?
       AND type IN ('earn','registration','birthday')
       AND status = 'completed'
       AND remaining_amount > 0
       AND expires_at IS NOT NULL
       AND expires_at > NOW()
       AND DATEDIFF(expires_at, NOW()) <= ?
     ORDER BY expires_at ASC`,
    [userId, Math.max(1, Number(days) || EXPIRING_DAYS)],
  );
  const total = rows.reduce((sum, bonus) => sum + (parseFloat(bonus.amount) || 0), 0);
  return { rows, total: Math.floor(total) };
};

router.get("/balance", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;

    const [users] = await db.query("SELECT loyalty_balance, current_loyalty_level_id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const balance = parseFloat(users[0].loyalty_balance) || 0;
    const levels = await getLoyaltyLevelsFromDb();
    const sortedLevels = getSortedLevels(levels);
    const totalSpent = await getTotalSpentForPeriod(userId, LEVEL_PERIOD_DAYS, db);
    const currentLevel = getCurrentLevel(totalSpent, sortedLevels);
    const nextLevel = getNextLevel(currentLevel, sortedLevels);
    const { progress, amount_to_next } = getProgress(totalSpent, currentLevel, nextLevel);

    const expiring = await getExpiringBonuses(userId, EXPIRING_DAYS);

    res.json({
      balance,
      total_spent_60_days: totalSpent,
      current_level: currentLevel,
      next_level: nextLevel,
      progress_to_next_level: progress,
      amount_to_next_level: amount_to_next,
      expiring_bonuses: expiring.rows,
      total_expiring: expiring.total,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/calculate-max-spend", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const orderTotal = Number(req.query.orderTotal);
    const deliveryCost = Number(req.query.deliveryCost) || 0;

    if (!Number.isFinite(orderTotal)) {
      return res.status(400).json({ error: "orderTotal обязателен и должен быть числом" });
    }

    const baseAmount = Math.max(0, orderTotal - deliveryCost);

    const [users] = await db.query("SELECT loyalty_balance, current_loyalty_level_id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const userBalance = parseFloat(users[0].loyalty_balance) || 0;
    const loyaltyLevelId = users[0]?.current_loyalty_level_id || 1;
    const loyaltyLevels = await getLoyaltyLevelsFromDb();
    const maxUsePercent = getRedeemPercentForLevel(loyaltyLevelId, loyaltyLevels);

    const maxByRule = Math.floor(baseAmount * maxUsePercent);
    const maxUsable = Math.min(userBalance, maxByRule);

    res.json({
      max_usable: maxUsable,
      user_balance: userBalance,
      max_percent: maxUsePercent,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/history", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT 
        lt.id,
        lt.order_id,
        o.order_number,
        lt.type,
        lt.amount,
        lt.status,
        lt.remaining_amount,
        lt.expires_at,
        lt.created_at
       FROM loyalty_transactions lt
       LEFT JOIN orders o ON lt.order_id = o.id
       WHERE lt.user_id = ?
       ORDER BY lt.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit + 1, offset],
    );

    const hasMore = rows.length > limit;
    const transactions = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      page,
      limit,
      has_more: hasMore,
      transactions,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/levels", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const levels = await getLoyaltyLevelsFromDb();
    const sortedLevels = getSortedLevels(levels);
    const totalSpent = await getTotalSpentForPeriod(userId, LEVEL_PERIOD_DAYS, db);
    const currentLevel = getCurrentLevel(totalSpent, sortedLevels);
    const nextLevel = getNextLevel(currentLevel, sortedLevels);
    const { progress, amount_to_next } = getProgress(totalSpent, currentLevel, nextLevel);

    res.json({
      current_level: currentLevel,
      next_level: nextLevel,
      total_spent_60_days: totalSpent,
      progress_to_next_level: progress,
      amount_to_next_level: amount_to_next,
      levels: sortedLevels,
      period_days: LEVEL_PERIOD_DAYS,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
