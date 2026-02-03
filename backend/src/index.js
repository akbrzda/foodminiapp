import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { testConnection } from "./config/database.js";
import { testRedisConnection } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
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
import WSServer from "./websocket/server.js";
import { startWorkers, stopWorkers } from "./workers/index.js";
import { logger } from "./utils/logger.js";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rawCorsOrigins = process.env.CORS_ORIGINS || "";
const corsOrigins = rawCorsOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ charset: "utf-8", limit: "2mb" }));
app.use(express.urlencoded({ extended: true, charset: "utf-8", limit: "2mb" }));
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
app.use(notFoundHandler);
app.use(errorHandler);
const server = http.createServer(app);
const wsServer = new WSServer(server);
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
