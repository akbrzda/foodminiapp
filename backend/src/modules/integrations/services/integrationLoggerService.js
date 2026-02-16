import { createSyncLog } from "../repositories/syncLogRepository.js";
import { logger } from "../../../utils/logger.js";

export async function logIntegrationEvent(payload) {
  try {
    await createSyncLog(payload);
  } catch (error) {
    logger.error("Не удалось записать integration_sync_logs", { error: error.message, payload });
  }
}
