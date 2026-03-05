import { retryFailedSyncs } from "../modules/integrations/services/syncProcessors.js";
import { getIntegrationSettings } from "../modules/integrations/services/integrationConfigService.js";
import { logger } from "../utils/logger.js";

const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export function createIntegrationRetryWorker() {
  let interval = null;

  return {
    start() {
      if (interval) return;
      interval = setInterval(async () => {
        try {
          const settings = await getIntegrationSettings();
          if (!settings.iikoEnabled || !settings.iikoAutoSyncEnabled) return;
          await retryFailedSyncs();
        } catch (error) {
          logger.error("Ошибка планировщика retry интеграций", { error: error.message });
        }
      }, RETRY_INTERVAL_MS);
    },
    stop() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    },
  };
}

export default {
  createIntegrationRetryWorker,
};
