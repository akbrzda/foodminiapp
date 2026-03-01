import crypto from "crypto";
import { TELEGRAM_START_MESSAGE_DEFAULT } from "./settings.js";
import { sendNotificationMessage, sendStartMessage } from "./botService.js";

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

export const sendTelegramNotification = async (telegramId, message, { replyMarkup = null, messageThreadId = null } = {}) => {
  try {
    await sendNotificationMessage({
      telegramId,
      message,
      replyMarkup,
      messageThreadId,
    });
    return true;
  } catch (error) {
    console.error("Failed to send Telegram notification via bot-service:", error);
    return false;
  }
};

export const sendTelegramStartMessage = async (telegramId, systemSettings = null) => {
  try {
    await sendStartMessage({
      telegramId,
      settings: systemSettings || { telegram_start_message: TELEGRAM_START_MESSAGE_DEFAULT },
    });
    return true;
  } catch (error) {
    console.error("Failed to send /start Telegram message via bot-service:", error);
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
      ready: "📍 Заказ готов к выдаче",
      delivering: "📍 Заказ готов к выдаче",
      completed: "✨ Заказ получен. Приятного аппетита!",
      cancelled: "❌ Заказ отменен",
    },
  };

  const orderTypeKey = orderType === "pickup" ? "pickup" : "delivery";
  const statusMessage = statusMessages[orderTypeKey]?.[status] || "📋 Статус заказа обновлен";

  return `Заказ #${orderNumber}\n\n${statusMessage}`;
};

export default {
  validateTelegramData,
  parseTelegramUser,
  sendTelegramNotification,
  sendTelegramStartMessage,
  formatOrderStatusMessage,
  buildOrderDetailsReplyMarkup,
};
