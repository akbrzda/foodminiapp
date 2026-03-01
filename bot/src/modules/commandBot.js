import axios from "axios";
import { logger } from "../utils/logger.js";
import { sendTelegramStartMessage } from "../services/startMessageService.js";
import { answerCallbackQuery, requestTelegram } from "../services/telegramApi.js";
import { handleCheckSubscriptionCallback, handleStartWithSubscriptionTag } from "../services/subscriptionCampaignService.js";

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 2000;
const TELEGRAM_WEBHOOK_UPDATES = ["message", "callback_query"];

const normalizeMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "webhook") return "webhook";
  return "polling";
};

export const createTelegramCommandBot = () => {
  const enabled = (process.env.TELEGRAM_COMMAND_BOT_ENABLED || "true").toLowerCase() !== "false";
  const backendUrl = String(process.env.BACKEND_URL || "http://localhost:3000").replace(/\/$/, "");
  const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const mode = normalizeMode(process.env.TELEGRAM_BOT_MODE || (isProduction ? "webhook" : "polling"));
  const webhookUrl = String(process.env.TELEGRAM_WEBHOOK_URL || "").trim();
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();

  let running = false;
  let offset = 0;
  let abortController = null;
  let loopPromise = null;
  let botName = "";

  const normalizeCommand = (text) => {
    if (!text || !text.startsWith("/")) return "";
    const [raw] = text.trim().split(/\s+/);
    const [cmd, mention] = raw.split("@");
    if (mention && botName && mention.toLowerCase() !== botName.toLowerCase()) {
      return "";
    }
    return cmd.toLowerCase();
  };

  const parseStartArgument = (text) => {
    const parts = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length < 2) return "";
    return String(parts[1] || "").trim();
  };

  const forwardBroadcastCallback = async (callbackQuery) => {
    try {
      await axios.post(`${backendUrl}/api/broadcasts/telegram/callback`, {
        callback_query: callbackQuery,
      });
    } catch (error) {
      logger.error("Не удалось проксировать callback в backend", {
        error: error?.response?.data || error?.message || String(error),
      });
      if (callbackQuery?.id) {
        await answerCallbackQuery({
          callbackQueryId: callbackQuery.id,
          text: "Ошибка обработки. Попробуйте позже",
          showAlert: false,
        }).catch(() => null);
      }
    }
  };

  const handleCommand = async (message) => {
    const chatId = message?.chat?.id;
    if (!chatId) return;

    const command = normalizeCommand(message?.text || "");
    if (!command) return;
    if (command !== "/start") return;

    const startArg = parseStartArgument(message?.text || "");
    if (startArg) {
      const result = await handleStartWithSubscriptionTag({
        chatId,
        telegramUser: message?.from,
        tag: startArg,
      });
      if (result?.handled) {
        return;
      }
    }

    await sendTelegramStartMessage(chatId, null);
  };

  const handleCallbackQuery = async (callbackQuery) => {
    if (!callbackQuery?.data || !callbackQuery?.from?.id) return;

    const data = String(callbackQuery.data);
    if (data.startsWith("check_sub:")) {
      const result = await handleCheckSubscriptionCallback({ callbackQuery });
      if (result?.handled) return;
    }
    if (data.startsWith("broadcast:")) {
      await forwardBroadcastCallback(callbackQuery);
      return;
    }

    if (callbackQuery?.id) {
      await answerCallbackQuery({
        callbackQueryId: callbackQuery.id,
        text: "Действие выполнено",
        showAlert: false,
      }).catch(() => null);
    }
  };

  const processUpdate = async (update) => {
    if (update?.message?.text) {
      await handleCommand(update.message);
    }
    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  };

  const pollingLoop = async () => {
    while (running) {
      abortController = new AbortController();
      try {
        const updates = await requestTelegram("getUpdates", {
          offset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message", "callback_query"],
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
