import { isPlainObject, schemaFail, schemaOk, toNonZeroInteger, toTrimmedString } from "./schema-helpers.js";

const parseReplyMarkup = (value) => {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return null;
  return value;
};

export const validateMaxNotificationPayload = (payload) => {
  const maxId = toNonZeroInteger(payload?.max_id);
  if (!maxId) {
    return schemaFail("Укажите корректный max_id");
  }

  const message = toTrimmedString(payload?.message);
  if (!message) {
    return schemaFail("Укажите текст сообщения");
  }

  const replyMarkup = parseReplyMarkup(payload?.reply_markup);
  return schemaOk({
    maxId,
    message,
    replyMarkup,
  });
};

export const validateMaxBroadcastPayload = (payload) => {
  const maxId = toNonZeroInteger(payload?.max_id);
  if (!maxId) {
    return schemaFail("Укажите корректный max_id");
  }

  const text = String(payload?.text || "");
  const imageUrl = toTrimmedString(payload?.image_url);
  const videoUrl = toTrimmedString(payload?.video_url);
  const parseMode = payload?.parse_mode === null ? null : String(payload?.parse_mode || "markdown");
  const replyMarkup = parseReplyMarkup(payload?.reply_markup);

  if (!imageUrl && !videoUrl && !toTrimmedString(text)) {
    return schemaFail("Укажите текст для текстового сообщения");
  }

  return schemaOk({
    maxId,
    text,
    imageUrl,
    videoUrl,
    parseMode,
    replyMarkup,
  });
};

export default {
  validateMaxNotificationPayload,
  validateMaxBroadcastPayload,
};
