import { logger } from "../../utils/logger.js";
import { sendTelegramStartMessage } from "../../services/startMessageService.js";
import { answerCallbackQuery, requestTelegram } from "../../services/telegramApi.js";
import { handleCheckSubscriptionCallback, handleStartWithSubscriptionTag, upsertBotUser } from "../../services/subscriptionCampaignService.js";
import { POLL_TIMEOUT_SECONDS, RETRY_DELAY_MS, TELEGRAM_WEBHOOK_UPDATES } from "./command-bot.constants.js";
import { createCommandBotHandlers } from "./command-bot.handlers.js";
import { normalizeMode } from "./command-bot.utils.js";

export const createTelegramCommandBot = () => {
  const enabled = (process.env.TELEGRAM_COMMAND_BOT_ENABLED || "true").toLowerCase() !== "false";
  const backendUrl = String(process.env.BACKEND_URL || "http://localhost:3000").replace(/\/$/, "");
  const botServiceToken = String(process.env.BOT_SERVICE_TOKEN || "").trim();
  const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const mode = normalizeMode(process.env.TELEGRAM_BOT_MODE || (isProduction ? "webhook" : "polling"));
  const webhookUrl = String(process.env.TELEGRAM_WEBHOOK_URL || "").trim();
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();

  let running = false;
  let offset = 0;
  let abortController = null;
  let loopPromise = null;
  let botName = "";

  const handlers = createCommandBotHandlers({
    backendUrl,
    botServiceToken,
    answerCallbackQuery,
    sendTelegramStartMessage,
    handleCheckSubscriptionCallback,
    handleStartWithSubscriptionTag,
    upsertBotUser,
  });

  const processUpdate = async (update) => {
    await handlers.processUpdate({ update, botName });
  };

  const pollingLoop = async () => {
    while (running) {
      abortController = new AbortController();
      try {
        const updates = await requestTelegram("getUpdates", {
          offset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: TELEGRAM_WEBHOOK_UPDATES,
        });

        for (const update of updates) {
          offset = Math.max(offset, Number(update.update_id) + 1);
          try {
            await processUpdate(update);
          } catch (handlerError) {
            logger.warn("Ошибка обработки update Telegram command bot", {
              error: handlerError?.message || String(handlerError),
              updateId: update?.update_id || null,
            });
          }
        }
      } catch (error) {
        if (!running) break;

        logger.warn("Ошибка polling Telegram command bot", {
          error: error?.message || String(error),
        });

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } finally {
        abortController = null;
      }
    }
  };

  const start = async () => {
    if (!enabled) {
      logger.info("Telegram command bot отключен (TELEGRAM_COMMAND_BOT_ENABLED=false)");
      return;
    }

    if (running) return;

    const me = await requestTelegram("getMe", {});
    botName = me?.username || "";

    if (mode === "webhook") {
      if (!webhookUrl) {
        throw new Error("TELEGRAM_WEBHOOK_URL обязателен в webhook-режиме");
      }

      await requestTelegram("setWebhook", {
        url: webhookUrl,
        allowed_updates: TELEGRAM_WEBHOOK_UPDATES,
        ...(webhookSecret ? { secret_token: webhookSecret } : {}),
      });

      running = true;
      logger.info("Telegram command bot запущен в webhook режиме", {
        botName,
        webhookUrl,
      });
      return;
    }

    await requestTelegram("deleteWebhook", { drop_pending_updates: false });
    running = true;
    loopPromise = pollingLoop();
    logger.info("Telegram command bot запущен в polling режиме", { botName });
  };

  const stop = async () => {
    if (!running) return;

    if (mode === "polling") {
      running = false;
      if (abortController) {
        abortController.abort();
      }
      if (loopPromise) {
        await loopPromise;
        loopPromise = null;
      }
    }

    running = false;
    logger.info("Telegram command bot остановлен");
  };

  return {
    start,
    stop,
    processUpdate,
    mode,
    webhookSecret,
  };
};

export default {
  createTelegramCommandBot,
};
