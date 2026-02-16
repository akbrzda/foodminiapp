import { logger } from "../utils/logger.js";
import { processIikoDeliveryZonesSync } from "../modules/integrations/services/syncProcessors.js";

const INTERVAL_MS = 30 * 60 * 1000;

export function createIikoDeliveryZonesWorker() {
  let interval = null;

  return {
    start() {
      if (interval) return;
      interval = setInterval(async () => {
        try {
          await processIikoDeliveryZonesSync();
        } catch (error) {
          logger.error("Ошибка sync зон доставки из iiko", { error: error.message });
        }
      }, INTERVAL_MS);
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}

export default {
  createIikoDeliveryZonesWorker,
};
