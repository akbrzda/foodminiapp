import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envDir = path.resolve(__dirname, "..");
const nodeEnv = String(process.env.NODE_ENV || "development").trim();
const envFiles = [".env", ".env.local", `.env.${nodeEnv}`, `.env.${nodeEnv}.local`];

for (const fileName of envFiles) {
  const envPath = path.join(envDir, fileName);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const start = async () => {
  const [{ createServer }, { createBotApiServer }, { logger }, { testConnection }, { testRedisConnection }, { createTelegramWorker }, { createTelegramCommandBot }] =
    await Promise.all([
      import("http"),
      import("./server.js"),
      import("./utils/logger.js"),
      import("./config/database.js"),
      import("./config/redis.js"),
      import("./workers/telegram.worker.js"),
      import("./modules/commandBot.js"),
    ]);

  const PORT = Number(process.env.PORT || 3001);
  const commandBot = createTelegramCommandBot();
  const app = createBotApiServer({ commandBot });
  const server = createServer(app);
  const telegramWorker = createTelegramWorker();

  const shutdown = async (signal) => {
    logger.warn("Завершение bot-service", { signal });
    try {
      await commandBot.stop();
    } catch (error) {
      logger.error("Ошибка остановки polling-бота", { error: error?.message || String(error) });
    }

    try {
      await telegramWorker.close();
    } catch (error) {
      logger.error("Ошибка остановки telegram worker", { error: error?.message || String(error) });
    }

    server.close(() => {
      process.exit(0);
    });
  };

  server.listen(PORT, async () => {
    logger.info("bot-service запущен", { port: PORT });

    try {
      await testConnection();
      logger.info("DB подключена");
    } catch (error) {
      logger.error("Ошибка подключения DB", { error: error?.message || String(error) });
    }

    try {
      await testRedisConnection();
      logger.info("Redis подключен");
    } catch (error) {
      logger.error("Ошибка подключения Redis", { error: error?.message || String(error) });
    }

    try {
      await commandBot.start();
    } catch (error) {
      logger.error("Ошибка запуска polling-бота", { error: error?.message || String(error) });
    }
  });

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((error) => {
  console.error("[bot-service] fatal startup error:", error);
  process.exit(1);
});
