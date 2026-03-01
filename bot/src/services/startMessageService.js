import db from "../config/database.js";
import { TELEGRAM_START_MESSAGE_DEFAULT, getSystemSettings } from "../utils/settings.js";
import { sendPhotoMessage, sendTextMessage } from "./telegramApi.js";

const TELEGRAM_BUTTON_TYPES = new Set(["url", "web_app"]);
const TELEGRAM_START_IMAGE_WEIGHT_DEFAULT = 1;

const resolveMiniAppBaseUrl = () => {
  const raw = process.env.TELEGRAM_MINIAPP_URL || process.env.MINIAPP_URL || "";
  const normalized = String(raw).trim();
  if (!normalized) return "";
  return normalized.replace(/\/$/, "");
};

const getValidAbsoluteUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return normalized;
  } catch (error) {
    return "";
  }
};

const trimTextByLimit = (value, limit) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit);
};

const normalizeTelegramStartImages = (rawConfig = {}) => {
  const source = Array.isArray(rawConfig.images) ? rawConfig.images : [];
  const result = [];

  for (const image of source) {
    if (!image || typeof image !== "object" || Array.isArray(image)) continue;
    const url = getValidAbsoluteUrl(image.url || "");
    if (!url) continue;
    const weightRaw = Number(image.weight);
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? Math.round(weightRaw) : TELEGRAM_START_IMAGE_WEIGHT_DEFAULT;
    const isActive = image.is_active !== false;
    result.push({
      url,
      weight,
      is_active: isActive,
    });
  }

  const legacyImageUrl = getValidAbsoluteUrl(rawConfig.image_url || "");
  if (legacyImageUrl && !result.some((image) => image.url === legacyImageUrl)) {
    result.push({
      url: legacyImageUrl,
      weight: TELEGRAM_START_IMAGE_WEIGHT_DEFAULT,
      is_active: true,
    });
  }

  return result;
};

const getTelegramStartMessageConfig = (systemSettings = null) => {
  const raw = systemSettings?.telegram_start_message || TELEGRAM_START_MESSAGE_DEFAULT;
  const enabled = raw.enabled !== false;
  const text = trimTextByLimit(raw.text || TELEGRAM_START_MESSAGE_DEFAULT.text, 4096);
  const images = normalizeTelegramStartImages(raw);
  const buttonTypeRaw = String(raw.button_type || TELEGRAM_START_MESSAGE_DEFAULT.button_type || "url").toLowerCase();
  const buttonType = TELEGRAM_BUTTON_TYPES.has(buttonTypeRaw) ? buttonTypeRaw : "url";
  const buttonText = trimTextByLimit(raw.button_text || "", 64);
  const miniAppUrl = resolveMiniAppBaseUrl();
  const buttonUrl = getValidAbsoluteUrl(raw.button_url || "") || (buttonType === "web_app" ? miniAppUrl : "");

  if (!enabled) {
    return {
      text: TELEGRAM_START_MESSAGE_DEFAULT.text,
      images: [],
      buttonType: "",
      buttonText: "",
      buttonUrl: "",
    };
  }

  return {
    text: text || TELEGRAM_START_MESSAGE_DEFAULT.text,
    images,
    buttonType: buttonText && buttonUrl ? buttonType : "",
    buttonText: buttonText && buttonUrl ? buttonText : "",
    buttonUrl: buttonText && buttonUrl ? buttonUrl : "",
  };
};

const getLastTelegramStartImageUrl = async (telegramId) => {
  const [rows] = await db.query("SELECT last_image_url FROM telegram_start_message_history WHERE telegram_id = ? LIMIT 1", [telegramId]);
  if (!rows.length) return "";
  return String(rows[0]?.last_image_url || "").trim();
};

const saveLastTelegramStartImageUrl = async (telegramId, imageUrl) => {
  await db.query(
    `INSERT INTO telegram_start_message_history (telegram_id, last_image_url)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE last_image_url = VALUES(last_image_url), updated_at = CURRENT_TIMESTAMP`,
    [telegramId, imageUrl],
  );
};

const pickWeightedImage = (images) => {
  if (!Array.isArray(images) || images.length === 0) return null;
  let totalWeight = 0;
  for (const image of images) {
    totalWeight += Number(image.weight) > 0 ? Number(image.weight) : TELEGRAM_START_IMAGE_WEIGHT_DEFAULT;
  }
  if (totalWeight <= 0) return images[0];

  let random = Math.random() * totalWeight;
  for (const image of images) {
    const weight = Number(image.weight) > 0 ? Number(image.weight) : TELEGRAM_START_IMAGE_WEIGHT_DEFAULT;
    random -= weight;
    if (random <= 0) return image;
  }
  return images[images.length - 1];
};

const resolveTelegramStartImage = async (telegramId, images) => {
  const activeImages = (Array.isArray(images) ? images : []).filter((image) => image?.is_active !== false && image?.url);
  if (activeImages.length === 0) return null;
  if (!Number.isFinite(Number(telegramId)) || Number(telegramId) <= 0) {
    return pickWeightedImage(activeImages);
  }

  const normalizedTelegramId = Number(telegramId);
  let lastImageUrl = "";
  try {
    lastImageUrl = await getLastTelegramStartImageUrl(normalizedTelegramId);
  } catch (error) {
    // Игнорируем ошибки истории выбора изображений
  }

  let candidatePool = activeImages;
  if (lastImageUrl && activeImages.length > 1) {
    const withoutLast = activeImages.filter((image) => image.url !== lastImageUrl);
    if (withoutLast.length > 0) {
      candidatePool = withoutLast;
    }
  }

  const selected = pickWeightedImage(candidatePool);
  if (!selected?.url) return null;

  try {
    await saveLastTelegramStartImageUrl(normalizedTelegramId, selected.url);
  } catch (error) {
    // Ошибки записи истории не должны ломать отправку
  }

  return selected;
};

const buildStartReplyMarkup = ({ buttonType, buttonText, buttonUrl }) => {
  if (!buttonType || !buttonText || !buttonUrl) return null;
  if (buttonType === "web_app") {
    if (!buttonUrl.startsWith("https://")) return null;
    return {
      inline_keyboard: [
        [
          {
            text: buttonText,
            web_app: { url: buttonUrl },
          },
        ],
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        {
          text: buttonText,
          url: buttonUrl,
        },
      ],
    ],
  };
};

export const sendTelegramStartMessage = async (telegramId, providedSettings = null) => {
  const settings = providedSettings || (await getSystemSettings());
  const config = getTelegramStartMessageConfig(settings);
  const replyMarkup = buildStartReplyMarkup(config);
  const selectedImage = await resolveTelegramStartImage(telegramId, config.images);

  if (selectedImage?.url) {
    const caption = trimTextByLimit(config.text, 1024);
    await sendPhotoMessage({
      chatId: telegramId,
      photo: selectedImage.url,
      caption,
      parseMode: null,
      replyMarkup,
    });
    return true;
  }

  await sendTextMessage({
    chatId: telegramId,
    text: trimTextByLimit(config.text, 4096),
    parseMode: null,
    replyMarkup,
  });
  return true;
};

export default {
  sendTelegramStartMessage,
};
