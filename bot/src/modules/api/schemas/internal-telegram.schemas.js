import { isPlainObject, schemaFail, schemaOk, toPositiveInteger, toTrimmedString } from "./schema-helpers.js";

const parseReplyMarkup = (value) => {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return null;
  return value;
};

export const validateStartMessagePayload = (payload) => {
  const telegramId = toPositiveInteger(payload?.telegram_id);
  if (!telegramId) {
    return schemaFail("Укажите корректный telegram_id");
  }

  const settings = isPlainObject(payload?.settings) ? payload.settings : null;
  return schemaOk({ telegramId, settings });
};

export const validateNotificationPayload = (payload) => {
  const telegramId = toPositiveInteger(payload?.telegram_id);
  if (!telegramId) {
    return schemaFail("Укажите корректный telegram_id");
  }

  const message = toTrimmedString(payload?.message);
  if (!message) {
    return schemaFail("Укажите текст сообщения");
  }

  const replyMarkup = parseReplyMarkup(payload?.reply_markup);
  const messageThreadId = toPositiveInteger(payload?.message_thread_id);

  return schemaOk({
    telegramId,
    message,
    replyMarkup,
    messageThreadId,
  });
};

export const validateBroadcastPayload = (payload) => {
  const telegramId = toPositiveInteger(payload?.telegram_id);
  if (!telegramId) {
    return schemaFail("Укажите корректный telegram_id");
  }

  const text = String(payload?.text || "");
  const imageUrl = toTrimmedString(payload?.image_url);
  const videoUrl = toTrimmedString(payload?.video_url);
  const parseMode = payload?.parse_mode === null ? null : String(payload?.parse_mode || "Markdown");
  const replyMarkup = parseReplyMarkup(payload?.reply_markup);
  const messageThreadId = toPositiveInteger(payload?.message_thread_id);

  if (!imageUrl && !videoUrl && !toTrimmedString(text)) {
    return schemaFail("Укажите текст для текстового сообщения");
  }

  return schemaOk({
    telegramId,
    text,
    imageUrl,
    videoUrl,
    parseMode,
    replyMarkup,
    messageThreadId,
  });
};

export const validateAnswerCallbackPayload = (payload) => {
  const callbackQueryId = toTrimmedString(payload?.callback_query_id);
  if (!callbackQueryId) {
    return schemaFail("Укажите callback_query_id");
  }

  return schemaOk({
    callbackQueryId,
    text: String(payload?.text || "Спасибо!"),
    showAlert: payload?.show_alert === true,
  });
};

export default {
  validateStartMessagePayload,
  validateNotificationPayload,
  validateBroadcastPayload,
  validateAnswerCallbackPayload,
};
