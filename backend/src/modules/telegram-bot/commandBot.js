import { logger } from "../../utils/logger.js";

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 2000;

export const createTelegramCommandBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const miniAppUrl = String(process.env.TELEGRAM_MINIAPP_URL || process.env.MINIAPP_URL || "")
    .trim()
    .replace(/\/$/, "");
  const enabled = (process.env.TELEGRAM_COMMAND_BOT_ENABLED || "true").toLowerCase() !== "false";

  let running = false;
  let offset = 0;
  let abortController = null;
  let loopPromise = null;
  let botName = "";

  const apiRequest = async (method, payload = {}, { signal } = {}) => {
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const result = await response.json();
    if (!result?.ok) {
      const description = result?.description || "Telegram API error";
      throw new Error(description);
    }
    return result.result;
  };

  const buildInlineButton = () => {
    if (!miniAppUrl) return null;
    return {
      inline_keyboard: [
        [
          {
            text: "Открыть приложение",
            web_app: { url: miniAppUrl },
          },
        ],
      ],
    };
  };

  const sendText = async (chatId, text) => {
    const replyMarkup = buildInlineButton();
    await apiRequest("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  };

  const normalizeCommand = (text) => {
    if (!text || !text.startsWith("/")) return "";
    const [raw] = text.trim().split(/\s+/);
    const [cmd, mention] = raw.split("@");
    if (mention && botName && mention.toLowerCase() !== botName.toLowerCase()) {
      return "";
    }
    return cmd.toLowerCase();
  };

  const handleCommand = async (message) => {
    const chatId = message?.chat?.id;
    if (!chatId) return;

    const command = normalizeCommand(message?.text || "");
    if (!command) return;
    if (command !== "/start") return;

    const greeting = miniAppUrl
      ? [
          "Привет! Добро пожаловать в Панда Пиццу.",
          "Здесь можно быстро оформить заказ и отследить статус. Получать рассылки с акциями и новинками.",
          "",
        ].join("\n")
      : [
          "Привет! Добро пожаловать в Панда Пиццу.",
          "Я на связи и готов помочь с запуском приложения.",
          "Ссылка на Mini App пока не настроена. Напишите администратору сервиса.",
        ].join("\n");
    await sendText(chatId, greeting);
  };

  const handleUpdate = async (update) => {
    if (update?.message?.text) {
      await handleCommand(update.message);
    }
  };

  const pollingLoop = async () => {
    while (running) {
      abortController = new AbortController();
      try {
        const updates = await apiRequest(
          "getUpdates",
          {
            offset,
            timeout: POLL_TIMEOUT_SECONDS,
            allowed_updates: ["message"],
          },
          { signal: abortController.signal },
        );

        for (const update of updates) {
          offset = Math.max(offset, Number(update.update_id) + 1);
          try {
            await handleUpdate(update);
          } catch (handlerError) {
            logger.system.warn("Ошибка обработки update Telegram command bot", {
              error: handlerError?.message || String(handlerError),
              updateId: update?.update_id || null,
            });
          }
        }
      } catch (error) {
        if (!running) break;
        if (error?.name === "AbortError") continue;
        logger.system.warn("Ошибка polling Telegram command bot", { error: error?.message || String(error) });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } finally {
        abortController = null;
      }
    }
  };

  const start = async () => {
    if (!enabled) {
      logger.system.info("Telegram command bot отключен (TELEGRAM_COMMAND_BOT_ENABLED=false)");
      return;
    }
    if (!token) {
      logger.system.warn("Telegram command bot не запущен: TELEGRAM_BOT_TOKEN отсутствует");
      return;
    }
    if (running) return;

    const me = await apiRequest("getMe");
    botName = me?.username || "";
    // Для режима polling webhook должен быть отключен.
    await apiRequest("deleteWebhook", { drop_pending_updates: false });
    running = true;
    loopPromise = pollingLoop();
    logger.system.info("Telegram command bot запущен", { botName });
  };

  const stop = async () => {
    if (!running) return;
    running = false;
    if (abortController) {
      abortController.abort();
    }
    if (loopPromise) {
      await loopPromise;
      loopPromise = null;
    }
    logger.system.info("Telegram command bot остановлен");
  };

  return {
    start,
    stop,
  };
};

export default {
  createTelegramCommandBot,
};
