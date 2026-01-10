import db from "../config/database.js";
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Winston logger для системных логов (записывает в файл)
 */
const systemLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Все логи в combined.log
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Только ошибки в error.log
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// В режиме разработки также выводить в консоль
if (process.env.NODE_ENV !== "production") {
  systemLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

/**
 * Утилиты для логирования
 */

/**
 * Логирование действия администратора
 *
 * @param {number} adminUserId - ID администратора
 * @param {string} action - Действие (например, 'create_order', 'update_status', 'delete_user')
 * @param {string} entityType - Тип сущности ('order', 'user', 'menu_item', и т.д.)
 * @param {number} entityId - ID сущности
 * @param {string} description - Описание действия
 * @param {object} req - Express request object (опционально, для получения IP и User-Agent)
 */
export async function logAdminAction(adminUserId, action, entityType = null, entityId = null, description = null, req = null) {
  try {
    const ipAddress = req ? req.ip || req.connection?.remoteAddress : null;
    const userAgent = req ? req.get("user-agent") : null;

    await db.query(
      `INSERT INTO admin_action_logs 
       (admin_user_id, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminUserId, action, entityType, entityId, description, ipAddress, userAgent]
    );
  } catch (error) {
    // Не прерываем выполнение при ошибке логирования
    console.error("Failed to log admin action:", error);
  }
}

/**
 * Логирование системного события (в файл, не в БД)
 *
 * @param {string} level - Уровень ('info', 'warn', 'error')
 * @param {string} category - Категория ('order', 'sync', 'auth', 'system', и т.д.)
 * @param {string} message - Сообщение
 * @param {object} context - Дополнительный контекст
 */
export function logSystem(level, category, message, context = null) {
  systemLogger.log(level, message, {
    category,
    ...context,
  });
}

/**
 * Специализированные методы логирования
 */

export const logger = {
  // Логи заказов
  order: {
    created: (orderId, userId, total) => logSystem("info", "order", `Order ${orderId} created`, { orderId, userId, total }),

    statusChanged: (orderId, oldStatus, newStatus, changedBy) =>
      logSystem("info", "order", `Order ${orderId} status changed: ${oldStatus} → ${newStatus}`, { orderId, oldStatus, newStatus, changedBy }),

    cancelled: (orderId, reason, cancelledBy) =>
      logSystem("warning", "order", `Order ${orderId} cancelled: ${reason}`, { orderId, reason, cancelledBy }),

    error: (orderId, error) => logSystem("error", "order", `Order ${orderId} error: ${error}`, { orderId, error }),
  },

  // Логи синхронизации
  sync: {
    started: (entity, entityId) => logSystem("info", "sync", `Sync started for ${entity} ${entityId}`, { entity, entityId }),

    success: (entity, entityId, gulyashId) => logSystem("info", "sync", `Sync successful for ${entity} ${entityId}`, { entity, entityId, gulyashId }),

    failed: (entity, entityId, error, attempt) =>
      logSystem("error", "sync", `Sync failed for ${entity} ${entityId} (attempt ${attempt}): ${error}`, { entity, entityId, error, attempt }),

    retry: (entity, entityId, nextRetryAt) =>
      logSystem("warning", "sync", `Sync will retry for ${entity} ${entityId} at ${nextRetryAt}`, { entity, entityId, nextRetryAt }),
  },

  // Логи аутентификации
  auth: {
    login: (userId, role, ip) => logSystem("info", "auth", `User logged in`, { userId, role, ip }),

    loginFailed: (identifier, reason, ip) => logSystem("warning", "auth", `Login failed: ${reason}`, { identifier, reason, ip }),

    tokenExpired: (userId) => logSystem("info", "auth", `Token expired for user ${userId}`, { userId }),

    unauthorized: (path, ip) => logSystem("warning", "auth", `Unauthorized access attempt to ${path}`, { path, ip }),
  },

  // Логи бонусов
  bonus: {
    earned: (userId, amount, orderId) => logSystem("info", "bonus", `User ${userId} earned ${amount} bonuses`, { userId, amount, orderId }),

    used: (userId, amount, orderId) => logSystem("info", "bonus", `User ${userId} used ${amount} bonuses`, { userId, amount, orderId }),

    error: (userId, error) => logSystem("error", "bonus", `Bonus error for user ${userId}: ${error}`, { userId, error }),
  },

  // Логи системы
  system: {
    startup: (port) => logSystem("info", "system", `Server started on port ${port}`, { port }),

    shutdown: (reason) => logSystem("warn", "system", `Server shutting down: ${reason}`, { reason }),

    dbConnected: () => logSystem("info", "system", "Database connected successfully"),

    dbError: (error) => logSystem("error", "system", `Database error: ${error}`, { error }),

    redisConnected: () => logSystem("info", "system", "Redis connected successfully"),

    redisError: (error) => logSystem("error", "system", `Redis error: ${error}`, { error }),
  },

  // Логи администраторов (обертка для logAdminAction)
  admin: {
    action: (adminUserId, action, entityType, entityId, description, req) =>
      logAdminAction(adminUserId, action, entityType, entityId, description, req),
  },
};

/**
 * Middleware для логирования всех действий админов
 */
export function adminActionLogger(action, entityType = null) {
  return (req, res, next) => {
    // Сохраняем оригинальный res.json
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      // Логируем после успешного ответа
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || data?.id || data?.order?.id || data?.user?.id;
        const description = `${req.method} ${req.originalUrl}`;

        logAdminAction(req.user?.id, action, entityType, entityId, description, req).catch((err) =>
          console.error("Failed to log admin action:", err)
        );
      }

      return originalJson(data);
    };

    next();
  };
}

export default {
  logAdminAction,
  logSystem,
  logger,
  adminActionLogger,
};
