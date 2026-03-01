import axios from "axios";

const getToken = () => {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN не задан");
  }
  return token;
};

export const requestTelegram = async (method, payload) => {
  const token = getToken();
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.data?.ok) {
      throw new Error(response.data?.description || "Ошибка Telegram API");
    }

    return response.data.result;
  } catch (error) {
    const status = error?.response?.status;
    const tgDescription = error?.response?.data?.description;
    const tgErrorCode = error?.response?.data?.error_code;
    const message = tgDescription || error?.message || "Ошибка Telegram API";
    const statusSuffix = status ? ` (status ${status})` : "";
    const codeSuffix = tgErrorCode ? ` [tg_code ${tgErrorCode}]` : "";
    throw new Error(`${method}: ${message}${statusSuffix}${codeSuffix}`);
  }
};

const isMarkdownParseError = (error) => String(error?.message || "").toLowerCase().includes("can't parse entities");

export const requestTelegramSafe = async (method, payload) => {
  try {
    return await requestTelegram(method, payload);
  } catch (error) {
    if (isMarkdownParseError(error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.parse_mode;
      return requestTelegram(method, fallbackPayload);
    }
    throw error;
  }
};

export const sendTextMessage = async ({ chatId, text, parseMode = "HTML", replyMarkup = null, messageThreadId = null }) => {
  const payload = {
    chat_id: chatId,
    text,
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (Number.isInteger(messageThreadId) && messageThreadId > 0) {
    payload.message_thread_id = messageThreadId;
  }
  return requestTelegramSafe("sendMessage", payload);
};

export const sendPhotoMessage = async ({ chatId, photo, caption = "", parseMode = "HTML", replyMarkup = null, messageThreadId = null }) => {
  const payload = {
    chat_id: chatId,
    photo,
    caption,
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (Number.isInteger(messageThreadId) && messageThreadId > 0) {
    payload.message_thread_id = messageThreadId;
  }
  return requestTelegramSafe("sendPhoto", payload);
};

export const sendVideoMessage = async ({ chatId, video, caption = "", parseMode = "HTML", replyMarkup = null, messageThreadId = null }) => {
  const payload = {
    chat_id: chatId,
    video,
    caption,
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (Number.isInteger(messageThreadId) && messageThreadId > 0) {
    payload.message_thread_id = messageThreadId;
  }
  return requestTelegramSafe("sendVideo", payload);
};

export const answerCallbackQuery = async ({ callbackQueryId, text = "Спасибо!", showAlert = false }) => {
  return requestTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
};

export default {
  requestTelegram,
  requestTelegramSafe,
  sendTextMessage,
  sendPhotoMessage,
  sendVideoMessage,
  answerCallbackQuery,
};
