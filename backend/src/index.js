import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { testConnection } from "./config/database.js";
import { testRedisConnection } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  apiLimiter,
  sensitiveRouteLimiter,
  unauthorizedBanShield,
} from "./middleware/rateLimiter.js";
import { hppMiddleware } from "./middleware/hpp.js";
import { createCsrfProtection } from "./middleware/csrf.js";
import { router as authRoutes } from "./modules/auth/index.js";
import { router as deliveryRoutes } from "./modules/delivery/index.js";
import { router as usersRoutes } from "./modules/users/index.js";
import { router as menuRoutes } from "./modules/menu/index.js";
import { router as ordersRoutes } from "./modules/orders/index.js";
import { router as adminRoutes } from "./modules/admin/index.js";
import { router as polygonsRoutes } from "./modules/polygons/index.js";
import {
  clientRouter as loyaltyClientRoutes,
  adminRouter as loyaltyAdminRoutes,
} from "./modules/loyalty/index.js";
import { router as logsRoutes } from "./modules/logs/index.js";
import { router as analyticsRoutes } from "./modules/analytics/index.js";
import { router as uploadsRoutes } from "./modules/uploads/index.js";
import { router as settingsRoutes } from "./modules/settings/index.js";
import { router as broadcastsRoutes } from "./modules/broadcasts/index.js";
import { router as subscriptionCampaignsRoutes } from "./modules/subscription-campaigns/index.js";
import { router as storiesRoutes } from "./modules/stories/index.js";
import {
  adminRouter as integrationsAdminRoutes,
  webhooksRouter as integrationsWebhooksRoutes,
} from "./modules/integrations/index.js";
import WSServer from "./websocket/server.js";
import { registerWsServer } from "./websocket/runtime.js";
import { startWorkers, stopWorkers } from "./workers/index.js";
import { logger } from "./utils/logger.js";

dotenv.config();
const app = express();
const workersMode = String(
  process.env.WORKERS_MODE || (process.env.NODE_ENV === "production" ? "external" : "inline")
)
  .trim()
  .toLowerCase();
const runWorkersInline = workersMode === "inline";
const runtimeReadiness = {
  db: false,
  redis: false,
  workers: false,
  startup: false,
};

const resolveTrustProxySetting = () => {
  const rawValue = process.env.TRUST_PROXY;
  if (!rawValue) {
    return false;
  }

  const normalizedValue = rawValue.trim().toLowerCase();

  if (["false", "0", "off", "no"].includes(normalizedValue)) {
    return false;
  }

  if (["true", "on", "yes"].includes(normalizedValue)) {
    // Безопасный дефолт для "включено": доверяем только первому proxy hop.
    return 1;
  }

  if (/^\d+$/.test(normalizedValue)) {
    const hops = Number.parseInt(normalizedValue, 10);
    return Number.isNaN(hops) || hops < 0 ? false : hops;
  }

  if (rawValue.includes(",")) {
    return rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return rawValue.trim();
};

app.set("trust proxy", resolveTrustProxySetting());

const PORT = process.env.PORT || 3000;
const rawCorsOrigins = process.env.CORS_ORIGINS || "";
const defaultProductionOrigins = ["https://app.panda.akbrzda.ru", "https://panda.akbrzda.ru"];
const defaultDevelopmentOrigins = [
  "http://localhost:5174",
  "http://localhost:5173",
  "https://admin.dev.akbrzda.ru",
  "https://app.dev.akbrzda.ru",
  "http://localhost:4173",
];
const corsOrigins = [
  ...rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(process.env.NODE_ENV === "production" ? defaultProductionOrigins : defaultDevelopmentOrigins),
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
  if (corsOrigins.length === 0) return false;
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
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token", "X-Miniapp-Platform"],
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
  })
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
app.use(createCsrfProtection({ isOriginAllowed }));
app.use(hppMiddleware);
// strict=false позволяет корректно обработать payload `null` на /auth/refresh
// и вернуть контролируемый 401 вместо SyntaxError от body-parser.
app.use(
  express.json({
    charset: "utf-8",
    limit: "10kb",
    strict: false,
    verify: (req, _res, buffer) => {
      req.rawBody = buffer?.length ? buffer.toString("utf8") : "";
    },
  })
);
app.use(express.urlencoded({ extended: true, charset: "utf-8", limit: "2mb" }));

// Глобальный rate limiter
app.use("/api/", apiLimiter);
app.use(
  ["/api/admin", "/api/analytics", "/api/orders/admin", "/api/auth/session", "/api/auth/ws-ticket"],
  sensitiveRouteLimiter,
  unauthorizedBanShield()
);
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

const buildReadinessPayload = () => {
  const isReady =
    runtimeReadiness.startup &&
    runtimeReadiness.db &&
    runtimeReadiness.redis &&
    runtimeReadiness.workers;
  return {
    status: isReady ? "ok" : "fail",
    timestamp: new Date().toISOString(),
    service: "miniapp-panda-backend",
    checks: {
      db: runtimeReadiness.db ? "ok" : "fail",
      redis: runtimeReadiness.redis ? "ok" : "fail",
      workers: runtimeReadiness.workers ? "ok" : "fail",
      startup: runtimeReadiness.startup ? "ok" : "fail",
    },
  };
};

app.get("/health/live", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "miniapp-panda-backend",
  });
});
app.get("/health/ready", (req, res) => {
  const payload = buildReadinessPayload();
  return res.status(payload.status === "ok" ? 200 : 503).json(payload);
});
app.get("/health", (req, res) => {
  const payload = buildReadinessPayload();
  return res.status(payload.status === "ok" ? 200 : 503).json(payload);
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
app.use("/api/client/loyalty", loyaltyClientRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin/loyalty", loyaltyAdminRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/broadcasts", broadcastsRoutes);
app.use("/api/campaign", subscriptionCampaignsRoutes);
app.use("/api/stories", storiesRoutes);
app.use("/api/admin/integrations", integrationsAdminRoutes);
app.use("/api/webhooks/iiko", integrationsWebhooksRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
const server = http.createServer(app);
const wsServer = new WSServer(server);
registerWsServer(wsServer);
wsServer.startHeartbeat();
export { wsServer };

const listenServer = () =>
  new Promise((resolve, reject) => {
    server.listen(PORT, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const bootstrap = async () => {
  try {
    await testConnection();
    runtimeReadiness.db = true;
    await logger.system.dbConnected();

    await testRedisConnection();
    runtimeReadiness.redis = true;
    await logger.system.redisConnected();

    if (runWorkersInline) {
      await startWorkers();
    }
    runtimeReadiness.workers = true;

    await listenServer();
    runtimeReadiness.startup = true;
    await logger.system.startup(PORT);
  } catch (error) {
    runtimeReadiness.startup = false;
    await logger.system.dbError(`Fail-fast startup: ${error.message}`);
    try {
      await stopWorkers();
    } catch (stopError) {
      await logger.system.dbError(
        `Failed to stop workers after startup error: ${stopError.message}`
      );
    }
    process.exit(1);
  }
};

bootstrap();
process.on("SIGTERM", async () => {
  await logger.system.shutdown("SIGTERM received");
  if (runWorkersInline) {
    await stopWorkers();
  }
  server.close(() => {
    process.exit(0);
  });
});
process.on("SIGINT", async () => {
  await logger.system.shutdown("SIGINT received");
  if (runWorkersInline) {
    await stopWorkers();
  }
  server.close(() => {
    process.exit(0);
  });
});
