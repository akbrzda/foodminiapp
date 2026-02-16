import { Worker } from "bullmq";
import { logger } from "../utils/logger.js";
import { processPremiumBonusPurchaseSync } from "../modules/integrations/services/syncProcessors.js";

export function createPbPurchaseSyncWorker(connection) {
  const worker = new Worker(
    "sync-premiumbonus-purchases",
    async (job) => {
      const { orderId, action = "create" } = job.data || {};
      if (!orderId) {
        throw new Error("orderId обязателен для sync-premiumbonus-purchases");
      }

      await processPremiumBonusPurchaseSync(orderId, action, "queue");
      return { ok: true };
    },
    { connection, concurrency: 3 },
  );

  worker.on("failed", (job, err) => {
    logger.error("Ошибка worker sync-premiumbonus-purchases", { jobId: job?.id, error: err.message });
  });

  return worker;
}

export default {
  createPbPurchaseSyncWorker,
};
