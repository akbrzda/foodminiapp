import db from "../config/database.js";
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для маскировки чувствительных данных
function maskSensitiveData(data) {
  if (!data) return data;

  const masked = { ...data };

  // Маскируем токены
  if (masked.token) {
    masked.token = `${masked.token.substring(0, 10)}...`;
  }

  // Маскируем пароли
  if (masked.password || masked.password_hash) {
    masked.password = "***";
    masked.password_hash = "***";
  }

  // Маскируем номера телефонов (показываем только последние 4 цифры)
  if (masked.phone) {
    const phone = String(masked.phone);
    masked.phone = phone.length > 4 ? `***${phone.slice(-4)}` : "***";
  }

  // Частично маскируем email
  if (masked.email) {
    const email = String(masked.email);
    const [name, domain] = email.split("@");
    if (name && domain) {
      masked.email = `${name.substring(0, 2)}***@${domain}`;
    }
  }

  return masked;
}

// Форматтер с маскировкой
const maskingFormat = winston.format((info) => {
  if (info.context) {
    info.context = maskSensitiveData(info.context);
  }
  if (info.user) {
    info.user = maskSensitiveData(info.user);
  }
  return info;
})();

const systemLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    maskingFormat,
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});
if (process.env.NODE_ENV !== "production") {
  systemLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  );
}
export async function logAdminAction(adminUserId, action, entityType = null, entityId = null, description = null, req = null) {
  try {
    const ipAddress = req ? req.ip || req.connection?.remoteAddress : null;
    const userAgent = req ? req.get("user-agent") : null;
    await db.query(
      `INSERT INTO admin_action_logs 
       (admin_user_id, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminUserId, action, entityType, entityId, description, ipAddress, userAgent],
    );
  } catch (error) {
    console.error("Failed to log admin action:", error);
  }
}
export function logSystem(level, category, message, context = null) {
  systemLogger.log(level, message, {
    category,
    ...context,
  });
}
export const logger = {
  // Прямые методы логирования
  error: (message, context) => systemLogger.error(message, context),
  warn: (message, context) => systemLogger.warn(message, context),
  info: (message, context) => systemLogger.info(message, context),
  debug: (message, context) => systemLogger.debug(message, context),

  // Специфичные логгеры по категориям
  order: {
    created: (orderId, userId, total) => logSystem("info", "order", `Order ${orderId} created`, { orderId, userId, total }),
    statusChanged: (orderId, oldStatus, newStatus, changedBy) =>
      logSystem("info", "order", `Order ${orderId} status changed: ${oldStatus} → ${newStatus}`, { orderId, oldStatus, newStatus, changedBy }),
    cancelled: (orderId, reason, cancelledBy) =>
      logSystem("warning", "order", `Order ${orderId} cancelled: ${reason}`, { orderId, reason, cancelledBy }),
    error: (orderId, error) => logSystem("error", "order", `Order ${orderId} error: ${error}`, { orderId, error }),
  },
  auth: {
    login: (userId, role, ip) => logSystem("info", "auth", `User logged in`, { userId, role, ip }),
    loginFailed: (identifier, reason, ip) => logSystem("warning", "auth", `Login failed: ${reason}`, { identifier, reason, ip }),
    tokenExpired: (userId) => logSystem("info", "auth", `Token expired for user ${userId}`, { userId }),
    unauthorized: (path, ip) => logSystem("warning", "auth", `Unauthorized access attempt to ${path}`, { path, ip }),
  },
  bonus: {
    earned: (userId, amount, orderId) => logSystem("info", "bonus", `User ${userId} earned ${amount} bonuses`, { userId, amount, orderId }),
    used: (userId, amount, orderId) => logSystem("info", "bonus", `User ${userId} used ${amount} bonuses`, { userId, amount, orderId }),
    error: (userId, error) => logSystem("error", "bonus", `Bonus error for user ${userId}: ${error}`, { userId, error }),
  },
  system: {
    startup: (port) => logSystem("info", "system", `Server started on port ${port}`, { port }),
    info: (message, context = null) => logSystem("info", "system", message, context || undefined),
    warn: (message, context = null) => logSystem("warn", "system", message, context || undefined),
    shutdown: (reason) => logSystem("warn", "system", `Server shutting down: ${reason}`, { reason }),
    dbConnected: () => logSystem("info", "system", "Database connected successfully"),
    dbError: (error) => logSystem("error", "system", `Database error: ${error}`, { error }),
    redisConnected: () => logSystem("info", "system", "Redis connected successfully"),
    redisError: (error) => logSystem("error", "system", `Redis error: ${error}`, { error }),
  },
  admin: {
    action: (adminUserId, action, entityType, entityId, description, req) =>
      logAdminAction(adminUserId, action, entityType, entityId, description, req),
  },
};
export function adminActionLogger(action, entityType = null) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || data?.id || data?.order?.id || data?.user?.id;
        const description = `${req.method} ${req.originalUrl}`;
        logAdminAction(req.user?.id, action, entityType, entityId, description, req).catch((err) =>
          console.error("Failed to log admin action:", err),
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
