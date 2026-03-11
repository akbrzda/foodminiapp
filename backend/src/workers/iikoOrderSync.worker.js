import { UnrecoverableError, Worker } from "bullmq";
import { logger } from "../utils/logger.js";
import { processIikoOrderSync } from "../modules/integrations/services/syncProcessors.js";
import { BULLMQ_WORKER_OPTIONS } from "./bullmqWorkerOptions.js";

const isBlockedApiLoginError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("apilogin has been blocked");
};

export function createIikoOrderSyncWorker(connection) {
  const worker = new Worker(
    "sync-iiko-orders",
    async (job) => {
      const { orderId } = job.data || {};
      if (!orderId) {
        throw new Error("orderId обязателен для sync-iiko-orders");
      }
      try {
        await processIikoOrderSync(orderId, "queue");
      } catch (error) {
        if (isBlockedApiLoginError(error)) {
          throw new UnrecoverableError("ApiLogin iiko заблокирован. Повтор недоступен до разблокировки ключа.");
        }
        throw error;
      }
      return { ok: true };
    },
    { connection, concurrency: 3, ...BULLMQ_WORKER_OPTIONS },
  );

  worker.on("failed", (job, err) => {
    logger.error("Ошибка worker sync-iiko-orders", { jobId: job?.id, error: err.message });
  });

  return worker;
}

export default {
  createIikoOrderSyncWorker,
};
