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

const integrationDefaultOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    age: 86400,
    count: 1000,
  },
  removeOnFail: {
    age: 604800,
  },
};

export const iikoMenuSyncQueue = new Queue("sync-iiko-menu", {
  connection: redisConnection,
  defaultJobOptions: integrationDefaultOptions,
});

export const iikoStopListSyncQueue = new Queue("sync-iiko-stoplist", {
  connection: redisConnection,
  defaultJobOptions: integrationDefaultOptions,
});

export const iikoOrdersSyncQueue = new Queue("sync-iiko-orders", {
  connection: redisConnection,
  defaultJobOptions: integrationDefaultOptions,
});

export const premiumBonusClientsSyncQueue = new Queue("sync-premiumbonus-clients", {
  connection: redisConnection,
  defaultJobOptions: integrationDefaultOptions,
});

export const premiumBonusPurchasesSyncQueue = new Queue("sync-premiumbonus-purchases", {
  connection: redisConnection,
  defaultJobOptions: integrationDefaultOptions,
});
export async function addTelegramNotification(data) {
  try {
    const job = await telegramQueue.add("send-notification", data, {
      priority: data.priority || 1,
    });
    return job;
  } catch (error) {
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
    throw error;
  }
}

export async function enqueueIikoMenuSync(data) {
  return iikoMenuSyncQueue.add("sync-menu", data, {
    priority: data.priority || 3,
  });
}

export async function enqueueIikoStopListSync(data) {
  return iikoStopListSyncQueue.add("sync-stoplist", data, {
    priority: data.priority || 2,
  });
}

export async function enqueueIikoOrderSync(data) {
  return iikoOrdersSyncQueue.add("sync-order", data, {
    priority: data.priority || 1,
    jobId: data?.orderId ? `iiko-order-${data.orderId}-${Date.now()}` : undefined,
  });
}

export async function enqueuePremiumBonusClientSync(data) {
  return premiumBonusClientsSyncQueue.add("sync-client", data, {
    priority: data.priority || 1,
    jobId: data?.userId ? `pb-client-${data.userId}-${Date.now()}` : undefined,
  });
}

export async function enqueuePremiumBonusPurchaseSync(data) {
  return premiumBonusPurchasesSyncQueue.add("sync-purchase", data, {
    priority: data.priority || 1,
    jobId: data?.orderId ? `pb-purchase-${data.orderId}-${Date.now()}` : undefined,
  });
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
    throw error;
  }
}
export async function cleanQueue(queue, grace = 86400000) {
  try {
    const cleaned = await queue.clean(grace, 1000, "completed");
    return cleaned;
  } catch (error) {
    throw error;
  }
}
export default {
  telegramQueue,
  imageQueue,
  iikoMenuSyncQueue,
  iikoStopListSyncQueue,
  iikoOrdersSyncQueue,
  premiumBonusClientsSyncQueue,
  premiumBonusPurchasesSyncQueue,
  addTelegramNotification,
  addImageProcessing,
  enqueueIikoMenuSync,
  enqueueIikoStopListSync,
  enqueueIikoOrderSync,
  enqueuePremiumBonusClientSync,
  enqueuePremiumBonusPurchaseSync,
  getQueueStats,
  getFailedJobs,
  retryFailedJobs,
  cleanQueue,
  redisConnection,
};
