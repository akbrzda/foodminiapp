import db from "../config/database.js";
import redis from "../config/redis.js";
import { decrypt, encrypt } from "./encryption.js";

const SETTINGS_CACHE_KEY = "settings";
const SETTINGS_CACHE_TTL = 600;
export const TELEGRAM_START_MESSAGE_DEFAULT = {
  enabled: true,
  text: "Привет! Добро пожаловать в Панда Пиццу.",
  image_url: "",
  images: [],
  button_type: "web_app",
  button_text: "Открыть приложение",
  button_url: "",
};
export const MAX_START_MESSAGE_DEFAULT = {
  enabled: true,
  text: "Привет! Добро пожаловать в Панда Пиццу.",
  image_url: "",
  images: [],
  button_type: "open_app",
  button_text: "Открыть приложение",
  button_url: "",
};
export const TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT = {
  enabled: false,
  notify_on_new_order: true,
  notify_on_completed: false,
  notify_on_cancelled: false,
  group_id: "",
  use_city_threads: false,
  city_thread_ids: {},
  message_template:
    "🔔 <b>Новый заказ #{{order_number}}</b>\n\n📍 <b>Тип:</b> {{order_type_label}}\n🏙️ <b>Город:</b> {{city_name}}\n🏪 <b>Филиал:</b> {{branch_name}}\n📫 <b>Адрес:</b> {{delivery_address}}\n💳 <b>Оплата:</b> {{payment_method_label}}\n💰 <b>Сумма:</b> {{total}}₽\n\n📦 <b>Состав заказа:</b>\n{{items_list}}\n\n💬 <b>Комментарий:</b> {{comment}}",
};
export const MAX_NEW_ORDER_NOTIFICATION_DEFAULT = {
  enabled: false,
  notify_on_new_order: true,
  notify_on_completed: false,
  notify_on_cancelled: false,
  group_id: "",
  message_template:
    "🔔 <b>Новый заказ #{{order_number}}</b>\n\n📍 <b>Тип:</b> {{order_type_label}}\n🏙️ <b>Город:</b> {{city_name}}\n🏪 <b>Филиал:</b> {{branch_name}}\n📫 <b>Адрес:</b> {{delivery_address}}\n💳 <b>Оплата:</b> {{payment_method_label}}\n💰 <b>Сумма:</b> {{total}}₽\n\n📦 <b>Состав заказа:</b>\n{{items_list}}\n\n💬 <b>Комментарий:</b> {{comment}}",
};
export const METRIKA_DEFAULT_GOALS = {
  login_success: "login_success",
  login_failed: "login_failed",
  add_to_cart: "add_to_cart",
  begin_checkout: "begin_checkout",
  order_created: "order_created",
  order_create_failed: "order_create_failed",
};

const TELEGRAM_START_BUTTON_TYPES = new Set(["url", "web_app"]);
const MAX_START_BUTTON_TYPES = new Set(["link", "open_app"]);
const ORDER_NOTIFICATION_PLATFORMS = new Set(["telegram", "max"]);
const MAPS_API_KEY_MAX_LENGTH = 512;
const MAPS_LANGUAGE_REGEX = /^[a-z]{2}_[A-Z]{2}$/;
const MAPS_COUNTRY_REGEX = /^[A-Z]{2}$/;
const METRIKA_COUNTER_ID_REGEX = /^\d{3,20}$/;
const MENU_CARDS_LAYOUT_VALUES = new Set(["horizontal", "vertical"]);
const SITE_CURRENCY_VALUES = new Set(["RUB", "USD", "TJS", "KZT", "KGS", "UZS"]);
const LOYALTY_INFO_SECTIONS_MAX_ITEMS = 20;
const LOYALTY_INFO_TITLE_MAX_LENGTH = 120;
const LOYALTY_INFO_DESCRIPTION_MAX_LENGTH = 2000;
const ENCRYPTED_SETTING_KEYS = new Set([
  "iiko_api_token",
  "iiko_api_key",
  "iiko_webhook_secret",
  "premiumbonus_api_token",
  "yandex_js_api_key",
  "yandex_suggest_api_key",
]);
const ENCRYPTED_VALUE_REGEX = /^[a-f0-9]{128}:[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+$/i;

export const SETTINGS_SCHEMA = {
  bonuses_enabled: {
    default: true,
    label: "Бонусная система",
    description: "Начисление и списание бонусов",
    group: "Лояльность",
    type: "boolean",
  },
  default_bonus_expires_days: {
    default: 60,
    label: "Срок сгорания бонусов (дни)",
    description: "Количество дней до сгорания начисленных бонусов",
    group: "Лояльность",
    type: "number",
  },
  loyalty_info_sections: {
    default: [],
    label: "Инфо-блоки бонусной программы",
    description: "Заголовки и описания для раздела «Как всё работает» в Mini App",
    group: "Лояльность",
    type: "json_array",
  },
  orders_enabled: {
    default: true,
    label: "Прием заказов",
    description: "Разрешает создание новых заказов",
    group: "Заказы",
    type: "boolean",
  },
  delivery_enabled: {
    default: true,
    label: "Доставка",
    description: "Оформление заказов с доставкой",
    group: "Заказы",
    type: "boolean",
  },
  pickup_enabled: {
    default: true,
    label: "Самовывоз",
    description: "Оформление заказов на самовывоз",
    group: "Заказы",
    type: "boolean",
  },
  dine_in_enabled: {
    default: true,
    label: "В зале",
    description: "Оформление заказов в зале",
    group: "Заказы",
    type: "boolean",
  },
  menu_badges_enabled: {
    default: true,
    label: "Бейджи в меню",
    description: "Показывать бейджи на карточках блюд в Mini App",
    group: "Оформление",
    type: "boolean",
  },
  menu_cards_layout: {
    default: "horizontal",
    label: "Раскладка карточек меню",
    description: "Горизонтально (1 в ряд) или вертикально (2 в ряд)",
    group: "Оформление",
    type: "string",
  },
  site_currency: {
    default: "RUB",
    label: "Валюта сайта",
    description: "Валюта отображения цен в интерфейсе сайта",
    group: "Оформление",
    type: "string",
  },
  telegram_start_message: {
    default: TELEGRAM_START_MESSAGE_DEFAULT,
    label: "Приветственное сообщение /start",
    description: "Текст, изображение и кнопка для команды /start в Telegram-боте",
    group: "Telegram",
    type: "json",
  },
  max_start_message: {
    default: MAX_START_MESSAGE_DEFAULT,
    label: "Приветственное сообщение MAX",
    description: "Текст, изображения и кнопка для welcome-сообщения в MAX",
    group: "MAX",
    type: "json",
  },
  telegram_new_order_notification: {
    default: TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT,
    label: "Telegram-уведомления по заказам",
    description: "События уведомлений (новый/завершен/отменен), группа, thread по городам и шаблон нового заказа",
    group: "Telegram",
    type: "json",
  },
  max_new_order_notification: {
    default: MAX_NEW_ORDER_NOTIFICATION_DEFAULT,
    label: "MAX-уведомления по заказам",
    description: "События уведомлений (новый/завершен/отменен), чат и шаблон нового заказа",
    group: "MAX",
    type: "json",
  },
  order_notifications_platform: {
    default: "telegram",
    label: "Платформа уведомлений по заказам",
    description: "Канал, через который отправляются уведомления сотрудникам",
    group: "Интеграции",
    type: "string",
  },
  integration_mode: {
    default: { menu: "local", orders: "local", loyalty: "local" },
    label: "Режимы интеграции",
    description: "Режим работы модулей: local/external",
    group: "Интеграции",
    type: "json",
  },
  iiko_enabled: {
    default: false,
    label: "Интеграция iiko",
    description: "Включает синхронизацию меню, стоп-листа и заказов",
    group: "Интеграции",
    type: "boolean",
  },
  iiko_auto_sync_enabled: {
    default: true,
    label: "Автосинк iiko",
    description: "Разрешает автоматическую синхронизацию iiko по расписанию и при создании заказа",
    group: "Интеграции",
    type: "boolean",
  },
  iiko_api_url: {
    default: "",
    label: "iiko API URL",
    description: "Базовый URL API iiko",
    group: "Интеграции",
    type: "string",
  },
  iiko_api_token: {
    default: "",
    label: "iiko API Token",
    description: "Токен доступа к API iiko",
    group: "Интеграции",
    type: "string",
  },
  iiko_api_login: {
    default: "",
    label: "iiko API Login",
    description: "Логин для получения access token в iiko",
    group: "Интеграции",
    type: "string",
  },
  iiko_api_key: {
    default: "",
    label: "iiko API Key",
    description: "API-ключ для получения access token в iiko",
    group: "Интеграции",
    type: "string",
  },
  iiko_organization_id: {
    default: "",
    label: "iiko Organization ID",
    description: "ID организации в iiko",
    group: "Интеграции",
    type: "string",
  },
  iiko_sync_category_ids: {
    default: [],
    label: "Категории синхронизации iiko",
    description: "Список внешних ID категорий iiko для синхронизации меню",
    group: "Интеграции",
    type: "json_array",
  },
  iiko_external_menu_id: {
    default: "",
    label: "iiko External Menu ID",
    description: "ID внешнего меню iiko для синхронизации",
    group: "Интеграции",
    type: "string",
  },
  iiko_price_category_id: {
    default: "",
    label: "iiko Price Category ID",
    description: "ID категории цен iiko для внешнего меню (опционально)",
    group: "Интеграции",
    type: "string",
  },
  iiko_delivery_product_id: {
    default: "",
    label: "iiko Delivery Product ID",
    description: "ID сервисной позиции iiko для платной доставки в составе заказа",
    group: "Интеграции",
    type: "string",
  },
  iiko_preserve_local_names: {
    default: true,
    label: "Сохранять локальные названия iiko",
    description: "Не перезаписывать локально измененные названия при синхронизации меню iiko",
    group: "Интеграции",
    type: "boolean",
  },
  iiko_order_type_mapping: {
    default: {},
    label: "Маппинг типов заказа iiko",
    description: "Сопоставление локальных типов заказа с типами iiko",
    group: "Интеграции",
    type: "json",
  },
  iiko_payment_type_mapping: {
    default: {},
    label: "Маппинг способов оплаты iiko",
    description: "Сопоставление локальных способов оплаты с типами оплат iiko",
    group: "Интеграции",
    type: "json",
  },
  iiko_bonus_discount_type_id: {
    default: "",
    label: "iiko Bonus Discount Type ID",
    description: "ID типа скидки iiko для списания бонусов (order.discountsInfo)",
    group: "Интеграции",
    type: "string",
  },
  iiko_webhook_secret: {
    default: "",
    label: "iiko Webhook Secret",
    description: "Секрет проверки подписи webhook iiko",
    group: "Интеграции",
    type: "string",
  },
  iiko_webhook_allow_order_number_fallback: {
    default: false,
    label: "Fallback поиска заказа по номеру (iiko webhook)",
    description: "Разрешает искать заказ по external_number, если iiko_order_id не найден",
    group: "Интеграции",
    type: "boolean",
  },
  premiumbonus_enabled: {
    default: false,
    label: "Интеграция PremiumBonus",
    description: "Включает синхронизацию клиентов и лояльности",
    group: "Интеграции",
    type: "boolean",
  },
  premiumbonus_auto_sync_enabled: {
    default: true,
    label: "Автосинк PremiumBonus",
    description: "Разрешает автоматическую синхронизацию клиентов и покупок PremiumBonus",
    group: "Интеграции",
    type: "boolean",
  },
  premiumbonus_api_url: {
    default: "",
    label: "PremiumBonus API URL",
    description: "Базовый URL API PremiumBonus",
    group: "Интеграции",
    type: "string",
  },
  premiumbonus_api_token: {
    default: "",
    label: "PremiumBonus API Token",
    description: "Токен доступа к API PremiumBonus",
    group: "Интеграции",
    type: "string",
  },
  premiumbonus_sale_point_id: {
    default: "",
    label: "PremiumBonus Sale Point ID",
    description: "Идентификатор точки продаж PremiumBonus",
    group: "Интеграции",
    type: "string",
  },
  premiumbonus_trigger_adjust_earn_event_name: {
    default: "",
    label: "PB Trigger Earn Event",
    description: "Название события PremiumBonus для ручного начисления (admin adjust earn)",
    group: "Интеграции",
    type: "string",
  },
  premiumbonus_trigger_adjust_spend_event_name: {
    default: "",
    label: "PB Trigger Spend Event",
    description: "Название события PremiumBonus для ручного списания (admin adjust spend)",
    group: "Интеграции",
    type: "string",
  },
  yandex_js_api_key: {
    default: "",
    label: "Yandex JS API Key",
    description: "Единый ключ для JavaScript API и HTTP Геокодера Яндекс Карт",
    group: "Карты",
    type: "string",
  },
  yandex_suggest_api_key: {
    default: "",
    label: "Yandex Suggest API Key",
    description: "Серверный ключ для API Геосаджеста Яндекс Карт",
    group: "Карты",
    type: "string",
  },
  maps_default_language: {
    default: "ru_RU",
    label: "Язык карт по умолчанию",
    description: "Локаль API Яндекс Карт в формате ll_CC, например ru_RU",
    group: "Карты",
    type: "string",
  },
  maps_default_country: {
    default: "RU",
    label: "Страна карт по умолчанию",
    description: "Код страны ISO 3166-1 alpha-2, например US или RU",
    group: "Карты",
    type: "string",
  },
  yandex_metrika_enabled: {
    default: false,
    label: "Яндекс Метрика",
    description: "Включает отправку аналитических событий из Mini App",
    group: "Аналитика",
    type: "boolean",
  },
  yandex_metrika_counter_id: {
    default: "",
    label: "ID счетчика Яндекс Метрики",
    description: "Числовой идентификатор счетчика Метрики",
    group: "Аналитика",
    type: "string",
  },
  yandex_metrika_webvisor_enabled: {
    default: false,
    label: "Вебвизор",
    description: "Разрешает запись сессий в Яндекс Метрике",
    group: "Аналитика",
    type: "boolean",
  },
  yandex_metrika_clickmap_enabled: {
    default: true,
    label: "Карта кликов",
    description: "Отправляет данные для карты кликов Метрики",
    group: "Аналитика",
    type: "boolean",
  },
  yandex_metrika_track_links_enabled: {
    default: true,
    label: "Отслеживание ссылок",
    description: "Отслеживает переходы по внешним ссылкам",
    group: "Аналитика",
    type: "boolean",
  },
  yandex_metrika_accurate_bounce_enabled: {
    default: true,
    label: "Точный показатель отказов",
    description: "Включает точный расчет отказов в Метрике",
    group: "Аналитика",
    type: "boolean",
  },
  yandex_metrika_goals: {
    default: METRIKA_DEFAULT_GOALS,
    label: "Карта целей Метрики",
    description: "Соответствие внутренних событий и ID JS-целей Метрики",
    group: "Аналитика",
    type: "json",
  },
};

const normalizeSettingValue = (rawValue, fallback) => {
  if (rawValue === null || rawValue === undefined) return fallback;
  if (typeof rawValue === "string") {
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return rawValue;
    }
  }
  return rawValue;
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
};
const normalizeNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};
const normalizeString = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
};
const validateMapsSetting = (key, value) => {
  if (typeof value !== "string") {
    return "Ожидалась строка";
  }

  if (key === "maps_default_language") {
    if (!value) return null;
    if (!MAPS_LANGUAGE_REGEX.test(value)) {
      return "maps_default_language должен быть в формате ll_CC, например ru_RU";
    }
    return null;
  }

  if (key === "maps_default_country") {
    if (!value) return null;
    if (!MAPS_COUNTRY_REGEX.test(value)) {
      return "maps_default_country должен быть в формате ISO alpha-2, например RU";
    }
    return null;
  }

  if (key === "yandex_js_api_key" || key === "yandex_suggest_api_key") {
    if (!value) return null;
    if (value.length < 8) {
      return `${key} слишком короткий`;
    }
    if (value.length > MAPS_API_KEY_MAX_LENGTH) {
      return `${key} не должен превышать ${MAPS_API_KEY_MAX_LENGTH} символов`;
    }
    return null;
  }

  return null;
};
const validateAppearanceSetting = (key, value) => {
  if (key === "menu_cards_layout") {
    if (typeof value !== "string") {
      return "menu_cards_layout должен быть строкой";
    }
    if (!MENU_CARDS_LAYOUT_VALUES.has(value)) {
      return "menu_cards_layout должен быть horizontal или vertical";
    }
    return null;
  }

  if (key === "site_currency") {
    if (typeof value !== "string") {
      return "site_currency должен быть строкой";
    }
    const normalizedCurrency = value.trim().toUpperCase() === "UZBS" ? "UZS" : value.trim().toUpperCase();
    if (!SITE_CURRENCY_VALUES.has(normalizedCurrency)) {
      return "site_currency должен быть одним из: RUB, USD, TJS, KZT, KGS, UZS";
    }
    return null;
  }

  return null;
};
const validateAnalyticsSetting = (key, value) => {
  if (key !== "yandex_metrika_counter_id") return null;
  if (!value) return null;
  if (!METRIKA_COUNTER_ID_REGEX.test(value)) {
    return "yandex_metrika_counter_id должен содержать только цифры (от 3 до 20)";
  }
  return null;
};
const validateMetrikaGoals = (key, value) => {
  if (key !== "yandex_metrika_goals") return { normalized: value, error: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { normalized: null, error: "Ожидался JSON-объект для yandex_metrika_goals" };
  }

  const normalized = {};
  for (const [eventKey, goalId] of Object.entries(value)) {
    const normalizedEventKey = String(eventKey || "").trim();
    const normalizedGoalId = String(goalId || "").trim();

    if (!normalizedEventKey) {
      return { normalized: null, error: "Ключ события в yandex_metrika_goals не должен быть пустым" };
    }
    if (!/^[a-z0-9_]{2,64}$/i.test(normalizedEventKey)) {
      return { normalized: null, error: `Некорректный ключ события: ${normalizedEventKey}` };
    }
    if (!normalizedGoalId) {
      return { normalized: null, error: `Для события ${normalizedEventKey} не задан ID цели` };
    }
    if (normalizedGoalId.length > 128) {
      return { normalized: null, error: `ID цели для события ${normalizedEventKey} слишком длинный` };
    }

    normalized[normalizedEventKey] = normalizedGoalId;
  }

  return { normalized, error: null };
};
const validateOrderNotificationPlatformSetting = (key, value) => {
  if (key !== "order_notifications_platform") return null;
  if (typeof value !== "string") {
    return "order_notifications_platform должен быть строкой";
  }
  const normalized = value.trim().toLowerCase();
  if (!ORDER_NOTIFICATION_PLATFORMS.has(normalized)) {
    return "order_notifications_platform должен быть telegram или max";
  }
  return null;
};
const validateLoyaltyNumberSetting = (key, value) => {
  if (key !== "default_bonus_expires_days") return null;
  if (!Number.isInteger(value) || value < 1) {
    return "default_bonus_expires_days должен быть целым числом не меньше 1";
  }
  return null;
};
const validateLoyaltyInfoSections = (key, value) => {
  if (key !== "loyalty_info_sections") return { normalized: value, error: null };
  if (!Array.isArray(value)) {
    return { normalized: null, error: "Ожидался JSON-массив" };
  }
  if (value.length > LOYALTY_INFO_SECTIONS_MAX_ITEMS) {
    return { normalized: null, error: `Максимум ${LOYALTY_INFO_SECTIONS_MAX_ITEMS} информационных блоков` };
  }

  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { normalized: null, error: `Блок #${index + 1}: некорректный формат` };
    }

    const title = String(item.title || "").trim();
    const description = String(item.description || "").trim();
    if (!title) {
      return { normalized: null, error: `Блок #${index + 1}: заголовок обязателен` };
    }
    if (!description) {
      return { normalized: null, error: `Блок #${index + 1}: описание обязательно` };
    }
    if (title.length > LOYALTY_INFO_TITLE_MAX_LENGTH) {
      return { normalized: null, error: `Блок #${index + 1}: заголовок не длиннее ${LOYALTY_INFO_TITLE_MAX_LENGTH} символов` };
    }
    if (description.length > LOYALTY_INFO_DESCRIPTION_MAX_LENGTH) {
      return { normalized: null, error: `Блок #${index + 1}: описание не длиннее ${LOYALTY_INFO_DESCRIPTION_MAX_LENGTH} символов` };
    }

    normalized.push({
      title,
      description,
    });
  }

  return { normalized, error: null };
};
const TELEGRAM_START_MAX_IMAGES = 20;
const TELEGRAM_START_MAX_IMAGE_WEIGHT = 1000;

const isValidAbsoluteUrl = (value) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (error) {
    return false;
  }
};

const validateTelegramStartMessage = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { normalized: null, error: "Ожидался JSON-объект для telegram_start_message" };
  }

  const enabled = value.enabled === undefined ? true : normalizeBoolean(value.enabled);
  if (enabled === null) {
    return { normalized: null, error: "Поле enabled должно быть булевым" };
  }

  const text = String(value.text || "").trim();
  if (!text && enabled) {
    return { normalized: null, error: "Текст приветствия обязателен" };
  }
  if (text && text.length > 4096) {
    return { normalized: null, error: "Текст приветствия не должен превышать 4096 символов" };
  }

  const legacyImageUrl = String(value.image_url || "").trim();
  if (legacyImageUrl && !isValidAbsoluteUrl(legacyImageUrl)) {
    return { normalized: null, error: "Поле image_url должно содержать корректный URL" };
  }
  const imagesSource = Array.isArray(value.images) ? value.images : [];
  if (imagesSource.length > TELEGRAM_START_MAX_IMAGES) {
    return { normalized: null, error: `Количество изображений не должно превышать ${TELEGRAM_START_MAX_IMAGES}` };
  }
  const normalizedImages = [];
  const imageUrls = new Set();

  for (let index = 0; index < imagesSource.length; index += 1) {
    const image = imagesSource[index];
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      return { normalized: null, error: `Изображение #${index + 1} имеет некорректный формат` };
    }

    const url = String(image.url || "").trim();
    if (!url) {
      return { normalized: null, error: `Изображение #${index + 1}: поле url обязательно` };
    }
    if (!isValidAbsoluteUrl(url)) {
      return { normalized: null, error: `Изображение #${index + 1}: поле url должно быть корректным URL` };
    }
    if (imageUrls.has(url)) {
      return { normalized: null, error: `Изображение #${index + 1}: дубликат URL` };
    }
    imageUrls.add(url);

    const weightRaw = image.weight === undefined ? 1 : Number(image.weight);
    if (!Number.isFinite(weightRaw) || weightRaw <= 0) {
      return { normalized: null, error: `Изображение #${index + 1}: weight должен быть числом больше 0` };
    }
    const weight = Math.round(weightRaw);
    if (weight > TELEGRAM_START_MAX_IMAGE_WEIGHT) {
      return { normalized: null, error: `Изображение #${index + 1}: weight не должен превышать ${TELEGRAM_START_MAX_IMAGE_WEIGHT}` };
    }

    const isActive = image.is_active === undefined ? true : normalizeBoolean(image.is_active);
    if (isActive === null) {
      return { normalized: null, error: `Изображение #${index + 1}: is_active должен быть булевым` };
    }

    normalizedImages.push({
      url,
      weight,
      is_active: isActive,
    });
  }

  if (legacyImageUrl && normalizedImages.length === 0) {
    normalizedImages.push({
      url: legacyImageUrl,
      weight: 1,
      is_active: true,
    });
  }

  const primaryImageUrl = normalizedImages.find((image) => image.is_active)?.url || normalizedImages[0]?.url || "";

  const buttonTypeRaw = String(value.button_type || "url")
    .trim()
    .toLowerCase();
  const buttonType = TELEGRAM_START_BUTTON_TYPES.has(buttonTypeRaw) ? buttonTypeRaw : null;
  if (!buttonType) {
    return { normalized: null, error: "button_type должен быть url или web_app" };
  }

  const buttonText = String(value.button_text || "").trim();
  const buttonUrl = String(value.button_url || "").trim();
  if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
    return { normalized: null, error: "Для кнопки заполните одновременно button_text и button_url" };
  }
  if (buttonUrl && !isValidAbsoluteUrl(buttonUrl)) {
    return { normalized: null, error: "Поле button_url должно содержать корректный URL" };
  }
  if (buttonType === "web_app" && buttonUrl && !buttonUrl.startsWith("https://")) {
    return { normalized: null, error: "Для кнопки web_app требуется HTTPS-ссылка" };
  }

  return {
    normalized: {
      enabled,
      text: text || TELEGRAM_START_MESSAGE_DEFAULT.text,
      image_url: primaryImageUrl,
      images: normalizedImages,
      button_type: buttonType,
      button_text: buttonText,
      button_url: buttonUrl,
    },
    error: null,
  };
};

const validateMaxStartMessage = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { normalized: null, error: "Ожидался JSON-объект для max_start_message" };
  }

  const enabled = value.enabled === undefined ? true : normalizeBoolean(value.enabled);
  if (enabled === null) {
    return { normalized: null, error: "Поле enabled должно быть булевым" };
  }

  const text = String(value.text || "").trim();
  if (!text && enabled) {
    return { normalized: null, error: "Текст приветствия обязателен" };
  }
  if (text && text.length > 4000) {
    return { normalized: null, error: "Текст приветствия не должен превышать 4000 символов" };
  }

  const legacyImageUrl = String(value.image_url || "").trim();
  if (legacyImageUrl && !isValidAbsoluteUrl(legacyImageUrl)) {
    return { normalized: null, error: "Поле image_url должно содержать корректный URL" };
  }
  const imagesSource = Array.isArray(value.images) ? value.images : [];
  if (imagesSource.length > TELEGRAM_START_MAX_IMAGES) {
    return { normalized: null, error: `Количество изображений не должно превышать ${TELEGRAM_START_MAX_IMAGES}` };
  }
  const normalizedImages = [];
  const imageUrls = new Set();
  for (let index = 0; index < imagesSource.length; index += 1) {
    const image = imagesSource[index];
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      return { normalized: null, error: `Изображение #${index + 1} имеет некорректный формат` };
    }
    const url = String(image.url || "").trim();
    if (!url) {
      return { normalized: null, error: `Изображение #${index + 1}: поле url обязательно` };
    }
    if (!isValidAbsoluteUrl(url)) {
      return { normalized: null, error: `Изображение #${index + 1}: поле url должно быть корректным URL` };
    }
    if (imageUrls.has(url)) {
      return { normalized: null, error: `Изображение #${index + 1}: дубликат URL` };
    }
    imageUrls.add(url);

    const weightRaw = image.weight === undefined ? 1 : Number(image.weight);
    if (!Number.isFinite(weightRaw) || weightRaw <= 0) {
      return { normalized: null, error: `Изображение #${index + 1}: weight должен быть числом больше 0` };
    }
    const weight = Math.round(weightRaw);
    if (weight > TELEGRAM_START_MAX_IMAGE_WEIGHT) {
      return { normalized: null, error: `Изображение #${index + 1}: weight не должен превышать ${TELEGRAM_START_MAX_IMAGE_WEIGHT}` };
    }

    const isActive = image.is_active === undefined ? true : normalizeBoolean(image.is_active);
    if (isActive === null) {
      return { normalized: null, error: `Изображение #${index + 1}: is_active должен быть булевым` };
    }

    normalizedImages.push({
      url,
      weight,
      is_active: isActive,
    });
  }

  if (legacyImageUrl && normalizedImages.length === 0) {
    normalizedImages.push({
      url: legacyImageUrl,
      weight: 1,
      is_active: true,
    });
  }

  const primaryImageUrl = normalizedImages.find((image) => image.is_active)?.url || normalizedImages[0]?.url || "";

  const buttonTypeRaw = String(value.button_type || "open_app")
    .trim()
    .toLowerCase();
  const buttonType = MAX_START_BUTTON_TYPES.has(buttonTypeRaw) ? buttonTypeRaw : null;
  if (!buttonType) {
    return { normalized: null, error: "button_type должен быть link или open_app" };
  }

  const buttonText = String(value.button_text || "").trim();
  const buttonUrl = String(value.button_url || "").trim();
  if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
    return { normalized: null, error: "Для кнопки заполните одновременно button_text и button_url" };
  }
  if (buttonUrl && !isValidAbsoluteUrl(buttonUrl)) {
    return { normalized: null, error: "Поле button_url должно содержать корректный URL" };
  }
  if (buttonType === "open_app" && buttonUrl && !buttonUrl.startsWith("https://")) {
    return { normalized: null, error: "Для кнопки open_app требуется HTTPS-ссылка" };
  }

  return {
    normalized: {
      enabled,
      text: text || MAX_START_MESSAGE_DEFAULT.text,
      image_url: primaryImageUrl,
      images: normalizedImages,
      button_type: buttonType,
      button_text: buttonText,
      button_url: buttonUrl,
    },
    error: null,
  };
};

const validateTelegramNewOrderNotification = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { normalized: null, error: "Ожидался JSON-объект для telegram_new_order_notification" };
  }

  const enabled = value.enabled === undefined ? TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT.enabled : normalizeBoolean(value.enabled);
  if (enabled === null) {
    return { normalized: null, error: "Поле enabled должно быть булевым" };
  }

  const notifyOnNewOrder =
    value.notify_on_new_order === undefined
      ? TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT.notify_on_new_order
      : normalizeBoolean(value.notify_on_new_order);
  if (notifyOnNewOrder === null) {
    return { normalized: null, error: "Поле notify_on_new_order должно быть булевым" };
  }
  const notifyOnCompleted =
    value.notify_on_completed === undefined
      ? TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT.notify_on_completed
      : normalizeBoolean(value.notify_on_completed);
  if (notifyOnCompleted === null) {
    return { normalized: null, error: "Поле notify_on_completed должно быть булевым" };
  }
  const notifyOnCancelled =
    value.notify_on_cancelled === undefined
      ? TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT.notify_on_cancelled
      : normalizeBoolean(value.notify_on_cancelled);
  if (notifyOnCancelled === null) {
    return { normalized: null, error: "Поле notify_on_cancelled должно быть булевым" };
  }
  const hasEnabledEvent = notifyOnNewOrder || notifyOnCompleted || notifyOnCancelled;

  const groupIdRaw = String(value.group_id || "").trim();
  if (enabled && hasEnabledEvent && !groupIdRaw) {
    return { normalized: null, error: "Укажите group_id для уведомлений по заказам" };
  }
  if (groupIdRaw && !/^-?\d+$/.test(groupIdRaw)) {
    return { normalized: null, error: "Поле group_id должно содержать числовой Telegram chat id" };
  }

  const useCityThreads = value.use_city_threads === undefined ? false : normalizeBoolean(value.use_city_threads);
  if (useCityThreads === null) {
    return { normalized: null, error: "Поле use_city_threads должно быть булевым" };
  }

  const sourceMap =
    value.city_thread_ids && typeof value.city_thread_ids === "object" && !Array.isArray(value.city_thread_ids) ? value.city_thread_ids : {};
  const normalizedThreadMap = {};
  for (const [cityIdRaw, threadIdRaw] of Object.entries(sourceMap)) {
    const cityId = Number(cityIdRaw);
    if (!Number.isInteger(cityId) || cityId <= 0) {
      return { normalized: null, error: "Ключи city_thread_ids должны быть положительными id города" };
    }
    const threadId = Number(threadIdRaw);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      return { normalized: null, error: "Все значения city_thread_ids должны быть положительными целыми числами" };
    }
    normalizedThreadMap[String(cityId)] = threadId;
  }
  if (useCityThreads && Object.keys(normalizedThreadMap).length === 0) {
    return { normalized: null, error: "Для режима thread по городам добавьте минимум один thread_id" };
  }

  const messageTemplate = String(value.message_template || "").trim();
  if (enabled && notifyOnNewOrder && !messageTemplate) {
    return { normalized: null, error: "Поле message_template обязательно" };
  }
  if (messageTemplate.length > 4096) {
    return { normalized: null, error: "Шаблон сообщения не должен превышать 4096 символов" };
  }

  return {
    normalized: {
      enabled,
      notify_on_new_order: notifyOnNewOrder,
      notify_on_completed: notifyOnCompleted,
      notify_on_cancelled: notifyOnCancelled,
      group_id: groupIdRaw,
      use_city_threads: useCityThreads,
      city_thread_ids: normalizedThreadMap,
      message_template: messageTemplate || TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT.message_template,
    },
    error: null,
  };
};

const validateMaxNewOrderNotification = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { normalized: null, error: "Ожидался JSON-объект для max_new_order_notification" };
  }

  const enabled = value.enabled === undefined ? MAX_NEW_ORDER_NOTIFICATION_DEFAULT.enabled : normalizeBoolean(value.enabled);
  if (enabled === null) {
    return { normalized: null, error: "Поле enabled должно быть булевым" };
  }

  const notifyOnNewOrder =
    value.notify_on_new_order === undefined
      ? MAX_NEW_ORDER_NOTIFICATION_DEFAULT.notify_on_new_order
      : normalizeBoolean(value.notify_on_new_order);
  if (notifyOnNewOrder === null) {
    return { normalized: null, error: "Поле notify_on_new_order должно быть булевым" };
  }
  const notifyOnCompleted =
    value.notify_on_completed === undefined
      ? MAX_NEW_ORDER_NOTIFICATION_DEFAULT.notify_on_completed
      : normalizeBoolean(value.notify_on_completed);
  if (notifyOnCompleted === null) {
    return { normalized: null, error: "Поле notify_on_completed должно быть булевым" };
  }
  const notifyOnCancelled =
    value.notify_on_cancelled === undefined
      ? MAX_NEW_ORDER_NOTIFICATION_DEFAULT.notify_on_cancelled
      : normalizeBoolean(value.notify_on_cancelled);
  if (notifyOnCancelled === null) {
    return { normalized: null, error: "Поле notify_on_cancelled должно быть булевым" };
  }
  const hasEnabledEvent = notifyOnNewOrder || notifyOnCompleted || notifyOnCancelled;

  const groupIdRaw = String(value.group_id || "").trim();
  if (enabled && hasEnabledEvent && !groupIdRaw) {
    return { normalized: null, error: "Укажите group_id для уведомлений по заказам" };
  }
  if (groupIdRaw && !/^-?\d+$/.test(groupIdRaw)) {
    return { normalized: null, error: "Поле group_id должно содержать числовой chat_id MAX" };
  }

  const messageTemplate = String(value.message_template || "").trim();
  if (enabled && notifyOnNewOrder && !messageTemplate) {
    return { normalized: null, error: "Поле message_template обязательно" };
  }
  if (messageTemplate.length > 4000) {
    return { normalized: null, error: "Шаблон сообщения не должен превышать 4000 символов" };
  }

  return {
    normalized: {
      enabled,
      notify_on_new_order: notifyOnNewOrder,
      notify_on_completed: notifyOnCompleted,
      notify_on_cancelled: notifyOnCancelled,
      group_id: groupIdRaw,
      message_template: messageTemplate || MAX_NEW_ORDER_NOTIFICATION_DEFAULT.message_template,
    },
    error: null,
  };
};

const resolveSettingsRuntime = (options = {}) => {
  const dbConn = options?.dbConn || db;
  const redisClient = options?.redisClient || redis;
  const cacheKey = String(options?.cacheKey || SETTINGS_CACHE_KEY).trim() || SETTINGS_CACHE_KEY;
  const cacheTtl = Number.parseInt(options?.cacheTtl || SETTINGS_CACHE_TTL, 10) || SETTINGS_CACHE_TTL;
  return { dbConn, redisClient, cacheKey, cacheTtl };
};

export const getSystemSettings = async (options = {}) => {
  const runtime = resolveSettingsRuntime(options);
  try {
    const cached = await runtime.redisClient.get(runtime.cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error("Failed to read settings cache:", error);
  }

  const [rows] = await runtime.dbConn.query("SELECT `key`, value FROM system_settings");
  const settings = {};
  const legacyEncryptionUpdates = [];

  for (const [key, meta] of Object.entries(SETTINGS_SCHEMA)) {
    settings[key] = meta.default;
  }

  for (const row of rows) {
    if (!SETTINGS_SCHEMA[row.key]) continue;
    const normalizedValue = normalizeSettingValue(row.value, SETTINGS_SCHEMA[row.key].default);
    if (ENCRYPTED_SETTING_KEYS.has(row.key) && typeof normalizedValue === "string" && normalizedValue) {
      if (ENCRYPTED_VALUE_REGEX.test(normalizedValue)) {
        try {
          settings[row.key] = decrypt(normalizedValue);
        } catch (error) {
          console.error(`Failed to decrypt setting ${row.key}:`, error);
          settings[row.key] = "";
        }
      } else {
        settings[row.key] = normalizedValue;
        try {
          legacyEncryptionUpdates.push([row.key, encrypt(normalizedValue), SETTINGS_SCHEMA[row.key].description]);
        } catch (error) {
          console.error(`Failed to encrypt legacy setting ${row.key}:`, error);
        }
      }
      continue;
    }
    settings[row.key] = normalizedValue;
  }

  if (legacyEncryptionUpdates.length > 0) {
    const connection = await runtime.dbConn.getConnection();
    try {
      await connection.beginTransaction();
      for (const [key, encryptedValue, description] of legacyEncryptionUpdates) {
        await connection.query(
          `INSERT INTO system_settings (\`key\`, value, description)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description)`,
          [key, JSON.stringify(encryptedValue), description],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Failed to backfill encrypted settings:", error);
    } finally {
      connection.release();
    }
  }

  try {
    await runtime.redisClient.set(runtime.cacheKey, JSON.stringify(settings), "EX", runtime.cacheTtl);
  } catch (error) {
    console.error("Failed to write settings cache:", error);
  }

  return settings;
};

export const getSettingsList = (settings) =>
  Object.entries(SETTINGS_SCHEMA).map(([key, meta]) => ({
    key,
    value: settings[key],
    label: meta.label,
    description: meta.description,
    group: meta.group,
    type: meta.type,
  }));

export const updateSystemSettings = async (patch, options = {}) => {
  const runtime = resolveSettingsRuntime(options);
  if (!patch || typeof patch !== "object") {
    return { updated: {}, errors: { settings: "Некорректный формат настроек" } };
  }

  const updates = {};
  const errors = {};

  for (const [key, value] of Object.entries(patch)) {
    const meta = SETTINGS_SCHEMA[key];
    if (!meta) {
      errors[key] = "Неизвестная настройка";
      continue;
    }
    if (meta.type === "boolean") {
      const normalized = normalizeBoolean(value);
      if (normalized === null) {
        errors[key] = "Ожидалось булево значение";
        continue;
      }
      updates[key] = normalized;
    } else if (meta.type === "number") {
      const normalized = normalizeNumber(value);
      if (normalized === null) {
        errors[key] = "Ожидалось числовое значение";
        continue;
      }
      const loyaltyNumberValidationError = validateLoyaltyNumberSetting(key, normalized);
      if (loyaltyNumberValidationError) {
        errors[key] = loyaltyNumberValidationError;
        continue;
      }
      updates[key] = normalized;
    } else if (meta.type === "string") {
      if (value === "") {
        updates[key] = "";
      } else {
        const normalized = normalizeString(value);
        if (normalized === null) {
          errors[key] = "Ожидалась строка";
          continue;
        }
        updates[key] = normalized;
      }
      if (key === "site_currency") {
        updates[key] = updates[key].toUpperCase() === "UZBS" ? "UZS" : updates[key].toUpperCase();
      }
      const mapsValidationError = validateMapsSetting(key, updates[key]);
      if (mapsValidationError) {
        errors[key] = mapsValidationError;
        continue;
      }
      const appearanceValidationError = validateAppearanceSetting(key, updates[key]);
      if (appearanceValidationError) {
        errors[key] = appearanceValidationError;
        continue;
      }
      const orderPlatformValidationError = validateOrderNotificationPlatformSetting(key, updates[key]);
      if (orderPlatformValidationError) {
        errors[key] = orderPlatformValidationError;
        continue;
      }
      const analyticsValidationError = validateAnalyticsSetting(key, updates[key]);
      if (analyticsValidationError) {
        errors[key] = analyticsValidationError;
        continue;
      }
    } else if (meta.type === "json") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors[key] = "Ожидался JSON-объект";
        continue;
      }
      if (key === "telegram_start_message") {
        const { normalized, error } = validateTelegramStartMessage(value);
        if (error) {
          errors[key] = error;
          continue;
        }
        updates[key] = normalized;
        continue;
      }
      if (key === "telegram_new_order_notification") {
        const { normalized, error } = validateTelegramNewOrderNotification(value);
        if (error) {
          errors[key] = error;
          continue;
        }
        updates[key] = normalized;
        continue;
      }
      if (key === "max_start_message") {
        const { normalized, error } = validateMaxStartMessage(value);
        if (error) {
          errors[key] = error;
          continue;
        }
        updates[key] = normalized;
        continue;
      }
      if (key === "max_new_order_notification") {
        const { normalized, error } = validateMaxNewOrderNotification(value);
        if (error) {
          errors[key] = error;
          continue;
        }
        updates[key] = normalized;
        continue;
      }
      if (key === "yandex_metrika_goals") {
        const { normalized, error } = validateMetrikaGoals(key, value);
        if (error) {
          errors[key] = error;
          continue;
        }
        updates[key] = normalized;
        continue;
      }
      updates[key] = value;
    } else if (meta.type === "json_array") {
      if (!Array.isArray(value)) {
        errors[key] = "Ожидался JSON-массив";
        continue;
      }
      const { normalized, error } = validateLoyaltyInfoSections(key, value);
      if (error) {
        errors[key] = error;
        continue;
      }
      updates[key] = normalized;
    } else {
      updates[key] = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { updated: {}, errors };
  }

  if (Object.keys(updates).length === 0) {
    return { updated: {}, errors: { settings: "Нет данных для обновления" } };
  }

  const connection = await runtime.dbConn.getConnection();
  try {
    await connection.beginTransaction();
    for (const [key, value] of Object.entries(updates)) {
      let valueToStore = value;
      if (ENCRYPTED_SETTING_KEYS.has(key) && typeof value === "string" && value) {
        valueToStore = ENCRYPTED_VALUE_REGEX.test(value) ? value : encrypt(value);
      }
      await connection.query(
        `INSERT INTO system_settings (
          \`key\`, value, description
        ) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description)`,
        [key, JSON.stringify(valueToStore), SETTINGS_SCHEMA[key].description],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    await runtime.redisClient.del(runtime.cacheKey);
  } catch (error) {
    console.error("Failed to clear settings cache:", error);
  }

  return { updated: updates, errors: null };
};
