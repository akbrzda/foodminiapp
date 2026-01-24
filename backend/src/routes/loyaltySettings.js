import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";
import { getLoyaltySettings, getLoyaltySettingsList, updateLoyaltySettings } from "../utils/loyaltySettings.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const settings = await getLoyaltySettings();
    const [levels] = await db.query(
      "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order FROM loyalty_levels WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY sort_order ASC, level_number ASC",
    );
    res.json({ settings, levels });
  } catch (error) {
    next(error);
  }
});

router.get("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const settings = await getLoyaltySettings();
    const [levels] = await db.query(
      "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order FROM loyalty_levels WHERE deleted_at IS NULL ORDER BY sort_order ASC, level_number ASC",
    );
    res.json({
      settings,
      items: getLoyaltySettingsList(settings),
      levels,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { settings: patch } = req.body || {};
    const { updated, errors } = await updateLoyaltySettings(patch);

    if (errors) {
      return res.status(400).json({ errors });
    }

    await logger.admin.action(req.user?.id, "update_loyalty_settings", "loyalty_settings", null, JSON.stringify(updated), req);

    const settings = await getLoyaltySettings();
    const [levels] = await db.query(
      "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order FROM loyalty_levels WHERE deleted_at IS NULL ORDER BY sort_order ASC, level_number ASC",
    );
    res.json({ settings, items: getLoyaltySettingsList(settings), levels });
  } catch (error) {
    next(error);
  }
});

// Эндпоинты для управления исключениями бонусов

// Получение списка исключений
router.get("/exclusions", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const [exclusions] = await db.query(`
      SELECT 
        e.id,
        e.type,
        e.entity_id,
        e.reason,
        e.created_at,
        e.created_by,
        CASE 
          WHEN e.type = 'category' THEN c.name
          WHEN e.type = 'product' THEN m.name
          ELSE NULL
        END as entity_name,
        au.email as created_by_email
      FROM loyalty_exclusions e
      LEFT JOIN menu_categories c ON e.type = 'category' AND e.entity_id = c.id
      LEFT JOIN menu_items m ON e.type = 'product' AND e.entity_id = m.id
      LEFT JOIN admin_users au ON e.created_by = au.id
      ORDER BY e.created_at DESC
    `);

    res.json({ exclusions });
  } catch (error) {
    next(error);
  }
});

// Создание нового исключения
router.post("/exclusions", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { type, entity_id, reason } = req.body;

    // Валидация типа
    if (!["category", "product"].includes(type)) {
      return res.status(400).json({ error: "Неверный тип исключения. Допустимые значения: category, product" });
    }

    // Валидация entity_id
    if (!entity_id || !Number.isInteger(entity_id)) {
      return res.status(400).json({ error: "Некорректный ID сущности" });
    }

    // Проверка существования сущности
    if (type === "category") {
      const [categories] = await db.query("SELECT id FROM menu_categories WHERE id = ?", [entity_id]);
      if (categories.length === 0) {
        return res.status(404).json({ error: "Категория не найдена" });
      }
    } else if (type === "product") {
      const [products] = await db.query("SELECT id FROM menu_items WHERE id = ?", [entity_id]);
      if (products.length === 0) {
        return res.status(404).json({ error: "Товар не найден" });
      }
    }

    // Проверка на дубликат
    const [existing] = await db.query("SELECT id FROM loyalty_exclusions WHERE type = ? AND entity_id = ?", [type, entity_id]);

    if (existing.length > 0) {
      return res.status(409).json({ error: "Это исключение уже существует" });
    }

    // Создание исключения
    const [result] = await db.query("INSERT INTO loyalty_exclusions (type, entity_id, reason, created_by) VALUES (?, ?, ?, ?)", [
      type,
      entity_id,
      reason || null,
      req.user.id,
    ]);

    // Получаем созданное исключение с дополнительной информацией
    const [exclusion] = await db.query(
      `
      SELECT 
        e.id,
        e.type,
        e.entity_id,
        e.reason,
        e.created_at,
        e.created_by,
        CASE 
          WHEN e.type = 'category' THEN c.name
          WHEN e.type = 'product' THEN m.name
          ELSE NULL
        END as entity_name,
        au.email as created_by_email
      FROM loyalty_exclusions e
      LEFT JOIN menu_categories c ON e.type = 'category' AND e.entity_id = c.id
      LEFT JOIN menu_items m ON e.type = 'product' AND e.entity_id = m.id
      LEFT JOIN admin_users au ON e.created_by = au.id
      WHERE e.id = ?
    `,
      [result.insertId],
    );

    await logger.admin.action(
      req.user.id,
      "create_loyalty_exclusion",
      "loyalty_exclusions",
      result.insertId,
      JSON.stringify({ type, entity_id, reason }),
      req,
    );

    res.status(201).json({ success: true, exclusion: exclusion[0] });
  } catch (error) {
    next(error);
  }
});

// Удаление исключения
router.delete("/exclusions/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка существования
    const [existing] = await db.query("SELECT * FROM loyalty_exclusions WHERE id = ?", [id]);

    if (existing.length === 0) {
      return res.status(404).json({ error: "Исключение не найдено" });
    }

    // Удаление
    await db.query("DELETE FROM loyalty_exclusions WHERE id = ?", [id]);

    await logger.admin.action(req.user.id, "delete_loyalty_exclusion", "loyalty_exclusions", id, JSON.stringify(existing[0]), req);

    res.json({ success: true, message: "Исключение удалено" });
  } catch (error) {
    next(error);
  }
});

// Эндпоинты для аудита системы лояльности

// Получение логов лояльности
router.get("/logs", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, event_type, severity } = req.query;

    let query = "SELECT * FROM loyalty_logs WHERE 1=1";
    const params = [];

    if (event_type) {
      query += " AND event_type = ?";
      params.push(event_type);
    }

    if (severity) {
      query += " AND severity = ?";
      params.push(severity);
    }

    const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [logs] = await db.query(query, params);
    const [counts] = await db.query(countQuery, params.slice(0, params.length - 2));

    res.json({ logs, total: counts[0]?.total || logs.length });
  } catch (error) {
    next(error);
  }
});

// Поиск дублей транзакций
router.get("/audit/duplicates", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [duplicates] = await db.query(`
      SELECT 
        order_id,
        type,
        COUNT(*) as total
      FROM loyalty_transactions
      WHERE status = 'completed'
        AND type = 'earn'
        AND order_id IS NOT NULL
      GROUP BY order_id, type
      HAVING COUNT(*) > 1
      ORDER BY total DESC
      LIMIT 100
    `);

    res.json({ duplicates });
  } catch (error) {
    next(error);
  }
});

// Расхождения балансов
router.get("/audit/mismatches", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [mismatches] = await db.query(`
      SELECT 
        u.id as user_id,
        u.bonus_balance as user_balance,
        COALESCE(
          (SELECT SUM(
            CASE 
              WHEN type IN ('earn', 'register_bonus', 'birthday_bonus', 'refund_spend') THEN amount
              WHEN type IN ('spend', 'expire', 'refund_earn') THEN -amount
              WHEN type = 'adjustment' THEN amount
              ELSE 0
            END
          )
          FROM loyalty_transactions
          WHERE user_id = u.id AND status = 'completed'),
          0
        ) as calculated_balance
      FROM users u
      WHERE u.bonus_balance != COALESCE(
        (SELECT SUM(
          CASE 
            WHEN type IN ('earn', 'register_bonus', 'birthday_bonus', 'refund_spend') THEN amount
            WHEN type IN ('spend', 'expire', 'refund_earn') THEN -amount
            WHEN type = 'adjustment' THEN amount
            ELSE 0
          END
        )
        FROM loyalty_transactions
        WHERE user_id = u.id AND status = 'completed'),
        0
      )
      LIMIT 100
    `);

    res.json({ mismatches });
  } catch (error) {
    next(error);
  }
});

// Статистика пользователя
router.get("/users/:userId/stats", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Информация о пользователе
    const [users] = await db.query(
      `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.phone,
        u.bonus_balance,
        u.loyalty_level,
        u.current_loyalty_level_id,
        ll.name as level_name
      FROM users u
      LEFT JOIN loyalty_levels ll ON u.current_loyalty_level_id = ll.id
      WHERE u.id = ?
    `,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    // Статистика из user_loyalty_stats
    const [stats] = await db.query(
      `
      SELECT * FROM user_loyalty_stats WHERE user_id = ?
    `,
      [userId],
    );

    // Транзакции
    const [transactions] = await db.query(
      `
      SELECT 
        lt.*,
        o.order_number
      FROM loyalty_transactions lt
      LEFT JOIN orders o ON lt.order_id = o.id
      WHERE lt.user_id = ?
      ORDER BY lt.created_at DESC
      LIMIT 50
    `,
      [userId],
    );

    // История уровней
    const [levelHistory] = await db.query(
      `
      SELECT 
        ull.*,
        ll.name as level_name
      FROM user_loyalty_levels ull
      LEFT JOIN loyalty_levels ll ON ull.level_id = ll.id
      WHERE ull.user_id = ?
      ORDER BY ull.started_at DESC
    `,
      [userId],
    );

    res.json({
      user: users[0],
      stats: stats[0] || null,
      transactions,
      level_history: levelHistory,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
