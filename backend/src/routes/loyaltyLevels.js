import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Получение всех уровней лояльности
router.get("/levels", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const [levels] = await db.query(`
      SELECT 
        ll.*,
        COUNT(DISTINCT u.id) as user_count
      FROM loyalty_levels ll
      LEFT JOIN users u ON u.current_loyalty_level_id = ll.id
      GROUP BY ll.id
      ORDER BY ll.sort_order ASC, ll.threshold_amount ASC
    `);

    res.json({ levels });
  } catch (error) {
    next(error);
  }
});

// Создание нового уровня
router.post("/levels", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { name, threshold_amount, earn_percent, max_spend_percent, is_active } = req.body;

    // Валидация
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Название уровня обязательно" });
    }

    if (threshold_amount === undefined || threshold_amount < 0) {
      return res.status(400).json({ error: "Порог должен быть неотрицательным числом" });
    }

    if (!earn_percent || earn_percent <= 0) {
      return res.status(400).json({ error: "Процент начисления должен быть больше 0" });
    }

    if (!max_spend_percent || max_spend_percent <= 0) {
      return res.status(400).json({ error: "Максимальный процент списания должен быть больше 0" });
    }

    // Проверка уникальности порога
    const [existing] = await db.query("SELECT id FROM loyalty_levels WHERE threshold_amount = ?", [threshold_amount]);

    if (existing.length > 0) {
      return res.status(409).json({ error: "Уровень с таким порогом уже существует" });
    }

    // Определяем level_number - следующий по порядку
    const [maxLevel] = await db.query("SELECT MAX(level_number) as max_num FROM loyalty_levels");
    const levelNumber = (maxLevel[0]?.max_num || 0) + 1;

    // Определяем sort_order по порогу
    const [allLevels] = await db.query("SELECT threshold_amount FROM loyalty_levels ORDER BY threshold_amount");
    let sortOrder = 1;
    for (const level of allLevels) {
      if (threshold_amount > level.threshold_amount) {
        sortOrder++;
      }
    }

    // Создание уровня
    const [result] = await db.query(
      `INSERT INTO loyalty_levels 
       (name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, levelNumber, threshold_amount, earn_percent, max_spend_percent, is_active !== false, sortOrder],
    );

    await logger.admin.action(
      req.user.id,
      "create_loyalty_level",
      "loyalty_levels",
      result.insertId,
      JSON.stringify({ name, threshold_amount, earn_percent, max_spend_percent }),
      req,
    );

    // Получаем созданный уровень
    const [created] = await db.query("SELECT * FROM loyalty_levels WHERE id = ?", [result.insertId]);

    res.status(201).json({ success: true, level: created[0] });
  } catch (error) {
    next(error);
  }
});

// Обновление уровня
router.put("/levels/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order } = req.body;

    // Проверка существования
    const [existing] = await db.query("SELECT * FROM loyalty_levels WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Уровень не найден" });
    }

    // Валидация
    if (name !== undefined && name.trim() === "") {
      return res.status(400).json({ error: "Название уровня не может быть пустым" });
    }

    // Проверка уникальности порога (если изменяется)
    if (threshold_amount !== undefined && threshold_amount !== existing[0].threshold_amount) {
      const [duplicate] = await db.query("SELECT id FROM loyalty_levels WHERE threshold_amount = ? AND id != ?", [threshold_amount, id]);
      if (duplicate.length > 0) {
        return res.status(409).json({ error: "Уровень с таким порогом уже существует" });
      }

      // Нельзя изменить порог первого уровня с 0
      if (existing[0].threshold_amount === 0 && threshold_amount !== 0) {
        return res.status(400).json({ error: "Нельзя изменить порог стартового уровня" });
      }
    }

    // Формируем запрос обновления
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (threshold_amount !== undefined) {
      updates.push("threshold_amount = ?");
      values.push(threshold_amount);
    }
    if (earn_percent !== undefined) {
      updates.push("earn_percent = ?");
      values.push(earn_percent);
    }
    if (max_spend_percent !== undefined) {
      updates.push("max_spend_percent = ?");
      values.push(max_spend_percent);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      values.push(sort_order);
    }

    if (updates.length > 0) {
      values.push(id);
      await db.query(`UPDATE loyalty_levels SET ${updates.join(", ")} WHERE id = ?`, values);
    }

    await logger.admin.action(req.user.id, "update_loyalty_level", "loyalty_levels", id, JSON.stringify(req.body), req);

    // Получаем обновленный уровень
    const [updated] = await db.query("SELECT * FROM loyalty_levels WHERE id = ?", [id]);

    res.json({ success: true, level: updated[0] });
  } catch (error) {
    next(error);
  }
});

// Удаление уровня
router.delete("/levels/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка существования
    const [existing] = await db.query("SELECT * FROM loyalty_levels WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Уровень не найден" });
    }

    // Проверка наличия пользователей на уровне
    const [users] = await db.query("SELECT COUNT(*) as count FROM users WHERE current_loyalty_level_id = ?", [id]);

    if (users[0].count > 0) {
      return res.status(409).json({
        error: `Невозможно удалить уровень. На нём сейчас ${users[0].count} пользователей`,
      });
    }

    // Проверка наличия записей в истории
    const [history] = await db.query("SELECT COUNT(*) as count FROM user_loyalty_levels WHERE level_id = ?", [id]);

    if (history[0].count > 0) {
      return res.status(409).json({
        error: "Невозможно удалить уровень. Есть записи в истории пользователей",
      });
    }

    // Удаление
    await db.query("DELETE FROM loyalty_levels WHERE id = ?", [id]);

    await logger.admin.action(req.user.id, "delete_loyalty_level", "loyalty_levels", id, JSON.stringify(existing[0]), req);

    res.json({ success: true, message: "Уровень удален" });
  } catch (error) {
    next(error);
  }
});

export default router;
