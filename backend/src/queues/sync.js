import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import db from "../config/database.js";
import gulyashClient from "../services/gulyash.js";
import { logger } from "../utils/logger.js";

// Подключение к Redis
const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  maxRetriesPerRequest: null,
});

// ==================== Очереди ====================

// Очередь для синхронизации заказов
export const ordersQueue = new Queue("orders-sync", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000, // Начальная задержка 5 секунд
    },
    removeOnComplete: 100, // Хранить последние 100 выполненных
    removeOnFail: 500, // Хранить последние 500 неудачных
  },
});

// Очередь для синхронизации клиентов
export const clientsQueue = new Queue("clients-sync", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Очередь для синхронизации бонусов
export const bonusesQueue = new Queue("bonuses-sync", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// ==================== Обработчики очередей ====================

/**
 * Обработчик очереди заказов
 */
export const ordersWorker = new Worker(
  "orders-sync",
  async (job) => {
    const { orderId, action } = job.data;

    try {
      // Получаем данные заказа из БД
      const [orders] = await db.query(
        `SELECT o.*, u.phone as client_phone, u.first_name, u.last_name, 
                u.gulyash_client_id, b.gulyash_branch_id
         FROM orders o
         JOIN users u ON o.user_id = u.id
         LEFT JOIN branches b ON o.branch_id = b.id
         WHERE o.id = ?`,
        [orderId]
      );

      if (orders.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = orders[0];

      // Получаем позиции заказа
      const [items] = await db.query(
        `SELECT oi.*, mi.gulyash_item_id
         FROM order_items oi
         LEFT JOIN menu_items mi ON oi.item_id = mi.id
         WHERE oi.order_id = ?`,
        [orderId]
      );

      // Для каждой позиции получаем модификаторы
      for (const item of items) {
        const [modifiers] = await db.query(
          `SELECT oim.*, mm.gulyash_modifier_id
           FROM order_item_modifiers oim
           LEFT JOIN menu_modifiers mm ON oim.modifier_id = mm.id
           WHERE oim.order_item_id = ?`,
          [item.id]
        );
        item.modifiers = modifiers;
      }

      // Отправляем в Гуляш
      const result = await gulyashClient.createOrder({
        order_number: order.order_number,
        client_phone: order.client_phone,
        client_name: `${order.first_name || ""} ${order.last_name || ""}`.trim(),
        gulyash_client_id: order.gulyash_client_id,
        order_type: order.order_type,
        gulyash_branch_id: order.gulyash_branch_id,
        items: items,
        delivery_address:
          order.order_type === "delivery"
            ? {
                street: order.delivery_street,
                house: order.delivery_house,
                entrance: order.delivery_entrance,
                apartment: order.delivery_apartment,
                intercom: order.delivery_intercom,
                comment: order.delivery_comment,
              }
            : null,
        payment_method: order.payment_method,
        total: order.total,
        comment: order.comment,
        desired_time: order.desired_time,
      });

      if (result.success) {
        // Обновляем статус синхронизации в БД
        await db.query(
          `UPDATE orders 
           SET gulyash_order_id = ?, sync_status = 'synced', sync_error = NULL 
           WHERE id = ?`,
          [result.gulyash_order_id, orderId]
        );

        // Удаляем из таблицы очереди sync_queue
        await db.query(
          `UPDATE sync_queue 
           SET status = 'completed', completed_at = NOW() 
           WHERE entity_type = 'order' AND entity_id = ?`,
          [orderId]
        );

        // WebSocket: уведомление об успешной синхронизации
        try {
          const { wsServer } = await import("../index.js");
          wsServer.notifySyncSuccess("order", orderId, order.city_id);
        } catch (wsError) {
          console.error("Failed to send WebSocket notification:", wsError);
        }

        // Логирование успешной синхронизации
        await logger.sync.success("order", orderId, result.gulyash_order_id);

        return { success: true, gulyash_order_id: result.gulyash_order_id };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      // Получаем city_id для уведомления
      const [orderData] = await db.query(`SELECT city_id FROM orders WHERE id = ?`, [orderId]);
      const cityId = orderData[0]?.city_id;

      // Логирование ошибки
      await logger.sync.failed("order", orderId, error.message, job.attemptsMade);

      // Обновляем статус синхронизации
      await db.query(
        `UPDATE orders 
         SET sync_status = 'failed', sync_error = ?, sync_attempts = sync_attempts + 1 
         WHERE id = ?`,
        [error.message, orderId]
      );

      // Обновляем очередь синхронизации
      await db.query(
        `UPDATE sync_queue 
         SET status = 'failed', last_error = ?, attempts = attempts + 1,
             next_retry_at = DATE_ADD(NOW(), INTERVAL POW(2, attempts) MINUTE)
         WHERE entity_type = 'order' AND entity_id = ?`,
        [error.message, orderId]
      );

      // WebSocket: уведомление об ошибке синхронизации
      try {
        const { wsServer } = await import("../index.js");
        wsServer.notifySyncError("order", orderId, error.message, cityId);
      } catch (wsError) {
        console.error("Failed to send WebSocket notification:", wsError);
      }

      throw error; // Пробрасываем ошибку для BullMQ
    }
  },
  { connection }
);

/**
 * Обработчик очереди клиентов
 */
export const clientsWorker = new Worker(
  "clients-sync",
  async (job) => {
    const { userId, action } = job.data;

    console.log(`[Clients Worker] Processing ${action} for user ${userId}`);

    try {
      // Получаем данные пользователя
      const [users] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);

      if (users.length === 0) {
        throw new Error(`User ${userId} not found`);
      }

      const user = users[0];

      let result;
      if (action === "create" || !user.gulyash_client_id) {
        // Создаем клиента в Гуляше
        result = await gulyashClient.syncClient({
          phone: user.phone,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          date_of_birth: user.date_of_birth,
        });

        if (result.success) {
          // Сохраняем ID из Гуляша
          await db.query("UPDATE users SET gulyash_client_id = ? WHERE id = ?", [result.gulyash_client_id, userId]);
        }
      } else {
        // Обновляем существующего клиента
        result = await gulyashClient.updateClient(user.gulyash_client_id, {
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          date_of_birth: user.date_of_birth,
        });
      }

      if (result.success) {
        // Обновляем очередь синхронизации
        await db.query(
          `UPDATE sync_queue 
           SET status = 'completed', completed_at = NOW() 
           WHERE entity_type = 'client' AND entity_id = ?`,
          [userId]
        );

        console.log(`[Clients Worker] User ${userId} synced successfully`);
        return { success: true };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`[Clients Worker] Error processing user ${userId}:`, error.message);

      // Обновляем очередь синхронизации
      await db.query(
        `UPDATE sync_queue 
         SET status = 'failed', last_error = ?, attempts = attempts + 1,
             next_retry_at = DATE_ADD(NOW(), INTERVAL POW(2, attempts) MINUTE)
         WHERE entity_type = 'client' AND entity_id = ?`,
        [error.message, userId]
      );

      throw error;
    }
  },
  { connection }
);

/**
 * Обработчик очереди бонусов
 */
export const bonusesWorker = new Worker(
  "bonuses-sync",
  async (job) => {
    const { bonusHistoryId, action } = job.data;

    console.log(`[Bonuses Worker] Processing ${action} for bonus ${bonusHistoryId}`);

    try {
      // Получаем данные транзакции
      const [transactions] = await db.query(
        `SELECT bh.*, u.gulyash_client_id, o.order_number
         FROM bonus_history bh
         JOIN users u ON bh.user_id = u.id
         LEFT JOIN orders o ON bh.order_id = o.id
         WHERE bh.id = ?`,
        [bonusHistoryId]
      );

      if (transactions.length === 0) {
        throw new Error(`Bonus transaction ${bonusHistoryId} not found`);
      }

      const transaction = transactions[0];

      if (!transaction.gulyash_client_id) {
        throw new Error("User does not have gulyash_client_id");
      }

      // Отправляем транзакцию в Гуляш
      const result = await gulyashClient.syncBonusTransaction({
        gulyash_client_id: transaction.gulyash_client_id,
        type: transaction.type,
        amount: transaction.amount,
        order_number: transaction.order_number,
        description: transaction.description,
      });

      if (result.success) {
        // Обновляем статус синхронизации
        await db.query(
          `UPDATE bonus_history 
           SET gulyash_transaction_id = ?, sync_status = 'synced' 
           WHERE id = ?`,
          [result.gulyash_transaction_id, bonusHistoryId]
        );

        // Обновляем очередь синхронизации
        await db.query(
          `UPDATE sync_queue 
           SET status = 'completed', completed_at = NOW() 
           WHERE entity_type = 'bonus' AND entity_id = ?`,
          [bonusHistoryId]
        );

        console.log(`[Bonuses Worker] Bonus ${bonusHistoryId} synced successfully`);
        return { success: true };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`[Bonuses Worker] Error processing bonus ${bonusHistoryId}:`, error.message);

      // Обновляем статус синхронизации
      await db.query(
        `UPDATE bonus_history 
         SET sync_status = 'failed' 
         WHERE id = ?`,
        [bonusHistoryId]
      );

      // Обновляем очередь синхронизации
      await db.query(
        `UPDATE sync_queue 
         SET status = 'failed', last_error = ?, attempts = attempts + 1,
             next_retry_at = DATE_ADD(NOW(), INTERVAL POW(2, attempts) MINUTE)
         WHERE entity_type = 'bonus' AND entity_id = ?`,
        [error.message, bonusHistoryId]
      );

      throw error;
    }
  },
  { connection }
);

// ==================== Event Listeners ====================

ordersWorker.on("completed", (job) => {
  console.log(`✅ Order sync job ${job.id} completed`);
});

ordersWorker.on("failed", (job, err) => {
  console.error(`❌ Order sync job ${job?.id} failed:`, err.message);
});

clientsWorker.on("completed", (job) => {
  console.log(`✅ Client sync job ${job.id} completed`);
});

clientsWorker.on("failed", (job, err) => {
  console.error(`❌ Client sync job ${job?.id} failed:`, err.message);
});

bonusesWorker.on("completed", (job) => {
  console.log(`✅ Bonus sync job ${job.id} completed`);
});

bonusesWorker.on("failed", (job, err) => {
  console.error(`❌ Bonus sync job ${job?.id} failed:`, err.message);
});

// ==================== Утилиты ====================

/**
 * Добавить заказ в очередь синхронизации
 */
export async function addOrderToSyncQueue(orderId) {
  // Если синхронизация отключена, просто помечаем как synced
  if (process.env.ENABLE_SYNC === "false") {
    await db.query(`UPDATE orders SET sync_status = 'synced' WHERE id = ?`, [orderId]);
    console.log(`[Sync Disabled] Order ${orderId} marked as synced (no actual sync)`);
    return;
  }

  // Добавляем в БД очередь
  await db.query(
    `INSERT INTO sync_queue (entity_type, entity_id, action, status)
     VALUES ('order', ?, 'create', 'pending')
     ON DUPLICATE KEY UPDATE status = 'pending', attempts = 0`,
    [orderId]
  );

  // Добавляем в BullMQ
  await ordersQueue.add("sync-order", {
    orderId,
    action: "create",
  });
}

/**
 * Добавить клиента в очередь синхронизации
 */
export async function addClientToSyncQueue(userId, action = "create") {
  // Если синхронизация отключена, пропускаем
  if (process.env.ENABLE_SYNC === "false") {
    console.log(`[Sync Disabled] Client ${userId} sync skipped`);
    return;
  }

  await db.query(
    `INSERT INTO sync_queue (entity_type, entity_id, action, status)
     VALUES ('client', ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE status = 'pending', attempts = 0`,
    [userId, action]
  );

  await clientsQueue.add("sync-client", {
    userId,
    action,
  });
}

/**
 * Добавить бонусную транзакцию в очередь синхронизации
 */
export async function addBonusToSyncQueue(bonusHistoryId) {
  // Если синхронизация отключена, пропускаем
  if (process.env.ENABLE_SYNC === "false") {
    console.log(`[Sync Disabled] Bonus ${bonusHistoryId} sync skipped`);
    return;
  }

  await db.query(
    `INSERT INTO sync_queue (entity_type, entity_id, action, status)
     VALUES ('bonus', ?, 'create', 'pending')
     ON DUPLICATE KEY UPDATE status = 'pending', attempts = 0`,
    [bonusHistoryId]
  );

  await bonusesQueue.add("sync-bonus", {
    bonusHistoryId,
    action: "create",
  });
}

export default {
  ordersQueue,
  clientsQueue,
  bonusesQueue,
  addOrderToSyncQueue,
  addClientToSyncQueue,
  addBonusToSyncQueue,
};
