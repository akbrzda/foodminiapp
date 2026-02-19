import crypto from "crypto";
import db from "../config/database.js";
import { TELEGRAM_START_MESSAGE_DEFAULT } from "./settings.js";
export const validateTelegramData = (telegramInitData, botToken) => {
  try {
    const params = new URLSearchParams(telegramInitData);
    const hash = params.get("hash");
    params.delete("hash");
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    return calculatedHash === hash;
  } catch (error) {
    console.error("Telegram validation error:", error);
    return false;
  }
};
export const parseTelegramUser = (telegramInitData) => {
  try {
    const params = new URLSearchParams(telegramInitData);
    const userParam = params.get("user");
    if (!userParam) {
      return null;
    }
    const user = JSON.parse(userParam);
    return {
      telegram_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      language_code: user.language_code,
    };
  } catch (error) {
    console.error("Parse Telegram user error:", error);
    return null;
  }
};
const resolveMiniAppBaseUrl = () => {
  const raw = process.env.TELEGRAM_MINIAPP_URL || process.env.MINIAPP_URL || "";
  const normalized = String(raw).trim();
  if (!normalized) return "";
  return normalized.replace(/\/$/, "");
};

const TELEGRAM_BUTTON_TYPES = new Set(["url", "web_app"]);
const TELEGRAM_START_IMAGE_WEIGHT_DEFAULT = 1;

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
    console.error("Failed to read telegram start image history:", error);
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
    console.error("Failed to write telegram start image history:", error);
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

const sendTelegramRequest = async (method, payload) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("TELEGRAM_BOT_TOKEN not configured");
    return { ok: false };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.ok) {
    console.error("Telegram API error:", result);
    return { ok: false };
  }
  return { ok: true, result };
};

export const buildOrderDetailsReplyMarkup = (orderId) => {
  if (!orderId) return null;
  const miniAppBaseUrl = resolveMiniAppBaseUrl();
  if (!miniAppBaseUrl) return null;

  const webAppUrl = `${miniAppBaseUrl}/order/${encodeURIComponent(String(orderId))}`;
  return {
    inline_keyboard: [
      [
        {
          text: "Открыть заказ",
          web_app: { url: webAppUrl },
        },
      ],
    ],
  };
};

export const sendTelegramNotification = async (telegramId, message, { replyMarkup = null } = {}) => {
  try {
    const response = await sendTelegramRequest("sendMessage", {
      chat_id: telegramId,
      text: message,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
    return false;
  }
};

export const sendTelegramStartMessage = async (telegramId, systemSettings = null) => {
  try {
    const config = getTelegramStartMessageConfig(systemSettings);
    const replyMarkup = buildStartReplyMarkup(config);
    const selectedImage = await resolveTelegramStartImage(telegramId, config.images);
    if (selectedImage?.url) {
      const caption = trimTextByLimit(config.text, 1024);
      const response = await sendTelegramRequest("sendPhoto", {
        chat_id: telegramId,
        photo: selectedImage.url,
        caption,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return response.ok;
    }

    const response = await sendTelegramRequest("sendMessage", {
      chat_id: telegramId,
      text: trimTextByLimit(config.text, 4096),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send /start Telegram message:", error);
    return false;
  }
};
export const formatOrderStatusMessage = (orderNumber, status, orderType) => {
  const statusMessages = {
    delivery: {
      pending: "⏳ Ваш заказ получен и ожидает подтверждения",
      confirmed: "✅ Заказ подтвержден и принят в работу",
      preparing: "👨‍🍳 Ваш заказ готовится",
      ready: "📦 Заказ готов",
      delivering: "🚚 Курьер везет ваш заказ",
      completed: "✨ Заказ доставлен. Приятного аппетита!",
      cancelled: "❌ Заказ отменен",
    },
    pickup: {
      pending: "⏳ Ваш заказ получен и ожидает подтверждения",
      confirmed: "✅ Заказ подтвержден и принят в работу",
      preparing: "👨‍🍳 Ваш заказ готовится",
      ready: "📦 Заказ готов к выдаче. Ждем вас!",
      completed: "✨ Заказ выдан. Приятного аппетита!",
      cancelled: "❌ Заказ отменен",
    },
  };
  const messages = orderType === "delivery" ? statusMessages.delivery : statusMessages.pickup;
  const statusText = messages[status] || "Статус заказа изменен";
  return `<b>Заказ #${orderNumber}</b>\n\n${statusText}`;
};
