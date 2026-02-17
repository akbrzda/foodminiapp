import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { testConnection } from "./config/database.js";
import { testRedisConnection } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { router as authRoutes } from "./modules/auth/index.js";
import { router as deliveryRoutes } from "./modules/delivery/index.js";
import { router as usersRoutes } from "./modules/users/index.js";
import { router as menuRoutes } from "./modules/menu/index.js";
import { router as ordersRoutes } from "./modules/orders/index.js";
import { router as adminRoutes } from "./modules/admin/index.js";
import { router as polygonsRoutes } from "./modules/polygons/index.js";
import { router as geocodeRoutes } from "./modules/geocode/index.js";
import { clientRouter as loyaltyClientRoutes, adminRouter as loyaltyAdminRoutes } from "./modules/loyalty/index.js";
import { router as logsRoutes } from "./modules/logs/index.js";
import { router as analyticsRoutes } from "./modules/analytics/index.js";
import { router as uploadsRoutes } from "./modules/uploads/index.js";
import { router as settingsRoutes } from "./modules/settings/index.js";
import { router as broadcastsRoutes } from "./modules/broadcasts/index.js";
import { adminRouter as integrationsAdminRoutes, webhooksRouter as integrationsWebhooksRoutes } from "./modules/integrations/index.js";
import WSServer from "./websocket/server.js";
import { registerWsServer } from "./websocket/runtime.js";
import { startWorkers, stopWorkers } from "./workers/index.js";
import { logger } from "./utils/logger.js";

dotenv.config();
const app = express();

// Настройка trust proxy для корректной работы с reverse proxy (nginx, CloudFlare и т.д.)
// Доверяем первому прокси-серверу для определения реального IP пользователя
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rawCorsOrigins = process.env.CORS_ORIGINS || "";
const defaultProductionOrigins = ["https://app.panda.akbrzda.ru", "https://admin.panda.akbrzda.ru"];
const corsOrigins = [
  ...rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(process.env.NODE_ENV === "production" ? defaultProductionOrigins : []),
]
  .map((origin) => origin.trim())
  .filter(Boolean)
  .filter((origin, index, array) => array.indexOf(origin) === index);
const normalizeOrigin = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
};
const getOriginHost = (value) => {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch (error) {
    return "";
  }
};
const isOriginAllowed = (origin) => {
  if (corsOrigins.length === 0) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  const originHost = getOriginHost(normalizedOrigin);
  return corsOrigins.some((allowed) => {
    const normalizedAllowed = normalizeOrigin(allowed);
    if (!normalizedAllowed) return false;
    if (normalizedAllowed === "*") return true;
    if (normalizedAllowed === normalizedOrigin) return true;
    const allowedHost = getOriginHost(normalizedAllowed) || normalizedAllowed;
    if (originHost && allowedHost && originHost === allowedHost) return true;
    return false;
  });
};
const corsOptions = {
  origin: (origin, callback) => {
    // Для non-browser клиентов (мониторинг, боты, curl) Origin может отсутствовать.
    // CORS в этом случае не является защитным механизмом, поэтому пропускаем запрос.
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    const error = new Error(`Not allowed by CORS: ${origin}`);
    error.status = 403;
    return callback(error, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};

// Security Headers с помощью Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 год
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// HTTPS redirect в production
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    // Для preflight-запросов редирект ломает CORS, поэтому пропускаем OPTIONS.
    if (req.method === "OPTIONS") {
      return next();
    }
    const isSecure = req.secure || req.header("x-forwarded-proto") === "https";
    if (!isSecure) {
      return res.redirect(`https://${req.header("host")}${req.url}`);
    }
    return next();
  });
}

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(cookieParser());
// strict=false позволяет корректно обработать payload `null` на /auth/refresh
// и вернуть контролируемый 401 вместо SyntaxError от body-parser.
app.use(express.json({ charset: "utf-8", limit: "2mb", strict: false }));
app.use(express.urlencoded({ extended: true, charset: "utf-8", limit: "2mb" }));

// Глобальный rate limiter
app.use("/api/", apiLimiter);
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "miniapp-panda-backend",
  });
});
app.get("/api", (req, res) => {
  res.json({
    message: "Miniapp Panda API",
    version: "1.0.0",
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/cities", deliveryRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/polygons", polygonsRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/client/loyalty", loyaltyClientRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin/loyalty", loyaltyAdminRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/broadcasts", broadcastsRoutes);
app.use("/api/admin/integrations", integrationsAdminRoutes);
app.use("/api/webhooks/iiko", integrationsWebhooksRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
const server = http.createServer(app);
const wsServer = new WSServer(server);
registerWsServer(wsServer);
wsServer.startHeartbeat();
export { wsServer };
server.listen(PORT, async () => {
  await logger.system.startup(PORT);
  try {
    await testConnection();
    await logger.system.dbConnected();
  } catch (error) {
    await logger.system.dbError(error.message);
  }
  try {
    await testRedisConnection();
    await logger.system.redisConnected();
  } catch (error) {
    await logger.system.redisError(error.message);
  }
  try {
    await startWorkers();
  } catch (error) {
    await logger.system.dbError(`Failed to start workers: ${error.message}`);
  }
});
process.on("SIGTERM", async () => {
  await logger.system.shutdown("SIGTERM received");
  await stopWorkers();
  server.close(() => {
    process.exit(0);
  });
});
process.on("SIGINT", async () => {
  await logger.system.shutdown("SIGINT received");
  await stopWorkers();
  server.close(() => {
    process.exit(0);
  });
});
