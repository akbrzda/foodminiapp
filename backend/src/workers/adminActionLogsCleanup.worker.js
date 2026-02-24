import db from "../config/database.js";
import { logger } from "../utils/logger.js";

const CLEANUP_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 14;

async function cleanupAdminActionLogs() {
  try {
    const [result] = await db.query("DELETE FROM admin_action_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [RETENTION_DAYS]);

    logger.system.info("Очистка admin_action_logs завершена", {
      retentionDays: RETENTION_DAYS,
      deletedRows: result.affectedRows || 0,
    });
  } catch (error) {
    logger.system.warn("Ошибка очистки admin_action_logs", {
      error: error.message,
      retentionDays: RETENTION_DAYS,
    });
  }
}

export function createAdminActionLogsCleanupWorker() {
  let intervalId = null;

  return {
    start() {
      if (intervalId) return;

      cleanupAdminActionLogs();
      intervalId = setInterval(cleanupAdminActionLogs, CLEANUP_INTERVAL_MS);
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}

export default {
  createAdminActionLogsCleanupWorker,
};
