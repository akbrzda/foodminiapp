import db from "../config/database.js";
import redis from "../config/redis.js";

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

const TELEGRAM_START_BUTTON_TYPES = new Set(["url", "web_app"]);

export const SETTINGS_SCHEMA = {
  bonuses_enabled: {
    default: true,
    label: "Бонусная система",
    description: "Начисление и списание бонусов",
    group: "Лояльность",
    type: "boolean",
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
  telegram_start_message: {
    default: TELEGRAM_START_MESSAGE_DEFAULT,
    label: "Приветственное сообщение /start",
    description: "Текст, изображение и кнопка для команды /start в Telegram-боте",
    group: "Telegram",
    type: "json",
  },
  telegram_new_order_notification: {
    default: TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT,
    label: "Telegram-уведомления по заказам",
    description: "События уведомлений (новый/завершен/отменен), группа, thread по городам и шаблон нового заказа",
    group: "Telegram",
    type: "json",
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
  iiko_preserve_local_names: {
    default: true,
    label: "Сохранять локальные названия iiko",
    description: "Не перезаписывать локально измененные названия при синхронизации меню iiko",
    group: "Интеграции",
    type: "boolean",
  },
  iiko_webhook_secret: {
    default: "",
    label: "iiko Webhook Secret",
    description: "Секрет проверки подписи webhook iiko",
    group: "Интеграции",
    type: "string",
  },
  premiumbonus_enabled: {
    default: false,
    label: "Интеграция PremiumBonus",
    description: "Включает синхронизацию клиентов и лояльности",
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

  const buttonTypeRaw = String(value.button_type || "url").trim().toLowerCase();
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
    value.city_thread_ids && typeof value.city_thread_ids === "object" && !Array.isArray(value.city_thread_ids)
      ? value.city_thread_ids
      : {};
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

export const getSystemSettings = async () => {
  try {
    const cached = await redis.get(SETTINGS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error("Failed to read settings cache:", error);
  }

  const [rows] = await db.query("SELECT `key`, value FROM system_settings");
  const settings = {};

  for (const [key, meta] of Object.entries(SETTINGS_SCHEMA)) {
    settings[key] = meta.default;
  }

  for (const row of rows) {
    if (!SETTINGS_SCHEMA[row.key]) continue;
    settings[row.key] = normalizeSettingValue(row.value, SETTINGS_SCHEMA[row.key].default);
  }

  try {
    await redis.set(SETTINGS_CACHE_KEY, JSON.stringify(settings), "EX", SETTINGS_CACHE_TTL);
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

export const updateSystemSettings = async (patch) => {
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
      updates[key] = value;
    } else if (meta.type === "json_array") {
      if (!Array.isArray(value)) {
        errors[key] = "Ожидался JSON-массив";
        continue;
      }
      updates[key] = value;
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

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const [key, value] of Object.entries(updates)) {
      await connection.query(
        `INSERT INTO system_settings (
          \`key\`, value, description
        ) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description)`,
        [key, JSON.stringify(value), SETTINGS_SCHEMA[key].description],
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
    await redis.del(SETTINGS_CACHE_KEY);
  } catch (error) {
    console.error("Failed to clear settings cache:", error);
  }

  return { updated: updates, errors: null };
};
