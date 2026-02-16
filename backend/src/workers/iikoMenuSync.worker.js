import { UnrecoverableError, Worker } from "bullmq";
import { logger } from "../utils/logger.js";
import { processIikoMenuSync } from "../modules/integrations/services/syncProcessors.js";

const isBlockedApiLoginError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("apilogin has been blocked");
};

export function createIikoMenuSyncWorker(connection) {
  const worker = new Worker(
    "sync-iiko-menu",
    async (job) => {
      const { reason = "queue", cityId = null } = job.data || {};
      try {
        await processIikoMenuSync(reason, cityId);
      } catch (error) {
        if (isBlockedApiLoginError(error)) {
          throw new UnrecoverableError("ApiLogin iiko заблокирован. Повтор недоступен до разблокировки ключа.");
        }
        throw error;
      }
      return { ok: true };
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error("Ошибка worker sync-iiko-menu", { jobId: job?.id, error: err.message });
  });

  return worker;
}

export default {
  createIikoMenuSyncWorker,
};
