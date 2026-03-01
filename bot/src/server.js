import express from "express";
import { logger } from "./utils/logger.js";
import { answerCallbackQuery, sendPhotoMessage, sendTextMessage, sendVideoMessage } from "./services/telegramApi.js";
import { sendTelegramStartMessage } from "./services/startMessageService.js";

const parseBotServiceToken = () => String(process.env.BOT_SERVICE_TOKEN || "").trim();

const requireInternalToken = (req, res, next) => {
  const expected = parseBotServiceToken();
  if (!expected) {
    return res.status(500).json({ success: false, error: "BOT_SERVICE_TOKEN не задан" });
  }
  const received = String(req.headers["x-bot-service-token"] || "").trim();
  if (!received || received !== expected) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  return next();
};

const parseMessageThreadId = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const createBotApiServer = ({ commandBot }) => {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.json({
      success: true,
      service: "foodminiapp-bot-service",
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/webhook/telegram", async (req, res) => {
    try {
      if (!commandBot || commandBot.mode !== "webhook") {
        return res.status(404).json({ success: false, error: "Webhook mode disabled" });
      }

      const expectedSecret = String(commandBot.webhookSecret || "").trim();
      if (expectedSecret) {
        const receivedSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
        if (!receivedSecret || receivedSecret !== expectedSecret) {
          return res.status(401).json({ success: false, error: "Invalid webhook secret" });
        }
      }

      const update = req.body;
      if (update && typeof update === "object") {
        await commandBot.processUpdate(update);
      }
      return res.json({ ok: true });
    } catch (error) {
      logger.error("Ошибка обработки Telegram webhook", { error: error?.message || String(error) });
      return res.json({ ok: true });
    }
  });

  app.post("/internal/telegram/start-message", requireInternalToken, async (req, res) => {
    try {
      const telegramId = Number(req.body?.telegram_id);
      if (!Number.isFinite(telegramId) || telegramId <= 0) {
        return res.status(400).json({ success: false, error: "Укажите корректный telegram_id" });
      }

      const settings = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : null;
      await sendTelegramStartMessage(telegramId, settings);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Ошибка отправки start-сообщения", { error: error?.message || String(error) });
      return res.status(500).json({ success: false, error: "Не удалось отправить сообщение" });
    }
  });

  app.post("/internal/telegram/notification", requireInternalToken, async (req, res) => {
    try {
      const telegramId = Number(req.body?.telegram_id);
      const message = String(req.body?.message || "").trim();
      if (!Number.isFinite(telegramId) || telegramId <= 0) {
        return res.status(400).json({ success: false, error: "Укажите корректный telegram_id" });
      }
      if (!message) {
        return res.status(400).json({ success: false, error: "Укажите текст сообщения" });
      }

      const replyMarkup = req.body?.reply_markup && typeof req.body.reply_markup === "object" ? req.body.reply_markup : null;
      const messageThreadId = parseMessageThreadId(req.body?.message_thread_id);
      const result = await sendTextMessage({
        chatId: telegramId,
        text: message,
        parseMode: "HTML",
        replyMarkup,
        messageThreadId,
      });

      return res.json({ success: true, data: { message_id: result?.message_id || null } });
    } catch (error) {
      logger.error("Ошибка отправки notification", { error: error?.message || String(error) });
      return res.status(500).json({ success: false, error: "Не удалось отправить сообщение" });
    }
  });

  app.post("/internal/telegram/broadcast", requireInternalToken, async (req, res) => {
    try {
      const telegramId = Number(req.body?.telegram_id);
      const text = String(req.body?.text || "");
      const imageUrl = String(req.body?.image_url || "").trim();
      const videoUrl = String(req.body?.video_url || "").trim();
      const parseMode = req.body?.parse_mode === null ? null : String(req.body?.parse_mode || "Markdown");
      const replyMarkup = req.body?.reply_markup && typeof req.body.reply_markup === "object" ? req.body.reply_markup : null;
      const messageThreadId = parseMessageThreadId(req.body?.message_thread_id);

      if (!Number.isFinite(telegramId) || telegramId <= 0) {
        return res.status(400).json({ success: false, error: "Укажите корректный telegram_id" });
      }

      let result;
      if (imageUrl) {
        result = await sendPhotoMessage({
          chatId: telegramId,
          photo: imageUrl,
          caption: text,
          parseMode,
          replyMarkup,
          messageThreadId,
        });
      } else if (videoUrl) {
        result = await sendVideoMessage({
          chatId: telegramId,
          video: videoUrl,
          caption: text,
          parseMode,
          replyMarkup,
          messageThreadId,
        });
      } else {
        result = await sendTextMessage({
          chatId: telegramId,
          text,
          parseMode,
          replyMarkup,
          messageThreadId,
        });
      }

      return res.json({ success: true, data: { message_id: result?.message_id || null } });
    } catch (error) {
      logger.error("Ошибка отправки broadcast", { error: error?.message || String(error) });
      return res.status(500).json({ success: false, error: "Не удалось отправить broadcast" });
    }
  });

  app.post("/internal/telegram/answer-callback", requireInternalToken, async (req, res) => {
    try {
      const callbackQueryId = String(req.body?.callback_query_id || "").trim();
      if (!callbackQueryId) {
        return res.status(400).json({ success: false, error: "Укажите callback_query_id" });
      }
      await answerCallbackQuery({
        callbackQueryId,
        text: String(req.body?.text || "Спасибо!"),
        showAlert: req.body?.show_alert === true,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error("Ошибка answerCallbackQuery", { error: error?.message || String(error) });
      return res.status(500).json({ success: false, error: "Не удалось обработать callback" });
    }
  });

  app.use((error, req, res, next) => {
    logger.error("Unhandled bot-service error", { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
};

export default {
  createBotApiServer,
};
