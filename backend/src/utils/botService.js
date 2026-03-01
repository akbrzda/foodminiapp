import axios from "axios";

const BOT_SERVICE_URL = String(process.env.BOT_SERVICE_URL || "http://localhost:3001").replace(/\/$/, "");
const BOT_SERVICE_TOKEN = String(process.env.BOT_SERVICE_TOKEN || "").trim();

const getHeaders = () => {
  if (!BOT_SERVICE_TOKEN) {
    throw new Error("BOT_SERVICE_TOKEN не задан");
  }
  return {
    "x-bot-service-token": BOT_SERVICE_TOKEN,
  };
};

const post = async (path, payload) => {
  const response = await axios.post(`${BOT_SERVICE_URL}${path}`, payload, {
    headers: getHeaders(),
    timeout: 15000,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.error || `Bot service error: ${path}`);
  }

  return response.data;
};

export const sendStartMessage = async ({ telegramId, settings = null }) => {
  return post("/internal/telegram/start-message", {
    telegram_id: telegramId,
    settings,
  });
};

export const sendNotificationMessage = async ({ telegramId, message, replyMarkup = null, messageThreadId = null }) => {
  return post("/internal/telegram/notification", {
    telegram_id: telegramId,
    message,
    reply_markup: replyMarkup,
    message_thread_id: messageThreadId,
  });
};

export const sendBroadcastMessageViaBot = async ({ telegramId, text, imageUrl = null, videoUrl = null, parseMode = "Markdown", replyMarkup = null, messageThreadId = null }) => {
  return post("/internal/telegram/broadcast", {
    telegram_id: telegramId,
    text,
    image_url: imageUrl,
    video_url: videoUrl,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
    message_thread_id: messageThreadId,
  });
};

export const answerCallbackQueryViaBot = async ({ callbackQueryId, text = "Спасибо!", showAlert = false }) => {
  return post("/internal/telegram/answer-callback", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
};

export default {
  sendStartMessage,
  sendNotificationMessage,
  sendBroadcastMessageViaBot,
  answerCallbackQueryViaBot,
};
