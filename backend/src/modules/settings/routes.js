import express from "express";
import axios from "axios";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { METRIKA_DEFAULT_GOALS, getSystemSettings, getSettingsList, updateSystemSettings } from "../../utils/settings.js";
import { logger } from "../../utils/logger.js";
import { sendTelegramStartMessage } from "../../utils/telegram.js";
import { addTelegramNotification } from "../../queues/config.js";
import { sendMaxNotificationMessageViaBot } from "../../utils/botService.js";

const router = express.Router();
const SUPPORTED_NOTIFICATION_PLATFORMS = new Set(["telegram", "max"]);

const resolvePlatform = (value, fallback = "telegram") => {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  return SUPPORTED_NOTIFICATION_PLATFORMS.has(normalized) ? normalized : null;
};

const buildStartReplyMarkup = (platform, config) => {
  const buttonText = String(config?.button_text || "").trim();
  const buttonUrl = String(config?.button_url || "").trim();
  if (!buttonText || !buttonUrl) return null;

  if (platform === "max") {
    const buttonType = String(config?.button_type || "open_app")
      .trim()
      .toLowerCase();
    if (buttonType === "open_app") {
      return {
        inline_keyboard: [
          [
            {
              text: buttonText,
              web_app: {
                url: buttonUrl,
              },
            },
          ],
        ],
      };
    }
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

const buildStartMessageText = (config) => {
  const text = String(config?.text || "").trim();
  const images = Array.isArray(config?.images) ? config.images : [];
  const activeImage = images.find((image) => image?.is_active !== false && image?.url)?.url || String(config?.image_url || "").trim();
  if (!activeImage) return text;
  if (!text) return `Изображение: ${activeImage}`;
  return `${text}\n\nИзображение: ${activeImage}`;
};

const PUBLIC_SETTINGS_ALLOWLIST = new Set([
  "bonuses_enabled",
  "orders_enabled",
  "delivery_enabled",
  "pickup_enabled",
  "dine_in_enabled",
  "menu_badges_enabled",
  "menu_cards_layout",
  "site_currency",
  "iiko_enabled",
  "premiumbonus_enabled",
  "integration_mode",
  "yandex_metrika_enabled",
  "yandex_metrika_counter_id",
  "yandex_metrika_webvisor_enabled",
  "yandex_metrika_clickmap_enabled",
  "yandex_metrika_track_links_enabled",
  "yandex_metrika_accurate_bounce_enabled",
  "yandex_metrika_goals",
]);

const filterPublicSettings = (settings) => {
  const result = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (PUBLIC_SETTINGS_ALLOWLIST.has(key)) {
      result[key] = value;
    }
  }
  return result;
};

const buildMapsPublicPayload = (settings) => ({
  yandex_js_api_key: String(settings?.yandex_js_api_key || "").trim(),
  language: String(settings?.maps_default_language || "ru_RU").trim() || "ru_RU",
  country: String(settings?.maps_default_country || "RU").trim() || "RU",
});

const buildYandexRequestHeaders = (req) => {
  const incomingReferer = String(req.headers?.referer || "").trim();
  const incomingOrigin = String(req.headers?.origin || "").trim();
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req.headers?.host || "").trim();
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const fallbackOrigin = host ? `${protocol}://${host}` : "";
  const origin = incomingOrigin || fallbackOrigin;
  const referer = incomingReferer || (origin ? `${origin}/` : "");

  const headers = {};
  if (origin) {
    headers.Origin = origin;
  }
  if (referer) {
    headers.Referer = referer;
  }
  return headers;
};

const parseBotServiceErrorDetails = (error) => {
  const message = String(error?.message || "").trim();
  if (!message) return "";
  const marker = "Bot service request failed:";
  if (!message.includes(marker)) return message;
  return message.replace(marker, "").trim();
};

router.get("/", async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({ settings: filterPublicSettings(settings) });
  } catch (error) {
    next(error);
  }
});

router.get("/maps-public", async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      success: true,
      data: buildMapsPublicPayload(settings),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      settings,
      items: getSettingsList(settings),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/maps/test", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    const geocoderKey = String(settings?.yandex_js_api_key || "").trim();
    const suggestKey = String(settings?.yandex_suggest_api_key || "").trim();
    const language = String(settings?.maps_default_language || "ru_RU").trim() || "ru_RU";
    const query = "Москва, Тверская улица, 1";

    if (!geocoderKey) {
      return res.status(400).json({ success: false, error: "Не задан yandex_js_api_key (единый ключ JS API + HTTP Геокодер)" });
    }
    if (!suggestKey) {
      return res.status(400).json({ success: false, error: "Не задан yandex_suggest_api_key" });
    }
    const yandexHeaders = buildYandexRequestHeaders(req);
    const [suggestResponse, geocodeResponse] = await Promise.all([
      axios.get("https://suggest-maps.yandex.ru/v1/suggest", {
        params: {
          apikey: suggestKey,
          text: query,
          lang: language,
          results: 3,
        },
        headers: yandexHeaders,
        timeout: 7000,
      }),
      axios.get("https://geocode-maps.yandex.ru/v1/", {
        params: {
          apikey: geocoderKey,
          geocode: query,
          format: "json",
          results: 3,
          lang: language,
        },
        headers: yandexHeaders,
        timeout: 7000,
      }),
    ]);

    const suggestCount = Array.isArray(suggestResponse?.data?.results) ? suggestResponse.data.results.length : 0;
    const geocodeCount = Array.isArray(geocodeResponse?.data?.response?.GeoObjectCollection?.featureMember)
      ? geocodeResponse.data.response.GeoObjectCollection.featureMember.length
      : 0;

    return res.json({
      success: true,
      data: {
        query,
        suggest_count: suggestCount,
        geocode_count: geocodeCount,
      },
    });
  } catch (error) {
    if (error?.response) {
      const upstreamError = error.response?.data?.error || error.response?.data?.message || "";
      return res.status(502).json({
        success: false,
        error: "Ошибка проверки Яндекс API",
        details: upstreamError ? `${error.message}: ${upstreamError}` : error.message,
      });
    }
    return next(error);
  }
});

router.post("/admin/metrika/test", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    const enabled = settings?.yandex_metrika_enabled === true;
    const counterId = String(settings?.yandex_metrika_counter_id || "").trim();
    const goals =
      settings?.yandex_metrika_goals && typeof settings.yandex_metrika_goals === "object" && !Array.isArray(settings.yandex_metrika_goals)
        ? settings.yandex_metrika_goals
        : METRIKA_DEFAULT_GOALS;

    if (!enabled) {
      return res.status(400).json({
        success: false,
        error: "Интеграция Яндекс Метрики выключена",
      });
    }
    if (!/^\d{3,20}$/.test(counterId)) {
      return res.status(400).json({
        success: false,
        error: "Не задан корректный yandex_metrika_counter_id",
      });
    }

    return res.json({
      success: true,
      data: {
        enabled,
        counter_id: counterId,
        goals_count: Object.keys(goals).length,
        webvisor_enabled: settings?.yandex_metrika_webvisor_enabled === true,
        clickmap_enabled: settings?.yandex_metrika_clickmap_enabled !== false,
        track_links_enabled: settings?.yandex_metrika_track_links_enabled !== false,
        accurate_bounce_enabled: settings?.yandex_metrika_accurate_bounce_enabled !== false,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/admin", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const { settings: patch } = req.body || {};
    const { updated, errors } = await updateSystemSettings(patch);

    if (errors) {
      return res.status(400).json({ errors });
    }

    await logger.admin.action(req.user?.id, "update_settings", "settings", null, JSON.stringify(updated), req);

    const settings = await getSystemSettings();
    res.json({ settings, items: getSettingsList(settings) });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/start-message/test", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const platform = resolvePlatform(req.body?.platform, "telegram");
    if (!platform) {
      return res.status(400).json({ error: "Платформа должна быть telegram или max" });
    }

    const externalIdRaw = req.body?.external_id;
    const externalId = Number(externalIdRaw);
    if (!Number.isInteger(externalId) || externalId === 0) {
      const fieldName = platform === "max" ? "max_id" : "telegram_id";
      return res.status(400).json({ error: `Укажите корректный ${fieldName}` });
    }

    const settings = await getSystemSettings();
    if (platform === "telegram") {
      const sent = await sendTelegramStartMessage(externalId, settings);
      if (!sent) {
        return res.status(400).json({ error: "Не удалось отправить тестовое сообщение" });
      }
      return res.json({ success: true });
    }

    const config = settings?.max_start_message || {};
    const messageText = buildStartMessageText(config);
    if (!messageText) {
      return res.status(400).json({ error: "Для MAX не задан текст приветственного сообщения" });
    }

    await sendMaxNotificationMessageViaBot({
      maxId: externalId,
      message: messageText,
      replyMarkup: buildStartReplyMarkup("max", config),
    });
    return res.json({ success: true });
  } catch (error) {
    const details = parseBotServiceErrorDetails(error);
    if (details) {
      return res.status(502).json({
        success: false,
        error: "Ошибка отправки тестового сообщения через bot-service",
        details,
      });
    }
    next(error);
  }
});

router.post("/admin/orders-notification/test", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const eventTypeRaw = String(req.body?.event_type || "new_order").trim().toLowerCase();
    const allowedEventTypes = new Set(["new_order", "completed", "cancelled"]);
    if (!allowedEventTypes.has(eventTypeRaw)) {
      return res.status(400).json({ error: "event_type должен быть new_order, completed или cancelled" });
    }

    const cityIdRaw = req.body?.city_id;
    let cityId = null;
    if (cityIdRaw !== undefined && cityIdRaw !== null && String(cityIdRaw).trim() !== "") {
      const parsedCityId = Number(cityIdRaw);
      if (!Number.isInteger(parsedCityId) || parsedCityId <= 0) {
        return res.status(400).json({ error: "city_id должен быть положительным числом" });
      }
      cityId = parsedCityId;
    }

    const settings = await getSystemSettings();
    const requestedPlatform = req.body?.platform ? resolvePlatform(req.body?.platform, null) : null;
    if (req.body?.platform && !requestedPlatform) {
      return res.status(400).json({ error: "Платформа должна быть telegram или max" });
    }

    const telegramGroupId = String(settings?.telegram_new_order_notification?.group_id || "").trim();
    const maxGroupId = String(settings?.max_new_order_notification?.group_id || "").trim();
    const hasTelegramTarget = Boolean(telegramGroupId);
    const hasMaxTarget = Boolean(maxGroupId);

    if (requestedPlatform === "telegram" && !hasTelegramTarget) {
      return res.status(400).json({ error: "Укажите group_id в настройках Telegram-уведомлений" });
    }
    if (requestedPlatform === "max" && !hasMaxTarget) {
      return res.status(400).json({ error: "Укажите group_id в настройках MAX-уведомлений" });
    }
    if (!requestedPlatform && !hasTelegramTarget && !hasMaxTarget) {
      return res.status(400).json({ error: "Укажите group_id минимум для одной платформы (Telegram или MAX)" });
    }

    const queuePayload = requestedPlatform ? { platform: requestedPlatform } : {};

    if (eventTypeRaw === "new_order") {
      await addTelegramNotification({
        ...queuePayload,
        type: "new_order",
        priority: 1,
        data: {
          is_test: true,
          city_id: cityId,
          order_number: "TEST-0001",
          order_type: "delivery",
          city_name: "Тестовый город",
          branch_name: "Тестовый филиал",
          delivery_street: "Тестовая улица",
          delivery_house: "1",
          delivery_apartment: "1",
          delivery_entrance: "1",
          total: 999,
          items: [
            {
              item_name: "Тестовая позиция",
              variant_name: "Стандарт",
              quantity: 1,
              subtotal: 999,
              modifiers: [],
            },
          ],
          payment_method: "cash",
          comment: "Тестовое уведомление",
        },
      });
    } else {
      await addTelegramNotification({
        ...queuePayload,
        type: "status_change",
        priority: 1,
        data: {
          is_test: true,
          city_id: cityId,
          order_number: "TEST-0001",
          old_status: eventTypeRaw === "completed" ? "delivering" : "confirmed",
          new_status: eventTypeRaw,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/telegram-bot/profile", authenticateToken, requirePermission("system.settings.manage"), async (req, res, next) => {
  try {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, error: "TELEGRAM_BOT_TOKEN не задан" });
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/getMe`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    if (!response.data?.ok) {
      return res.status(502).json({ success: false, error: "Не удалось получить профиль Telegram-бота" });
    }

    const bot = response.data?.result || {};
    res.json({
      success: true,
      data: {
        id: bot.id || null,
        username: bot.username || null,
        first_name: bot.first_name || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
