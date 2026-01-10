import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { ordersQueue, clientsQueue, bonusesQueue, addOrderToSyncQueue, addClientToSyncQueue, addBonusToSyncQueue } from "../queues/sync.js";
import gulyashClient from "../services/gulyash.js";

const router = express.Router();

// Применяем аутентификацию и проверку роли ко всем роутам
router.use(authenticateToken);
router.use(requireRole("admin", "ceo"));

// Получить статус очереди синхронизации
router.get("/queue/status", async (req, res, next) => {
  try {
    const { entity_type, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT sq.*, 
             CASE 
               WHEN sq.entity_type = 'order' THEN o.order_number
               WHEN sq.entity_type = 'client' THEN u.phone
               ELSE NULL
             END as entity_identifier
      FROM sync_queue sq
      LEFT JOIN orders o ON sq.entity_type = 'order' AND sq.entity_id = o.id
      LEFT JOIN users u ON sq.entity_type = 'client' AND sq.entity_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (entity_type) {
      query += " AND sq.entity_type = ?";
      params.push(entity_type);
    }

    if (status) {
      query += " AND sq.status = ?";
      params.push(status);
    }

    query += " ORDER BY sq.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [items] = await db.query(query, params);

    // Получаем статистику
    const [stats] = await db.query(`
      SELECT 
        status,
        entity_type,
        COUNT(*) as count
      FROM sync_queue
      GROUP BY status, entity_type
    `);

    res.json({
      items,
      stats,
    });
  } catch (error) {
    next(error);
  }
});

// Получить ошибки синхронизации
router.get("/errors", async (req, res, next) => {
  try {
    const { entity_type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT sq.*, 
             CASE 
               WHEN sq.entity_type = 'order' THEN o.order_number
               WHEN sq.entity_type = 'client' THEN u.phone
               ELSE NULL
             END as entity_identifier
      FROM sync_queue sq
      LEFT JOIN orders o ON sq.entity_type = 'order' AND sq.entity_id = o.id
      LEFT JOIN users u ON sq.entity_type = 'client' AND sq.entity_id = u.id
      WHERE sq.status = 'failed'
    `;
    const params = [];

    if (entity_type) {
      query += " AND sq.entity_type = ?";
      params.push(entity_type);
    }

    query += " ORDER BY sq.updated_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [errors] = await db.query(query, params);

    res.json({ errors });
  } catch (error) {
    next(error);
  }
});

// Повторно отправить неудачные задачи
router.post("/retry-failed", async (req, res, next) => {
  try {
    const { entity_type, entity_ids } = req.body;

    let query = "SELECT * FROM sync_queue WHERE status = 'failed'";
    const params = [];

    if (entity_type) {
      query += " AND entity_type = ?";
      params.push(entity_type);
    }

    if (entity_ids && Array.isArray(entity_ids)) {
      query += " AND id IN (?)";
      params.push(entity_ids);
    }

    const [failedItems] = await db.query(query, params);

    let retriedCount = 0;

    for (const item of failedItems) {
      // Сбрасываем счетчик попыток и статус
      await db.query(
        `UPDATE sync_queue 
         SET status = 'pending', attempts = 0, last_error = NULL, next_retry_at = NULL
         WHERE id = ?`,
        [item.id]
      );

      // Добавляем обратно в очередь
      switch (item.entity_type) {
        case "order":
          await addOrderToSyncQueue(item.entity_id);
          break;
        case "client":
          await addClientToSyncQueue(item.entity_id, item.action);
          break;
        case "bonus":
          await addBonusToSyncQueue(item.entity_id);
          break;
      }

      retriedCount++;
    }

    res.json({
      message: `${retriedCount} items added back to sync queue`,
      retried: retriedCount,
    });
  } catch (error) {
    next(error);
  }
});

// Ручной запуск синхронизации конкретной сущности
router.post("/sync-now", async (req, res, next) => {
  try {
    const { entity_type, entity_id } = req.body;

    if (!entity_type || !entity_id) {
      return res.status(400).json({
        error: "entity_type and entity_id are required",
      });
    }

    let result;
    switch (entity_type) {
      case "order":
        result = await addOrderToSyncQueue(entity_id);
        break;
      case "client":
        result = await addClientToSyncQueue(entity_id, "update");
        break;
      case "bonus":
        result = await addBonusToSyncQueue(entity_id);
        break;
      default:
        return res.status(400).json({
          error: "Invalid entity_type. Must be: order, client, or bonus",
        });
    }

    res.json({
      message: "Sync task added to queue",
      entity_type,
      entity_id,
    });
  } catch (error) {
    next(error);
  }
});

// Получить статистику очередей BullMQ
router.get("/queue/bull-stats", async (req, res, next) => {
  try {
    const [ordersWaiting, ordersActive, ordersFailed, ordersCompleted] = await Promise.all([
      ordersQueue.getWaitingCount(),
      ordersQueue.getActiveCount(),
      ordersQueue.getFailedCount(),
      ordersQueue.getCompletedCount(),
    ]);

    const [clientsWaiting, clientsActive, clientsFailed, clientsCompleted] = await Promise.all([
      clientsQueue.getWaitingCount(),
      clientsQueue.getActiveCount(),
      clientsQueue.getFailedCount(),
      clientsQueue.getCompletedCount(),
    ]);

    const [bonusesWaiting, bonusesActive, bonusesFailed, bonusesCompleted] = await Promise.all([
      bonusesQueue.getWaitingCount(),
      bonusesQueue.getActiveCount(),
      bonusesQueue.getFailedCount(),
      bonusesQueue.getCompletedCount(),
    ]);

    res.json({
      orders: {
        waiting: ordersWaiting,
        active: ordersActive,
        failed: ordersFailed,
        completed: ordersCompleted,
      },
      clients: {
        waiting: clientsWaiting,
        active: clientsActive,
        failed: clientsFailed,
        completed: clientsCompleted,
      },
      bonuses: {
        waiting: bonusesWaiting,
        active: bonusesActive,
        failed: bonusesFailed,
        completed: bonusesCompleted,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Проверить доступность API Гуляша
router.get("/gulyash/health", async (req, res, next) => {
  try {
    const health = await gulyashClient.healthCheck();

    res.json({
      available: health.available,
      error: health.error || null,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Очистить завершенные задачи из очередей
router.post("/queue/clean", async (req, res, next) => {
  try {
    const { grace_period = 3600 } = req.body; // По умолчанию 1 час

    await Promise.all([
      ordersQueue.clean(grace_period * 1000, 100, "completed"),
      clientsQueue.clean(grace_period * 1000, 100, "completed"),
      bonusesQueue.clean(grace_period * 1000, 100, "completed"),
    ]);

    res.json({
      message: "Completed jobs cleaned from queues",
      grace_period_seconds: grace_period,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
