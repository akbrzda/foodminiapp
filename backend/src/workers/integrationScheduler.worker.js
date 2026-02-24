import { enqueueIikoMenuSync, enqueueIikoStopListSync } from "../queues/config.js";
import { getIntegrationSettings } from "../modules/integrations/services/integrationConfigService.js";
import { logger } from "../utils/logger.js";

const MENU_INTERVAL_MS = 30 * 60 * 1000;
const STOPLIST_INTERVAL_MS = 5 * 60 * 1000;

export function createIntegrationSchedulerWorker() {
  let menuInterval = null;
  let stopListInterval = null;

  const syncMenuTick = async () => {
    try {
      const settings = await getIntegrationSettings();
      const menuMode = String(settings?.integrationMode?.menu || "local")
        .trim()
        .toLowerCase();
      if (!settings.iikoEnabled || menuMode !== "external") return;
      await enqueueIikoMenuSync({ reason: "scheduled" });
    } catch (error) {
      logger.error("Ошибка планировщика sync-iiko-menu", { error: error.message });
    }
  };

  const syncStopListTick = async () => {
    try {
      const settings = await getIntegrationSettings();
      const menuMode = String(settings?.integrationMode?.menu || "local")
        .trim()
        .toLowerCase();
      if (!settings.iikoEnabled || menuMode !== "external") return;
      await enqueueIikoStopListSync({ reason: "scheduled" });
    } catch (error) {
      logger.error("Ошибка планировщика sync-iiko-stoplist", { error: error.message });
    }
  };

  return {
    start() {
      if (!menuInterval) {
        menuInterval = setInterval(syncMenuTick, MENU_INTERVAL_MS);
      }
      if (!stopListInterval) {
        stopListInterval = setInterval(syncStopListTick, STOPLIST_INTERVAL_MS);
      }
    },
    stop() {
      if (menuInterval) {
        clearInterval(menuInterval);
        menuInterval = null;
      }
      if (stopListInterval) {
        clearInterval(stopListInterval);
        stopListInterval = null;
      }
    },
  };
}

export default {
  createIntegrationSchedulerWorker,
};
