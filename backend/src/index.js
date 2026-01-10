import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { testConnection } from "./config/database.js";
import { testRedisConnection } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authenticateToken } from "./middleware/auth.js";

// Routes
import authRoutes from "./routes/auth.js";
import citiesRoutes from "./routes/cities.js";
import usersRoutes from "./routes/users.js";
import menuRoutes from "./routes/menu.js";
import ordersRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js";
import polygonsRoutes from "./routes/polygons.js";
import bonusesRoutes from "./routes/bonuses.js";
import syncRoutes from "./routes/sync.js";

// Queues and Workers - только если синхронизация включена
if (process.env.ENABLE_SYNC !== "false") {
  import("./queues/sync.js").then(() => {
    console.log("⚙️  BullMQ sync queues enabled");
  });
} else {
  console.log("ℹ️  Sync queues disabled (ENABLE_SYNC=false)");
}

// WebSocket
import WSServer from "./websocket/server.js";

// Загрузка переменных окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "miniapp-panda-backend",
  });
});

// API routes
app.get("/api", (req, res) => {
  res.json({
    message: "Miniapp Panda API",
    version: "1.0.0",
  });
});

// API роутеры
app.use("/api/auth", authRoutes);
app.use("/api/cities", citiesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/polygons", polygonsRoutes);
app.use("/api/bonuses", bonusesRoutes);
app.use("/api/sync", syncRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Запуск сервера с проверкой подключений
const server = http.createServer(app);

// Инициализация WebSocket сервера
const wsServer = new WSServer(server);
wsServer.startHeartbeat();

// Экспорт wsServer для использования в других модулях
export { wsServer };

server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}`);

  // Проверка подключений
  await testConnection();
  await testRedisConnection();
});
