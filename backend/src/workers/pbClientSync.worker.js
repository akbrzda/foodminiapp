import { Worker } from "bullmq";
import { logger } from "../utils/logger.js";
import { processPremiumBonusClientSync } from "../modules/integrations/services/syncProcessors.js";

export function createPbClientSyncWorker(connection) {
  const worker = new Worker(
    "sync-premiumbonus-clients",
    async (job) => {
      const { userId } = job.data || {};
      if (!userId) {
        throw new Error("userId обязателен для sync-premiumbonus-clients");
      }

      await processPremiumBonusClientSync(userId, "queue");
      return { ok: true };
    },
    { connection, concurrency: 3 },
  );

  worker.on("failed", (job, err) => {
    logger.error("Ошибка worker sync-premiumbonus-clients", { jobId: job?.id, error: err.message });
  });

  return worker;
}

export default {
  createPbClientSyncWorker,
};
