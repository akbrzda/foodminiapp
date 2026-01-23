import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
dotenv.config();
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "redis_password_change_me",
  maxRetriesPerRequest: null,
});
export const telegramQueue = new Queue("telegram-notifications", {
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
export async function addTelegramNotification(data) {
  try {
    const job = await telegramQueue.add("send-notification", data, {
      priority: data.priority || 1,
    });
    return job;
  } catch (error) {
    console.error("❌ Failed to queue Telegram notification:", error);
    throw error;
  }
}
export async function addImageProcessing(data) {
  try {
    const job = await imageQueue.add("process-image", data, {
      priority: data.priority || 5,
    });
    return job;
  } catch (error) {
    console.error("❌ Failed to queue image processing:", error);
    throw error;
  }
}
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
export async function retryFailedJobs(queue) {
  try {
    const failedJobs = await queue.getFailed(0, -1);
    let retried = 0;
    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }
    return retried;
  } catch (error) {
    console.error("Failed to retry jobs:", error);
    throw error;
  }
}
export async function cleanQueue(queue, grace = 86400000) {
  try {
    const cleaned = await queue.clean(grace, 1000, "completed");
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
