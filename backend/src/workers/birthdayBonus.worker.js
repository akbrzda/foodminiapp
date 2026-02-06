import { issueBirthdayBonuses } from "../modules/loyalty/services/loyaltyService.js";
import { logSystem } from "../utils/logger.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RUN_HOUR = 2;
const RUN_WINDOW_MINUTES = 10;
let lastRunDate = null;

const shouldRunNow = () => {
  const now = new Date();
  if (now.getHours() !== RUN_HOUR || now.getMinutes() >= RUN_WINDOW_MINUTES) return null;
  const dateKey = now.toISOString().slice(0, 10);
  if (lastRunDate === dateKey) return null;
  lastRunDate = dateKey;
  return now;
};

async function issueBirthdayBonusesJob() {
  await issueBirthdayBonuses();
}

export function createBirthdayBonusWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(async () => {
        const shouldRun = shouldRunNow();
        if (!shouldRun) return;
        try {
          await issueBirthdayBonusesJob();
        } catch (error) {
          logSystem("error", "bonus", "Ошибка начисления бонусов ко дню рождения", { error: error.message });
        }
      }, CHECK_INTERVAL_MS);
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}

export default {
  createBirthdayBonusWorker,
};
