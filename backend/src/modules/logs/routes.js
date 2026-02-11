import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
router.get("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { admin_id, action_type, object_type, date_from, date_to, page = 1, limit = 50 } = req.query;
    let whereClause = "WHERE 1=1";
    const params = [];
    if (admin_id) {
      whereClause += " AND al.admin_user_id = ?";
      params.push(admin_id);
    }
    if (action_type) {
      whereClause += " AND al.action = ?";
      params.push(action_type);
    }
    if (object_type) {
      whereClause += " AND al.entity_type = ?";
      params.push(object_type);
    }
    if (date_from) {
      whereClause += " AND al.created_at >= ?";
      params.push(date_from);
    }
    if (date_to) {
      whereClause += " AND al.created_at <= ?";
      params.push(`${date_to} 23:59:59`);
    }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [logs] = await db.query(
      `SELECT 
         al.id,
         al.action,
         al.entity_type as object_type,
         al.entity_id as object_id,
         al.description as details,
         al.ip_address,
         al.created_at,
         au.id as admin_id,
         CONCAT(au.first_name, ' ', au.last_name) as admin_name,
         au.email as admin_email
       FROM admin_action_logs al
       LEFT JOIN admin_users au ON al.admin_user_id = au.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)],
    );
    const [countResult] = await db.query(`SELECT COUNT(*) as total FROM admin_action_logs al ${whereClause}`, params);
    res.json({
      logs,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/system", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { level, category, search, limit = 100 } = req.query;
    const logFilePath = path.join(__dirname, "../../logs/combined.log");
    if (!fs.existsSync(logFilePath)) {
      return res.json({ logs: [], total: 0 });
    }
    const fileContent = fs.readFileSync(logFilePath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());
    let logs = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((log) => log !== null);
    if (level) {
      logs = logs.filter((log) => log.level === level);
    }
    if (category) {
      logs = logs.filter((log) => log.category === category);
    }
    if (search) {
      logs = logs.filter((log) => log.message && log.message.toLowerCase().includes(search.toLowerCase()));
    }
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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
    const [adminActionStats] = await db.query(
      `SELECT action, COUNT(*) as count
       FROM admin_action_logs
       WHERE 1=1 ${dateFilter}
       GROUP BY action
       ORDER BY count DESC
       LIMIT 10`,
      params,
    );
    const [adminUserStats] = await db.query(
      `SELECT 
         au.id,
         CONCAT(au.first_name, ' ', au.last_name) as admin_name,
         au.role,
         COUNT(al.id) as action_count
       FROM admin_action_logs al
       LEFT JOIN admin_users au ON al.admin_user_id = au.id
       WHERE 1=1 ${dateFilter}
       GROUP BY au.id, au.first_name, au.last_name, au.role
       ORDER BY action_count DESC
       LIMIT 10`,
      params,
    );
    const [entityTypeStats] = await db.query(
      `SELECT entity_type, COUNT(*) as count
       FROM admin_action_logs
       WHERE entity_type IS NOT NULL ${dateFilter}
       GROUP BY entity_type
       ORDER BY count DESC`,
      params,
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
