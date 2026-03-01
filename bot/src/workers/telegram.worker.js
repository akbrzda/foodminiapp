import { Worker } from "bullmq";
import redis from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { processTelegramNotificationJob } from "../services/orderNotificationService.js";

const QUEUE_NAME = "telegram-notifications";

export const createTelegramWorker = () => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.debug("Обработка telegram job", { jobId: job.id, type: job.data?.type || null });
      return processTelegramNotificationJob(job.data || {});
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.debug("Telegram job completed", { jobId: job?.id || null });
  });

  worker.on("failed", (job, err) => {
    logger.error("Telegram job failed", {
      jobId: job?.id || null,
      error: err?.message || String(err),
    });
  });

  worker.on("error", (err) => {
    logger.error("Telegram worker error", { error: err?.message || String(err) });
  });

  return worker;
};

export default {
  createTelegramWorker,
};
