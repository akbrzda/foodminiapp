import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Получить логи действий администраторов
 * GET /api/logs/admin
 * Доступ: только admin и ceo
 * Query params:
 *   - admin_user_id: фильтр по конкретному администратору
 *   - action: фильтр по действию
 *   - entity_type: фильтр по типу сущности
 *   - date_from, date_to: фильтр по дате
 *   - limit, offset: пагинация
 */
router.get("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { admin_user_id, action, entity_type, date_from, date_to, limit = 100, offset = 0 } = req.query;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (admin_user_id) {
      whereClause += " AND admin_user_id = ?";
      params.push(admin_user_id);
    }

    if (action) {
      whereClause += " AND action = ?";
      params.push(action);
    }

    if (entity_type) {
      whereClause += " AND entity_type = ?";
      params.push(entity_type);
    }

    if (date_from) {
      whereClause += " AND created_at >= ?";
      params.push(date_from);
    }

    if (date_to) {
      whereClause += " AND created_at <= ?";
      params.push(date_to);
    }

    // Получаем логи с информацией об администраторе
    const [logs] = await db.query(
      `SELECT 
         al.*,
         au.username as admin_username,
         au.role as admin_role
       FROM admin_action_logs al
       LEFT JOIN admin_users au ON al.admin_user_id = au.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Получаем общее количество
    const [countResult] = await db.query(`SELECT COUNT(*) as total FROM admin_action_logs ${whereClause}`, params);

    res.json({
      logs,
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Получить системные логи из файла
 * GET /api/logs/system
 * Доступ: только admin и ceo
 * Query params:
 *   - level: фильтр по уровню (info, warn, error)
 *   - category: фильтр по категории
 *   - search: поиск по сообщению
 *   - limit: количество последних строк
 */
router.get("/system", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { level, category, search, limit = 100 } = req.query;

    // Путь к файлу логов
    const logFilePath = path.join(__dirname, "../../logs/combined.log");

    // Проверяем существование файла
    if (!fs.existsSync(logFilePath)) {
      return res.json({ logs: [], total: 0 });
    }

    // Читаем файл
    const fileContent = fs.readFileSync(logFilePath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    // Парсим JSON логи
    let logs = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((log) => log !== null);

    // Применяем фильтры
    if (level) {
      logs = logs.filter((log) => log.level === level);
    }

    if (category) {
      logs = logs.filter((log) => log.category === category);
    }

    if (search) {
      logs = logs.filter((log) => log.message && log.message.toLowerCase().includes(search.toLowerCase()));
    }

    // Сортируем по дате (новые первые)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Ограничиваем количество
    const limitedLogs = logs.slice(0, parseInt(limit));

    res.json({
      logs: limitedLogs,
      total: logs.length,
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Получить статистику действий администраторов
 * GET /api/logs/stats
 * Доступ: только admin и ceo
 */
router.get("/stats", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;

    let dateFilter = "";
    const params = [];

    if (date_from) {
      dateFilter += " AND created_at >= ?";
      params.push(date_from);
    }

    if (date_to) {
      dateFilter += " AND created_at <= ?";
      params.push(date_to);
    }

    // Статистика действий администраторов
    const [adminActionStats] = await db.query(
      `SELECT action, COUNT(*) as count
       FROM admin_action_logs
       WHERE 1=1 ${dateFilter}
       GROUP BY action
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    // Самые активные администраторы
    const [adminUserStats] = await db.query(
      `SELECT 
         au.id,
         au.username,
         au.role,
         COUNT(al.id) as action_count
       FROM admin_action_logs al
       LEFT JOIN admin_users au ON al.admin_user_id = au.id
       WHERE 1=1 ${dateFilter}
       GROUP BY au.id, au.username, au.role
       ORDER BY action_count DESC
       LIMIT 10`,
      params
    );

    // Статистика по типам сущностей
    const [entityTypeStats] = await db.query(
      `SELECT entity_type, COUNT(*) as count
       FROM admin_action_logs
       WHERE entity_type IS NOT NULL ${dateFilter}
       GROUP BY entity_type
       ORDER BY count DESC`,
      params
    );

    res.json({
      admin_actions: {
        by_action: adminActionStats,
        by_user: adminUserStats,
        by_entity_type: entityTypeStats,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Очистить старые логи действий администраторов
 * DELETE /api/logs/cleanup
 * Доступ: только admin и ceo
 * Body: { days: 90 } - удалить логи старше N дней
 */
router.delete("/cleanup", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { days = 90 } = req.body;

    if (days < 30) {
      return res.status(400).json({
        error: "Cannot delete logs newer than 30 days",
      });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Удаляем старые логи администраторов
    const [adminResult] = await db.query("DELETE FROM admin_action_logs WHERE created_at < ?", [cutoffDate]);

    res.json({
      deleted: {
        admin_action_logs: adminResult.affectedRows,
      },
      cutoff_date: cutoffDate,
      note: "System logs are stored in files and managed by rotation policy (5MB x 5 files)",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
