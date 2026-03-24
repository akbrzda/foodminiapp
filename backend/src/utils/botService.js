import axios from "axios";

const BOT_SERVICE_URL = String(process.env.BOT_SERVICE_URL || "http://localhost:3002")
  .trim()
  .replace(/\/+$/, "");
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
  const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${String(path || "")}`;
  const url = `${BOT_SERVICE_URL}${normalizedPath}`;
  let response;
  try {
    response = await axios.post(url, payload, {
      headers: getHeaders(),
      timeout: 15000,
    });
  } catch (error) {
    const status = error?.response?.status || "unknown";
    const responseBody = error?.response?.data ? JSON.stringify(error.response.data) : "";
    throw new Error(`Bot service request failed: ${status} ${url}${responseBody ? ` ${responseBody}` : ""}`);
  }

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

export const sendMaxNotificationMessageViaBot = async ({ maxId, message, replyMarkup = null }) => {
  return post("/internal/max/notification", {
    max_id: maxId,
    message,
    reply_markup: replyMarkup,
  });
};

export const sendMaxBroadcastMessageViaBot = async ({ maxId, text, imageUrl = null, videoUrl = null, parseMode = "markdown", replyMarkup = null }) => {
  return post("/internal/max/broadcast", {
    max_id: maxId,
    text,
    image_url: imageUrl,
    video_url: videoUrl,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
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
  sendMaxNotificationMessageViaBot,
  sendMaxBroadcastMessageViaBot,
  answerCallbackQueryViaBot,
};
