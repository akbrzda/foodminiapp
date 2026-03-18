import db from "../config/database.js";

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

const SETTINGS_DEFAULTS = {
  telegram_start_message: TELEGRAM_START_MESSAGE_DEFAULT,
  telegram_new_order_notification: TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT,
  max_start_message: MAX_START_MESSAGE_DEFAULT,
  max_new_order_notification: MAX_NEW_ORDER_NOTIFICATION_DEFAULT,
  order_notifications_platform: "telegram",
};

const parseSetting = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

export const getSystemSettings = async () => {
  const [rows] = await db.query("SELECT `key`, `value` FROM system_settings");
  const settings = { ...SETTINGS_DEFAULTS };

  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    const fallback = SETTINGS_DEFAULTS[key] ?? null;
    settings[key] = parseSetting(row.value, fallback);
  }

  return settings;
};

export default {
  getSystemSettings,
  TELEGRAM_START_MESSAGE_DEFAULT,
  TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT,
  MAX_START_MESSAGE_DEFAULT,
  MAX_NEW_ORDER_NOTIFICATION_DEFAULT,
};
