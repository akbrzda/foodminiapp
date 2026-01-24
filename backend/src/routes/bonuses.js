import express from "express";
import db from "../config/database.js";
import redis from "../config/redis.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  getBonusHistory,
  calculateMaxUsableBonuses,
  getLoyaltyLevelsFromDb,
  getMaxUsePercentFromSettings,
  getRedeemPercentForLevel,
} from "../utils/bonuses.js";
import { getSystemSettings } from "../utils/settings.js";
import { getLoyaltySettings } from "../utils/loyaltySettings.js";
const router = express.Router();
const ensureBonusesEnabled = async (res) => {
  const settings = await getSystemSettings();
  if (!settings.bonuses_enabled) {
    res.status(403).json({ error: "Бонусная система отключена" });
    return false;
  }
  return true;
};
router.get("/balance", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const cacheKey = `bonuses:user_${userId}`;
    try {
      const cachedBalance = await redis.get(cacheKey);
      if (cachedBalance !== null) {
        return res.json({ balance: parseFloat(cachedBalance) || 0 });
      }
    } catch (cacheError) {
      console.error("Не удалось прочитать кеш бонусов:", cacheError);
    }
    const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const balance = parseFloat(users[0].bonus_balance) || 0;
    try {
      await redis.set(cacheKey, balance, "EX", 60);
    } catch (cacheError) {
      console.error("Не удалось записать кеш бонусов:", cacheError);
    }
    res.json({ balance });
  } catch (error) {
    next(error);
  }
});
router.get("/history", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    const history = await getBonusHistory(userId, parseInt(limit), parseInt(offset));
    res.json({ history });
  } catch (error) {
    next(error);
  }
});
router.post("/calculate-usable", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const { order_items } = req.body;

    if (!order_items || !Array.isArray(order_items) || order_items.length === 0) {
      return res.status(400).json({
        error: "order_items is required and must be a non-empty array",
      });
    }

    const [users] = await db.query("SELECT bonus_balance, loyalty_level FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userBalance = parseFloat(users[0].bonus_balance);
    const loyaltyLevel = users[0]?.loyalty_level || 1;

    // Получаем исключения
    const [exclusions] = await db.query(`
      SELECT type, entity_id FROM loyalty_exclusions
    `);

    const excludedCategories = exclusions.filter((e) => e.type === "category").map((e) => e.entity_id);

    const excludedProducts = exclusions.filter((e) => e.type === "product").map((e) => e.entity_id);

    // Рассчитываем суммы
    let orderSubtotal = 0;
    let excludedAmount = 0;
    const excludedItems = [];

    for (const item of order_items) {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      orderSubtotal += itemTotal;

      // Проверяем исключения
      if (excludedProducts.includes(item.product_id)) {
        excludedAmount += itemTotal;
        excludedItems.push({
          product_id: item.product_id,
          reason: "product_excluded",
        });
      } else if (excludedCategories.includes(item.category_id)) {
        excludedAmount += itemTotal;
        excludedItems.push({
          product_id: item.product_id,
          reason: "category_excluded",
        });
      }
    }

    // Сумма, доступная для списания бонусов
    const eligibleAmount = orderSubtotal - excludedAmount;

    // Если все позиции исключены
    if (eligibleAmount <= 0) {
      return res.json({
        user_balance: userBalance,
        order_subtotal: orderSubtotal,
        excluded_amount: excludedAmount,
        eligible_amount: 0,
        max_usable_for_order: 0,
        available_to_use: 0,
        excluded_items: excludedItems,
        message: "Бонусы недоступны для списания на данные позиции",
      });
    }

    const loyaltySettings = await getLoyaltySettings();
    const loyaltyLevels = await getLoyaltyLevelsFromDb();
    const maxUsePercent = getRedeemPercentForLevel(loyaltyLevel, loyaltyLevels, getMaxUsePercentFromSettings(loyaltySettings));

    const maxUsable = calculateMaxUsableBonuses(eligibleAmount, maxUsePercent);
    const available = Math.min(userBalance, maxUsable);

    res.json({
      user_balance: userBalance,
      order_subtotal: orderSubtotal,
      excluded_amount: excludedAmount,
      eligible_amount: eligibleAmount,
      max_usable_for_order: maxUsable,
      available_to_use: available,
      excluded_items: excludedItems,
    });
  } catch (error) {
    next(error);
  }
});

// Получение истекающих бонусов
router.get("/expiring", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const { days = 14 } = req.query;

    const [expiringBonuses] = await db.query(
      `SELECT 
        id,
        amount,
        expires_at,
        DATEDIFF(expires_at, NOW()) as days_left
      FROM loyalty_transactions
      WHERE user_id = ? 
        AND type = 'earn'
        AND status = 'completed'
        AND expires_at IS NOT NULL
        AND expires_at > NOW()
        AND DATEDIFF(expires_at, NOW()) <= ?
      ORDER BY expires_at ASC`,
      [userId, parseInt(days)],
    );

    const total = expiringBonuses.reduce((sum, bonus) => sum + parseFloat(bonus.amount), 0);

    res.json({
      expiring_bonuses: expiringBonuses,
      total_expiring: Math.round(total),
      count: expiringBonuses.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
