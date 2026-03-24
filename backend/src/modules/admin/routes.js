import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import {
  cleanQueue,
  getFailedJobs,
  getQueueStats,
  imageQueue,
  retryFailedJobs,
  telegramQueue,
} from "../../queues/config.js";
import accessRouter from "./access/access.routes.js";
import clientsRouter from "./clients.routes.js";
import usersRouter from "./users.routes.js";

const router = express.Router();

router.use(authenticateToken);
// Совместимость маршрутов:
// - актуальный префикс: /api/admin/access/*
// - legacy префикс: /api/admin/*
router.use("/access", accessRouter);
router.use(accessRouter);
router.use(clientsRouter);
router.use(usersRouter);

router.get("/queues", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [telegramStats, imageStats] = await Promise.all([
      getQueueStats(telegramQueue),
      getQueueStats(imageQueue),
    ]);

    res.json({
      queues: {
        telegram: {
          name: "Telegram Notifications",
          ...telegramStats,
        },
        images: {
          name: "Image Processing",
          ...imageStats,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/queues/:queueType/failed", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    let queue;
    if (queueType === "telegram") {
      queue = telegramQueue;
    } else if (queueType === "images") {
      queue = imageQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue type. Must be 'telegram' or 'images'" });
    }

    const failedJobs = await getFailedJobs(queue, parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));

    res.json({
      queueType,
      failed: failedJobs,
      total: failedJobs.length,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/queues/:queueType/retry", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;

    let queue;
    if (queueType === "telegram") {
      queue = telegramQueue;
    } else if (queueType === "images") {
      queue = imageQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue type. Must be 'telegram' or 'images'" });
    }

    const retriedCount = await retryFailedJobs(queue);

    res.json({
      queueType,
      retriedCount,
      message: `Successfully retried ${retriedCount} failed jobs`,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/queues/:queueType/clean", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;
    const { grace = 86400000 } = req.body;

    let queue;
    if (queueType === "telegram") {
      queue = telegramQueue;
    } else if (queueType === "images") {
      queue = imageQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue type. Must be 'telegram' or 'images'" });
    }

    const cleaned = await cleanQueue(queue, parseInt(grace, 10));

    res.json({
      queueType,
      cleanedCount: cleaned.length,
      message: `Successfully cleaned ${cleaned.length} completed jobs`,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/logs", requireRole("admin", "ceo"), async (req, res, next) => {
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

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

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
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );

    const [countResult] = await db.query(`SELECT COUNT(*) as total FROM admin_action_logs al ${whereClause}`, params);

    res.json({
      logs,
      total: countResult[0].total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
