import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { getSystemSettings, updateSystemSettings } from "../utils/settings.js";
import { getLoyaltyLevelsFromDb, getTotalSpentForPeriod, applyManualBonusAdjustment } from "../utils/bonuses.js";
import { logger } from "../utils/logger.js";

const router = express.Router();
const LEVEL_PERIOD_DAYS = 60;

router.get("/status", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({ bonuses_enabled: Boolean(settings.bonuses_enabled) });
  } catch (error) {
    next(error);
  }
});

router.put("/toggle", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled должен быть булевым" });
    }
    const { updated, errors } = await updateSystemSettings({ bonuses_enabled: enabled });
    if (errors) {
      return res.status(400).json({ errors });
    }
    await logger.admin.action(req.user?.id, "toggle_loyalty", "settings", null, JSON.stringify(updated), req);
    res.json({ bonuses_enabled: enabled });
  } catch (error) {
    next(error);
  }
});

router.post("/adjust", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { user_id, amount, reason, type } = req.body || {};
    const parsedUserId = Number(user_id);
    if (!Number.isInteger(parsedUserId)) {
      await connection.rollback();
      return res.status(400).json({ error: "user_id обязателен" });
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      await connection.rollback();
      return res.status(400).json({ error: "Причина корректировки обязательна" });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Сумма должна быть положительным числом" });
    }
    if (!type || !["earn", "spend"].includes(type)) {
      await connection.rollback();
      return res.status(400).json({ error: "type должен быть earn или spend" });
    }

    const settings = await getSystemSettings();
    if (!settings.bonuses_enabled) {
      await connection.rollback();
      return res.status(403).json({ error: "Бонусная система отключена" });
    }

    const delta = type === "spend" ? -Math.abs(numericAmount) : Math.abs(numericAmount);
    const result = await applyManualBonusAdjustment({
      userId: parsedUserId,
      delta,
      description: reason.trim(),
      connection,
      adminId: req.user.id,
    });

    await connection.commit();

    await logger.admin.action(req.user?.id, "loyalty_adjust", "users", parsedUserId, JSON.stringify({ delta, reason, type }), req);

    res.json({ balance: result.balance });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.get("/users/:id/loyalty", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "Некорректный ID" });
    }
    if (req.user.role === "manager") {
      const [orders] = await db.query("SELECT id FROM orders WHERE user_id = ? AND city_id IN (?) LIMIT 1", [userId, req.user.cities]);
      if (orders.length === 0) {
        return res.status(403).json({ error: "Нет доступа к пользователю" });
      }
    }

    const [users] = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.phone, u.loyalty_balance, u.loyalty_joined_at, u.current_loyalty_level_id
       FROM users u
       WHERE u.id = ?`,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const levels = await getLoyaltyLevelsFromDb();
    const sortedLevels = Object.values(levels).sort((a, b) => a.threshold - b.threshold);
    const totalSpent = await getTotalSpentForPeriod(userId, LEVEL_PERIOD_DAYS, db);

    let currentLevel = sortedLevels[0] || null;
    for (const level of sortedLevels) {
      if (totalSpent >= level.threshold) {
        currentLevel = level;
      }
    }
    const currentIndex = currentLevel ? sortedLevels.findIndex((level) => level.id === currentLevel.id) : -1;
    const nextLevel = currentIndex >= 0 ? sortedLevels[currentIndex + 1] : null;
    const span = nextLevel ? Math.max(1, nextLevel.threshold - currentLevel.threshold) : 1;
    const progress = nextLevel ? Math.min(1, Math.max(0, (totalSpent - currentLevel.threshold) / span)) : 1;
    const amountToNext = nextLevel ? Math.max(0, nextLevel.threshold - totalSpent) : 0;

    const [transactions] = await db.query(
      `SELECT lt.id, lt.order_id, o.order_number, lt.type, lt.amount, lt.status, lt.expires_at, lt.created_at
       FROM loyalty_transactions lt
       LEFT JOIN orders o ON lt.order_id = o.id
       WHERE lt.user_id = ?
       ORDER BY lt.created_at DESC
       LIMIT 50`,
      [userId],
    );

    const [summaryRows] = await db.query(
      `SELECT
        SUM(CASE WHEN type IN ('earn','registration','birthday') AND status = 'completed' THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN type = 'spend' AND status = 'completed' THEN amount ELSE 0 END) as total_spent,
        SUM(CASE WHEN type = 'expire' AND status = 'completed' THEN amount ELSE 0 END) as total_expired
       FROM loyalty_transactions
       WHERE user_id = ?`,
      [userId],
    );

    const [levelHistory] = await db.query(
      `SELECT ull.id, ull.reason, ull.created_at, ll.name as level_name
       FROM user_loyalty_levels ull
       LEFT JOIN loyalty_levels ll ON ull.loyalty_level_id = ll.id
       WHERE ull.user_id = ?
       ORDER BY ull.created_at DESC`,
      [userId],
    );

    res.json({
      user: users[0],
      stats: {
        total_spent_60_days: Math.floor(totalSpent),
        total_earned: Math.floor(summaryRows[0]?.total_earned || 0),
        total_spent: Math.floor(summaryRows[0]?.total_spent || 0),
        total_expired: Math.floor(summaryRows[0]?.total_expired || 0),
        progress_to_next_level: progress,
        amount_to_next_level: Math.floor(amountToNext),
        current_level: currentLevel,
        next_level: nextLevel,
      },
      transactions,
      level_history: levelHistory,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
