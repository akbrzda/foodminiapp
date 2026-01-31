import { logger } from "../utils/logger.js";
import { listActiveTriggers, shouldRunTriggerNow, selectTriggerUsers } from "../modules/broadcasts/services/triggerService.js";
import { enqueueUsersForCampaign } from "../modules/broadcasts/services/broadcastService.js";
import { insertTriggerLogs } from "../modules/broadcasts/models/broadcastTriggerLog.js";

const CHECK_INTERVAL_MS = 60 * 1000;
const RUN_WINDOW_MINUTES = 60;

const lastRunByCampaign = new Map();

const getDateKey = (date) => date.toISOString().slice(0, 10);

const shouldRunCampaignToday = (campaignId, dateKey) => {
  return lastRunByCampaign.get(campaignId) !== dateKey;
};

const markCampaignRun = (campaignId, dateKey) => {
  lastRunByCampaign.set(campaignId, dateKey);
};

const withinWindow = (trigger, now) => {
  if (!shouldRunTriggerNow(trigger, now)) return false;
  return true;
};

const buildRegistrationWindow = (hoursAfter) => {
  const end = new Date(Date.now() - hoursAfter * 60 * 60 * 1000);
  const start = new Date(end.getTime() - RUN_WINDOW_MINUTES * 60 * 1000);
  return { start, end };
};

const runTriggers = async () => {
  const now = new Date();
  const dateKey = getDateKey(now);
  try {
    const triggers = await listActiveTriggers();
    for (const trigger of triggers) {
      if (!withinWindow(trigger, now)) continue;
      if (!shouldRunCampaignToday(trigger.id, dateKey)) continue;
      const config = trigger.trigger_config || {};
      let windowStart = null;
      let windowEnd = null;
      if (trigger.trigger_type === "new_registration") {
        const hoursAfter = Number(config.hours_after || 0);
        if (!hoursAfter) continue;
        const window = buildRegistrationWindow(hoursAfter);
        windowStart = window.start;
        windowEnd = window.end;
      }
      const userRows = await selectTriggerUsers(trigger, windowStart, windowEnd);
      if (!userRows.length) {
        markCampaignRun(trigger.id, dateKey);
        continue;
      }
      const triggerDate = dateKey;
      const logEntries = userRows.map((row) => ({
        campaign_id: trigger.id,
        user_id: row.id,
        trigger_date: triggerDate,
      }));
      await insertTriggerLogs(logEntries);
      await enqueueUsersForCampaign(trigger.id, userRows, { triggerDate });
      markCampaignRun(trigger.id, dateKey);
    }
  } catch (error) {
    logger.system.dbError(`TriggerWorker error: ${error.message}`);
  }
};

export function createTriggerWorker() {
  let intervalId = null;
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(runTriggers, CHECK_INTERVAL_MS);
      runTriggers();
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}

export default {
  createTriggerWorker,
};
