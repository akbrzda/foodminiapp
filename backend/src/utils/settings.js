import db from "../config/database.js";
import redis from "../config/redis.js";

const SETTINGS_CACHE_KEY = "settings";
const SETTINGS_CACHE_TTL = 600;

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
      const normalized = normalizeString(value);
      if (normalized === null) {
        errors[key] = "Ожидалась непустая строка";
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
