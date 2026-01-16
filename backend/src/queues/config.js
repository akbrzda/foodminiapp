import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

/**
 * Конфигурация подключения к Redis для BullMQ
 */
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "redis_password_change_me",
  maxRetriesPerRequest: null, // Required for BullMQ
});

/**
 * Создание очередей
 */
export const telegramQueue = new Queue("telegram-notifications", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Максимум 3 попытки
    backoff: {
      type: "exponential",
      delay: 60000, // Начальная задержка 1 минута
    },
    removeOnComplete: {
      age: 86400, // Удалять успешные задачи через 24 часа
      count: 1000, // Или когда накопится 1000 задач
    },
    removeOnFail: {
      age: 604800, // Хранить failed задачи 7 дней
    },
  },
});

export const imageQueue = new Queue("image-processing", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 60000,
    },
    removeOnComplete: {
      age: 86400,
      count: 1000,
    },
    removeOnFail: {
      age: 604800,
    },
  },
});

/**
 * Добавить задачу на отправку Telegram уведомления
 */
export async function addTelegramNotification(data) {
  try {
    const job = await telegramQueue.add("send-notification", data, {
      priority: data.priority || 1, // Чем меньше число, тем выше приоритет
    });
    console.log(`✅ Telegram notification queued: ${job.id}`);
    return job;
  } catch (error) {
    console.error("❌ Failed to queue Telegram notification:", error);
    throw error;
  }
}

/**
 * Добавить задачу на обработку изображения
 */
export async function addImageProcessing(data) {
  try {
    const job = await imageQueue.add("process-image", data, {
      priority: data.priority || 5, // Обработка изображений менее критична
    });
    console.log(`✅ Image processing queued: ${job.id}`);
    return job;
  } catch (error) {
    console.error("❌ Failed to queue image processing:", error);
    throw error;
  }
}

/**
 * Получить статистику очереди
 */
export async function getQueueStats(queue) {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    console.error("Failed to get queue stats:", error);
    return null;
  }
}

/**
 * Получить failed задачи
 */
export async function getFailedJobs(queue, start = 0, end = 50) {
  try {
    const jobs = await queue.getFailed(start, end);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch (error) {
    console.error("Failed to get failed jobs:", error);
    return [];
  }
}

/**
 * Повторить failed задачи
 */
export async function retryFailedJobs(queue) {
  try {
    const failedJobs = await queue.getFailed(0, -1);
    let retried = 0;

    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }

    console.log(`✅ Retried ${retried} failed jobs`);
    return retried;
  } catch (error) {
    console.error("Failed to retry jobs:", error);
    throw error;
  }
}

/**
 * Очистить completed задачи
 */
export async function cleanQueue(queue, grace = 86400000) {
  try {
    const cleaned = await queue.clean(grace, 1000, "completed");
    console.log(`✅ Cleaned ${cleaned.length} completed jobs from queue`);
    return cleaned;
  } catch (error) {
    console.error("Failed to clean queue:", error);
    throw error;
  }
}

export default {
  telegramQueue,
  imageQueue,
  addTelegramNotification,
  addImageProcessing,
  getQueueStats,
  getFailedJobs,
  retryFailedJobs,
  cleanQueue,
  redisConnection,
};
