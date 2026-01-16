import { createTelegramWorker } from "./telegram.worker.js";
import { createImageWorker } from "./image.worker.js";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";

dotenv.config();

// Создаем отдельное подключение для воркеров
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "redis_password_change_me",
  maxRetriesPerRequest: null, // Required for BullMQ
});

/**
 * Главный файл для запуска всех воркеров
 * Можно запустить отдельным процессом: node src/workers/index.js
 */

let telegramWorker;
let imageWorker;

/**
 * Запустить все воркеры
 */
export async function startWorkers() {
  try {
    console.log("🚀 Starting workers...");

    // Запускаем Telegram Worker
    telegramWorker = createTelegramWorker(redisConnection);

    // Запускаем Image Worker
    imageWorker = createImageWorker(redisConnection);

    console.log("✅ All workers started successfully");
    logger.system.startup("Background workers started");

    return {
      telegramWorker,
      imageWorker,
    };
  } catch (error) {
    console.error("❌ Failed to start workers:", error);
    logger.system.dbError(`Failed to start workers: ${error.message}`);
    throw error;
  }
}

/**
 * Остановить все воркеры
 */
export async function stopWorkers() {
  try {
    console.log("⏳ Stopping workers...");

    const promises = [];

    if (telegramWorker) {
      promises.push(telegramWorker.close());
    }

    if (imageWorker) {
      promises.push(imageWorker.close());
    }

    await Promise.all(promises);

    console.log("✅ All workers stopped");
    logger.system.shutdown("Background workers stopped");
  } catch (error) {
    console.error("❌ Error stopping workers:", error);
    throw error;
  }
}

/**
 * Обработчики graceful shutdown
 */
process.on("SIGTERM", async () => {
  console.log("📥 SIGTERM received, stopping workers...");
  await stopWorkers();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("📥 SIGINT received, stopping workers...");
  await stopWorkers();
  process.exit(0);
});

// Если файл запущен напрямую, запускаем воркеры
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkers().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default {
  startWorkers,
  stopWorkers,
};
