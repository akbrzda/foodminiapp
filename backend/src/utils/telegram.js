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
