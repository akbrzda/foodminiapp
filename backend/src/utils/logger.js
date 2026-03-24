import db from "../config/database.js";
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_KEY_MARKERS = ["token", "authorization", "csrf"];
const PASSWORD_KEY_MARKERS = ["password", "passhash", "passwordhash"];
const PHONE_KEY_MARKERS = ["phone", "tel"];
const EMAIL_KEY_MARKERS = ["email"];
const ADDRESS_KEY_MARKERS = [
  "address",
  "street",
  "house",
  "apartment",
  "entrance",
  "intercom",
  "comment",
  "delivery",
];

const normalizeMaskKey = (key) =>
  String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const includesAnyMarker = (normalizedKey, markers) =>
  markers.some((marker) => normalizedKey.includes(marker));

const maskToken = (value) => {
  const token = String(value || "");
  if (!token) return token;
  return token.length <= 10 ? "***" : `${token.substring(0, 10)}...`;
};

const maskPhone = (value) => {
  const phone = String(value || "");
  return phone.length > 4 ? `***${phone.slice(-4)}` : "***";
};

const maskEmail = (value) => {
  const email = String(value || "");
  const [name, domain] = email.split("@");
  if (name && domain) {
    return `${name.substring(0, 2)}***@${domain}`;
  }
  return "***";
};

const maskIdentifier = (value) => {
  const identifier = String(value || "").trim();
  if (!identifier) return identifier;
  if (identifier.includes("@")) {
    return maskEmail(identifier);
  }
  const digits = identifier.replace(/[^\d]/g, "");
  if (digits.length >= 10) {
    return maskPhone(identifier);
  }
  if (identifier.length >= 8) {
    return `${identifier.slice(0, 2)}***`;
  }
  return "***";
};

const sanitizeSensitiveValue = (key, value) => {
  const normalizedKey = normalizeMaskKey(key);
  if (!normalizedKey) return value;

  if (includesAnyMarker(normalizedKey, PASSWORD_KEY_MARKERS)) {
    return "***";
  }

  if (includesAnyMarker(normalizedKey, TOKEN_KEY_MARKERS)) {
    return maskToken(value);
  }

  if (normalizedKey === "identifier") {
    return maskIdentifier(value);
  }

  if (includesAnyMarker(normalizedKey, EMAIL_KEY_MARKERS)) {
    return maskEmail(value);
  }

  if (includesAnyMarker(normalizedKey, PHONE_KEY_MARKERS)) {
    return maskPhone(value);
  }

  if (includesAnyMarker(normalizedKey, ADDRESS_KEY_MARKERS)) {
    return "***";
  }

  return value;
};

const maskSensitiveData = (data, parentKey = "", depth = 0) => {
  if (data === null || data === undefined) return data;
  if (depth > 5) return "[depth-limited]";

  if (typeof data === "string") {
    return sanitizeSensitiveValue(parentKey, data);
  }

  if (typeof data !== "object") {
    return sanitizeSensitiveValue(parentKey, data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, parentKey, depth + 1));
  }

  const masked = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value, key, depth + 1);
      continue;
    }
    masked[key] = sanitizeSensitiveValue(key, value);
  }
  return masked;
};

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
      logSystem("warn", "order", `Order ${orderId} cancelled: ${reason}`, { orderId, reason, cancelledBy }),
    error: (orderId, error) => logSystem("error", "order", `Order ${orderId} error: ${error}`, { orderId, error }),
  },
  auth: {
    login: (userId, role, ip, extra = null) =>
      logSystem("info", "auth", `User logged in`, { userId, role, ip, ...(extra && typeof extra === "object" ? extra : {}) }),
    logout: (userId, role, ip) => logSystem("info", "auth", `User logged out`, { userId, role, ip }),
    loginFailed: (identifier, reason, ip) => logSystem("warn", "auth", `Login failed: ${reason}`, { identifier, reason, ip }),
    tokenExpired: (userId) => logSystem("info", "auth", `Token expired for user ${userId}`, { userId }),
    wsTicketIssued: (userId, type, ip) => logSystem("info", "auth", `WS ticket issued`, { userId, type, ip }),
    refreshSuccess: (userId, type, ip) => logSystem("info", "auth", `Session refreshed`, { userId, type, ip }),
    unauthorized: (path, ip) => logSystem("warn", "auth", `Unauthorized access attempt to ${path}`, { path, ip }),
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
