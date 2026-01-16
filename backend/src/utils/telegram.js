import crypto from "crypto";

// Проверка данных от Telegram Mini App
export const validateTelegramData = (telegramInitData, botToken) => {
  try {
    const params = new URLSearchParams(telegramInitData);
    const hash = params.get("hash");
    params.delete("hash");

    // Сортировка параметров
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Создание секретного ключа
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();

    // Проверка подписи
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    return calculatedHash === hash;
  } catch (error) {
    console.error("Telegram validation error:", error);
    return false;
  }
};

// Парсинг данных пользователя из Telegram
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

// Отправка уведомления пользователю через Telegram Bot
export const sendTelegramNotification = async (telegramId, message) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.warn("TELEGRAM_BOT_TOKEN not configured");
      return false;
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error("Telegram API error:", result);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
    return false;
  }
};

// Форматирование уведомления о смене статуса заказа
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
