import { enqueueIikoMenuSync } from "../queues/config.js";
import { getIntegrationSettings } from "../modules/integrations/services/integrationConfigService.js";
import { logger } from "../utils/logger.js";

const MENU_INTERVAL_MS = 60 * 60 * 1000;

export function createIntegrationSchedulerWorker() {
  let menuInterval = null;

  const syncMenuTick = async () => {
    try {
      const settings = await getIntegrationSettings();
      const menuMode = String(settings?.integrationMode?.menu || "local")
        .trim()
        .toLowerCase();
      if (!settings.iikoEnabled || !settings.iikoAutoSyncEnabled || menuMode !== "external") return;
      await enqueueIikoMenuSync({ reason: "scheduled" });
    } catch (error) {
      logger.error("Ошибка планировщика sync-iiko-menu", { error: error.message });
    }
  };

  return {
    start() {
      if (!menuInterval) {
        menuInterval = setInterval(syncMenuTick, MENU_INTERVAL_MS);
      }
    },
    stop() {
      if (menuInterval) {
        clearInterval(menuInterval);
        menuInterval = null;
      }
    },
  };
}

export default {
  createIntegrationSchedulerWorker,
};
