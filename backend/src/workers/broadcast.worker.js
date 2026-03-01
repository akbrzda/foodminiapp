import db from "../config/database.js";
import { logger } from "../utils/logger.js";
import { deleteQueueItem, updateQueueSchedule } from "../modules/broadcasts/models/broadcastQueue.js";
import { updateMessageStatus } from "../modules/broadcasts/models/broadcastMessages.js";
import { incrementCampaignStat } from "../modules/broadcasts/models/broadcastStats.js";
import { checkCampaignCompletion } from "../modules/broadcasts/services/broadcastService.js";
import { sendBroadcastMessageViaBot } from "../utils/botService.js";

const WORKER_ENABLED = String(process.env.BROADCAST_WORKER_ENABLED || "true").toLowerCase() !== "false";
const BATCH_SIZE = Number(process.env.BROADCAST_WORKER_BATCH_SIZE || 50);
const INTERVAL_MS = Number(process.env.BROADCAST_WORKER_INTERVAL_MS || 2000);
const RATE_LIMIT = Number(process.env.BROADCAST_RATE_LIMIT || 28);
const RETRY_MAX = Number(process.env.BROADCAST_RETRY_MAX || 3);
const RETRY_DELAYS = String(process.env.BROADCAST_RETRY_DELAYS || "5,15,60")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const LOCK_TIMEOUT_MINUTES = 10;
const STATS_EMIT_EVERY = Number(process.env.BROADCAST_WS_STATS_EVERY || 100);
const STATS_EMIT_FAIL_EVERY = Number(process.env.BROADCAST_WS_STATS_FAIL_EVERY || 25);
const DB_TIMEOUT_BACKOFF_BASE_MS = Number(process.env.BROADCAST_DB_TIMEOUT_BACKOFF_BASE_MS || 5000);
const DB_TIMEOUT_BACKOFF_MAX_MS = Number(process.env.BROADCAST_DB_TIMEOUT_BACKOFF_MAX_MS || 120000);

const statsEmitState = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isSchemaUnavailableError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("unknown database") ||
    ((message.includes("broadcast_queue") || message.includes("broadcast_messages")) &&
      (message.includes("doesn't exist") || message.includes("does not exist") || message.includes("unknown table")))
  );
};

const isTemporaryDbConnectionError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const errno = String(error?.errno || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    errno === "ETIMEDOUT" ||
    message.includes("connect etimedout") ||
    message.includes("read etimedout") ||
    message.includes("connection lost") ||
    message.includes("too many connections")
  );
};

const buildInlineKeyboard = (buttons, campaignId, messageId) => {
  if (!Array.isArray(buttons) || !buttons.length) return null;
  const rows = [];
  const perRow = 2;
  for (let i = 0; i < buttons.length; i += perRow) {
    const rowButtons = buttons.slice(i, i + perRow).map((button, index) => {
      const type = (button?.type || "url").toLowerCase();
      const text = button?.text || button?.label || "Перейти";
      if (type === "callback" || type === "callback_query") {
        return {
          text,
          callback_data: `broadcast:${campaignId}:${messageId}:${i + index}`,
        };
      }
      return {
        text,
        url: button?.url || "",
      };
    });
    rows.push(rowButtons);
  }
  return { inline_keyboard: rows };
};

const sendBroadcastMessage = async ({ telegramId, text, imageUrl, buttons, campaignId, messageId }) => {
  const keyboard = buildInlineKeyboard(buttons, campaignId, messageId);
  const response = await sendBroadcastMessageViaBot({
    telegramId,
    text,
    imageUrl: imageUrl || null,
    parseMode: "Markdown",
    replyMarkup: keyboard || undefined,
  });
  return { message_id: response?.data?.message_id || null };
};

const fetchQueueBatch = async (workerId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, message_id
       FROM broadcast_queue
       WHERE scheduled_at <= NOW()
         AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))
       ORDER BY priority DESC, scheduled_at ASC
       LIMIT ?
       FOR UPDATE`,
      [LOCK_TIMEOUT_MINUTES, BATCH_SIZE],
    );
    if (!rows.length) {
      await connection.commit();
      return [];
    }
    const ids = rows.map((row) => row.id);
    await connection.query("UPDATE broadcast_queue SET locked_at = NOW(), locked_by = ? WHERE id IN (?)", [workerId, ids]);
    await connection.commit();
    return rows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const loadMessagePayload = async (queueId) => {
  const [rows] = await db.query(
    `SELECT q.id as queue_id,
            m.id as message_id,
            m.retry_count,
            m.personalized_text,
            m.status as message_status,
            c.id as campaign_id,
            c.content_image_url,
            c.content_buttons,
            u.telegram_id
     FROM broadcast_queue q
     JOIN broadcast_messages m ON m.id = q.message_id
     JOIN broadcast_campaigns c ON c.id = m.campaign_id
     JOIN users u ON u.id = m.user_id
     WHERE q.id = ?`,
    [queueId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    queue_id: row.queue_id,
    message_id: row.message_id,
    retry_count: Number(row.retry_count || 0),
    text: row.personalized_text,
    message_status: row.message_status,
    campaign_id: row.campaign_id,
    image_url: row.content_image_url,
    buttons: row.content_buttons && typeof row.content_buttons === "string" ? JSON.parse(row.content_buttons) : row.content_buttons,
    telegram_id: row.telegram_id,
  };
};

const emitCampaignStatsUpdate = async (campaignId) => {
  try {
    const [{ wsServer }, { getCampaignStats }] = await Promise.all([
      import("../index.js"),
      import("../modules/broadcasts/services/statisticsService.js"),
    ]);
    const stats = await getCampaignStats(campaignId);
    wsServer.notifyBroadcastStatsUpdate(campaignId, stats);
  } catch (error) {
    logger.system.dbError(`Broadcast WS stats error: ${error.message}`);
  }
};

const maybeEmitStatsUpdate = async (campaignId, { sent = 0, failed = 0 } = {}) => {
  const state = statsEmitState.get(campaignId) || { sent: 0, failed: 0 };
  state.sent += sent;
  state.failed += failed;
  const shouldEmit =
    (STATS_EMIT_EVERY > 0 && state.sent >= STATS_EMIT_EVERY) ||
    (STATS_EMIT_FAIL_EVERY > 0 && state.failed >= STATS_EMIT_FAIL_EVERY);
  statsEmitState.set(campaignId, state);
  if (!shouldEmit) return;
  state.sent = 0;
  state.failed = 0;
  await emitCampaignStatsUpdate(campaignId);
};

const handleFailedMessage = async (payload, error) => {
  const nextRetry = payload.retry_count + 1;
  const errorMessage = String(error?.message || "Ошибка отправки").slice(0, 500);
  if (nextRetry <= RETRY_MAX) {
    const delaySeconds = RETRY_DELAYS[payload.retry_count] || RETRY_DELAYS[RETRY_DELAYS.length - 1] || 60;
    const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
    await updateMessageStatus(payload.message_id, "pending", {
      error_message: errorMessage,
      retry_count: nextRetry,
    });
    await updateQueueSchedule(payload.queue_id, scheduledAt);
    return;
  }
  await updateMessageStatus(payload.message_id, "failed", {
    error_message: errorMessage,
    retry_count: nextRetry,
  });
  await deleteQueueItem(payload.queue_id);
  await incrementCampaignStat(payload.campaign_id, "failed_count", 1).catch(() => null);
  await maybeEmitStatsUpdate(payload.campaign_id, { failed: 1 });
  await checkCampaignCompletion(payload.campaign_id).catch(() => null);
};

const processQueueItem = async (queueItem) => {
  const payload = await loadMessagePayload(queueItem.id);
  if (!payload) {
    await deleteQueueItem(queueItem.id);
    return;
  }
  if (!payload.telegram_id) {
    await handleFailedMessage(payload, new Error("Telegram ID отсутствует"));
    return;
  }
  if (payload.message_status === "sent") {
    await deleteQueueItem(payload.queue_id);
    return;
  }
  await updateMessageStatus(payload.message_id, "sending");
  try {
    const result = await sendBroadcastMessage({
      telegramId: payload.telegram_id,
      text: payload.text,
      imageUrl: payload.image_url,
      buttons: payload.buttons,
      campaignId: payload.campaign_id,
      messageId: payload.message_id,
    });
    await updateMessageStatus(payload.message_id, "sent", {
      telegram_message_id: result?.message_id || null,
      sent_at: new Date(),
      error_message: null,
    });
    await deleteQueueItem(payload.queue_id);
    await incrementCampaignStat(payload.campaign_id, "sent_count", 1).catch(() => null);
    await maybeEmitStatsUpdate(payload.campaign_id, { sent: 1 });
    await checkCampaignCompletion(payload.campaign_id).catch(() => null);
  } catch (error) {
    await handleFailedMessage(payload, error);
  }
};

export function createBroadcastWorker() {
  let intervalId = null;
  let stoppedBySchemaError = false;
  const workerId = `broadcast-${process.pid}-${Date.now()}`;
  let pauseUntil = 0;
  let timeoutErrorsInRow = 0;

  const run = async () => {
    if (!WORKER_ENABLED || stoppedBySchemaError) return;
    if (Date.now() < pauseUntil) return;
    try {
      const batch = await fetchQueueBatch(workerId);
      timeoutErrorsInRow = 0;
      if (!batch.length) return;
      const delayMs = RATE_LIMIT > 0 ? Math.ceil(1000 / RATE_LIMIT) : 0;
      for (const item of batch) {
        await processQueueItem(item);
        if (delayMs) {
          await sleep(delayMs);
        }
      }
    } catch (error) {
      if (isSchemaUnavailableError(error)) {
        stoppedBySchemaError = true;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        logger.system.warn("Broadcast worker disabled: schema is not ready", { error: error.message });
        return;
      }
      if (isTemporaryDbConnectionError(error)) {
        timeoutErrorsInRow += 1;
        const backoffMs = Math.min(DB_TIMEOUT_BACKOFF_BASE_MS * 2 ** (timeoutErrorsInRow - 1), DB_TIMEOUT_BACKOFF_MAX_MS);
        pauseUntil = Date.now() + backoffMs;
        logger.system.warn("Broadcast worker paused due to temporary DB connectivity issue", {
          error: error.message,
          code: error?.code || null,
          pauseMs: backoffMs,
          retryAt: new Date(pauseUntil).toISOString(),
          timeoutErrorsInRow,
        });
        return;
      }
      timeoutErrorsInRow = 0;
      pauseUntil = 0;
      logger.system.dbError(`BroadcastWorker error: ${error.message}`);
    }
  };

  return {
    start() {
      if (intervalId || stoppedBySchemaError) return;
      intervalId = setInterval(run, INTERVAL_MS);
      run();
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}

export default {
  createBroadcastWorker,
};
