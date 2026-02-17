import { createSyncLog, updateSyncLog } from "../repositories/syncLogRepository.js";
import { logger } from "../../../utils/logger.js";

export async function logIntegrationEvent(payload) {
  try {
    await createSyncLog(payload);
  } catch (error) {
    logger.error("Не удалось записать integration_sync_logs", { error: error.message, payload });
  }
}

export async function startIntegrationEvent(payload) {
  try {
    return await createSyncLog({
      ...payload,
      status: "active",
    });
  } catch (error) {
    logger.error("Не удалось создать active-запись integration_sync_logs", { error: error.message, payload });
    return null;
  }
}

export async function finishIntegrationEvent(logId, patch) {
  try {
    await updateSyncLog(logId, patch);
  } catch (error) {
    logger.error("Не удалось обновить запись integration_sync_logs", { error: error.message, logId, patch });
  }
}
