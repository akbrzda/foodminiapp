import {
  sendBroadcastMessageViaBot,
  sendMaxBroadcastMessageViaBot,
  sendMaxNotificationMessageViaBot,
  sendNotificationMessage,
} from "../../../utils/botService.js";

const parseTelegramExternalId = (externalId) => {
  const parsed = Number(externalId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Некорректный telegram external_id");
  }
  return parsed;
};

const telegramAdapter = {
  async sendNotification({ externalId, message, replyMarkup = null, messageThreadId = null }) {
    const telegramId = parseTelegramExternalId(externalId);
    await sendNotificationMessage({
      telegramId,
      message,
      replyMarkup,
      messageThreadId,
    });
    return { delivered: true };
  },

  async sendBroadcast({ externalId, text, imageUrl = null, videoUrl = null, parseMode = "Markdown", replyMarkup = null, messageThreadId = null }) {
    const telegramId = parseTelegramExternalId(externalId);
    const response = await sendBroadcastMessageViaBot({
      telegramId,
      text,
      imageUrl,
      videoUrl,
      parseMode,
      replyMarkup,
      messageThreadId,
    });
    return {
      delivered: true,
      providerMessageId: response?.data?.message_id || null,
    };
  },
};

const parseMaxExternalId = (externalId) => {
  const normalized = String(externalId || "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error("Некорректный max external_id");
  }
  if (Number(normalized) === 0) {
    throw new Error("Некорректный max external_id");
  }
  return normalized;
};

const normalizeMaxParseMode = (parseMode) => {
  const mode = String(parseMode || "").trim().toLowerCase();
  if (mode === "markdown" || mode === "html") return mode;
  return "markdown";
};

const maxAdapter = {
  async sendNotification({ externalId, message, replyMarkup = null }) {
    const maxId = Number(parseMaxExternalId(externalId));
    const response = await sendMaxNotificationMessageViaBot({
      maxId,
      message,
      replyMarkup,
    });
    return {
      delivered: true,
      providerMessageId: response?.data?.message_id || null,
    };
  },

  async sendBroadcast({ externalId, text, imageUrl = null, videoUrl = null, parseMode = "markdown", replyMarkup = null }) {
    const maxId = Number(parseMaxExternalId(externalId));
    const result = await sendMaxBroadcastMessageViaBot({
      maxId,
      text,
      imageUrl,
      videoUrl,
      parseMode: normalizeMaxParseMode(parseMode),
      replyMarkup,
    });
    return {
      delivered: true,
      providerMessageId: result?.data?.message_id || null,
    };
  },
};

const ADAPTERS = {
  telegram: telegramAdapter,
  max: maxAdapter,
};

export const getChannelAdapter = (platform) => {
  if (!platform) return null;
  return ADAPTERS[String(platform).toLowerCase()] || null;
};

export const getDispatchablePlatforms = () => Object.keys(ADAPTERS);

export default {
  getChannelAdapter,
  getDispatchablePlatforms,
};
