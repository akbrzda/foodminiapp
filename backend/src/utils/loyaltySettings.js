import db from "../config/database.js";
import redis from "../config/redis.js";

const LOYALTY_SETTINGS_CACHE_KEY = "loyalty_settings";
const LOYALTY_SETTINGS_CACHE_TTL = 600;

export const LOYALTY_SETTINGS_SCHEMA = {
  include_delivery_in_earn: {
    default: false,
    label: "Учитывать доставку при начислении",
    description: "Включать стоимость доставки в сумму для расчёта начисляемых бонусов за заказ",
    group: "Начисление",
    type: "boolean",
  },
  calculate_from_amount_after_bonus: {
    default: true,
    label: "Начислять после вычета бонусов",
    description: "Рассчитывать бонусы от суммы заказа после списания использованных бонусов",
    group: "Начисление",
    type: "boolean",
  },
  level_calculation_period_days: {
    default: 60,
    label: "Период для расчёта уровня (дней)",
    description: "За сколько последних дней учитывать сумму заказов при определении уровня клиента",
    group: "Уровни",
    type: "number",
  },
  bonus_max_redeem_percent: {
    default: 0.2,
    label: "Максимальный процент списания",
    description: "Глобальный лимит списания бонусов от суммы заказа (в процентах)",
    group: "Начисление",
    type: "number",
  },
  level_degradation_enabled: {
    default: true,
    label: "Деградация уровня",
    description: "Автоматическое понижение уровня при длительном отсутствии заказов",
    group: "Уровни",
    type: "boolean",
  },
  level_degradation_period_days: {
    default: 180,
    label: "Период неактивности для деградации (дней)",
    description: "Через сколько дней без заказов понижать уровень клиента на один",
    group: "Уровни",
    type: "number",
  },
  registration_bonus_enabled: {
    default: true,
    label: "Бонус за регистрацию",
    description: "Автоматическое начисление приветственных бонусов новым клиентам",
    group: "Регистрация",
    type: "boolean",
  },
  registration_bonus_amount: {
    default: 1000,
    label: "Сумма бонусов за регистрацию",
    description: "Количество приветственных бонусов для новых клиентов",
    group: "Регистрация",
    type: "number",
  },
  registration_bonus_expires_days: {
    default: 30,
    label: "Срок действия регистрационных (дней)",
    description: "Через сколько дней сгорают приветственные бонусы",
    group: "Регистрация",
    type: "number",
  },
  birthday_bonus_enabled: {
    default: true,
    label: "Бонус на день рождения",
    description: "Автоматическое начисление поздравительных бонусов в день рождения клиента",
    group: "День рождения",
    type: "boolean",
  },
  birthday_bonus_amount: {
    default: 500,
    label: "Сумма бонусов на день рождения",
    description: "Количество поздравительных бонусов для именинников",
    group: "День рождения",
    type: "number",
  },
  birthday_bonus_days_before: {
    default: 3,
    label: "Дней до дня рождения",
    description: "За сколько дней до даты рождения начислять поздравительный бонус",
    group: "День рождения",
    type: "number",
  },
  birthday_bonus_days_after: {
    default: 7,
    label: "Срок действия после ДР (дней)",
    description: "Сколько дней действуют поздравительные бонусы после дня рождения",
    group: "День рождения",
    type: "number",
  },
  default_bonus_expires_days: {
    default: 60,
    label: "Срок действия бонусов за заказы (дней)",
    description: "Через сколько дней сгорают обычные бонусы, начисленные за заказы",
    group: "Сроки действия",
    type: "number",
  },
};

const normalizeBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
};

const normalizeNumber = (value, fallback) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const normalizeString = (value, fallback) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const normalizeValue = (value, meta) => {
  if (meta.type === "boolean") return normalizeBoolean(value, meta.default);
  if (meta.type === "number") return normalizeNumber(value, meta.default);
  if (meta.type === "string") return normalizeString(value, meta.default);
  return value ?? meta.default;
};

const buildDefaults = () => {
  const defaults = {};
  for (const [key, meta] of Object.entries(LOYALTY_SETTINGS_SCHEMA)) {
    defaults[key] = meta.default;
  }
  return defaults;
};

export const getLoyaltySettings = async () => {
  try {
    const cached = await redis.get(LOYALTY_SETTINGS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error("Failed to read loyalty settings cache:", error);
  }

  const defaults = buildDefaults();
  const [rows] = await db.query("SELECT * FROM loyalty_settings WHERE id = 1");
  const record = rows[0] || null;
  const settings = { ...defaults };

  if (record) {
    for (const [key, meta] of Object.entries(LOYALTY_SETTINGS_SCHEMA)) {
      settings[key] = normalizeValue(record[key], meta);
    }
  } else {
    await db.query("INSERT INTO loyalty_settings (id) VALUES (1)");
  }

  try {
    await redis.set(LOYALTY_SETTINGS_CACHE_KEY, JSON.stringify(settings), "EX", LOYALTY_SETTINGS_CACHE_TTL);
  } catch (error) {
    console.error("Failed to write loyalty settings cache:", error);
  }

  return settings;
};

export const getLoyaltySettingsList = (settings) =>
  Object.entries(LOYALTY_SETTINGS_SCHEMA)
    .filter(([key]) => !key.startsWith("loyalty_level_"))
    .map(([key, meta]) => ({
      key,
      value: settings[key],
      label: meta.label,
      description: meta.description,
      group: meta.group,
      type: meta.type,
    }));

export const updateLoyaltySettings = async (patch) => {
  if (!patch || typeof patch !== "object") {
    return { updated: {}, errors: { settings: "Некорректный формат настроек" } };
  }

  const updates = {};
  const errors = {};

  for (const [key, value] of Object.entries(patch)) {
    const meta = LOYALTY_SETTINGS_SCHEMA[key];
    if (!meta) {
      errors[key] = "Неизвестная настройка";
      continue;
    }
    if (meta.type === "boolean") {
      const normalized = normalizeBoolean(value, null);
      if (normalized === null) {
        errors[key] = "Ожидалось булево значение";
        continue;
      }
      updates[key] = normalized;
    } else if (meta.type === "number") {
      const normalized = normalizeNumber(value, null);
      if (normalized === null) {
        errors[key] = "Ожидалось числовое значение";
        continue;
      }
      updates[key] = normalized;
    } else if (meta.type === "string") {
      const normalized = normalizeString(value, null);
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

  const keys = Object.keys(updates);
  const values = keys.map((key) => updates[key]);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("INSERT INTO loyalty_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id");
    await connection.query(`UPDATE loyalty_settings SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = 1`, values);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    await redis.del(LOYALTY_SETTINGS_CACHE_KEY);
  } catch (error) {
    console.error("Failed to clear loyalty settings cache:", error);
  }

  return { updated: updates, errors: null };
};

export default {
  LOYALTY_SETTINGS_SCHEMA,
  getLoyaltySettings,
  getLoyaltySettingsList,
  updateLoyaltySettings,
};
