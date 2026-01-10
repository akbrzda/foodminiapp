import express from "express";
import db from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { getBonusHistory, calculateMaxUsableBonuses } from "../utils/bonuses.js";

const router = express.Router();

// Получить баланс бонусов
router.get("/balance", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      balance: parseFloat(users[0].bonus_balance),
    });
  } catch (error) {
    next(error);
  }
});

// Получить историю операций с бонусами
router.get("/history", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const history = await getBonusHistory(userId, parseInt(limit), parseInt(offset));

    res.json({ history });
  } catch (error) {
    next(error);
  }
});

// Рассчитать доступные к использованию бонусы для заказа
router.post("/calculate-usable", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { order_subtotal } = req.body;

    if (!order_subtotal || order_subtotal <= 0) {
      return res.status(400).json({
        error: "order_subtotal is required and must be greater than 0",
      });
    }

    // Получаем баланс пользователя
    const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userBalance = parseFloat(users[0].bonus_balance);
    const maxUsable = calculateMaxUsableBonuses(order_subtotal);

    // Доступно минимум из баланса и максимально допустимого
    const available = Math.min(userBalance, maxUsable);

    res.json({
      user_balance: userBalance,
      max_usable_for_order: maxUsable,
      available_to_use: available,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
