import db from "../config/database.js";
import redis from "../config/redis.js";

const LOYALTY_SETTINGS_CACHE_KEY = "loyalty_settings";
const LOYALTY_SETTINGS_CACHE_TTL = 600;

export const LOYALTY_SETTINGS_SCHEMA = {
  bonus_max_redeem_percent: {
    default: 0.3,
    label: "Максимальный процент списания",
    description: "Доля от суммы заказа, доступная к списанию бонусами",
    group: "Списание",
    type: "number",
  },
  loyalty_level_1_name: {
    default: "Бронза",
    label: "Название уровня 1",
    description: "Название первого уровня лояльности",
    group: "Уровни",
    type: "string",
  },
  loyalty_level_2_name: {
    default: "Серебро",
    label: "Название уровня 2",
    description: "Название второго уровня лояльности",
    group: "Уровни",
    type: "string",
  },
  loyalty_level_3_name: {
    default: "Золото",
    label: "Название уровня 3",
    description: "Название третьего уровня лояльности",
    group: "Уровни",
    type: "string",
  },
  loyalty_level_1_rate: {
    default: 0.03,
    label: "Процент начисления для уровня 1",
    description: "Начисление бонусов для уровня 1",
    group: "Начисление",
    type: "number",
  },
  loyalty_level_2_rate: {
    default: 0.05,
    label: "Процент начисления для уровня 2",
    description: "Начисление бонусов для уровня 2",
    group: "Начисление",
    type: "number",
  },
  loyalty_level_3_rate: {
    default: 0.07,
    label: "Процент начисления для уровня 3",
    description: "Начисление бонусов для уровня 3",
    group: "Начисление",
    type: "number",
  },
  loyalty_level_1_redeem_percent: {
    default: 0.3,
    label: "Процент списания для уровня 1",
    description: "Максимальная доля списания бонусами для уровня 1",
    group: "Списание",
    type: "number",
  },
  loyalty_level_2_redeem_percent: {
    default: 0.3,
    label: "Процент списания для уровня 2",
    description: "Максимальная доля списания бонусами для уровня 2",
    group: "Списание",
    type: "number",
  },
  loyalty_level_3_redeem_percent: {
    default: 0.3,
    label: "Процент списания для уровня 3",
    description: "Максимальная доля списания бонусами для уровня 3",
    group: "Списание",
    type: "number",
  },
  loyalty_level_2_threshold: {
    default: 10000,
    label: "Порог уровня 2",
    description: "Сумма заказов для перехода на уровень 2",
    group: "Уровни",
    type: "number",
  },
  loyalty_level_3_threshold: {
    default: 20000,
    label: "Порог уровня 3",
    description: "Сумма заказов для перехода на уровень 3",
    group: "Уровни",
    type: "number",
  },
  include_delivery_in_earn: {
    default: false,
    label: "Учитывать доставку при начислении",
    description: "Если выключено, доставка не участвует в расчете бонусов",
    group: "Начисление",
    type: "boolean",
  },
  calculate_from_amount_after_bonus: {
    default: true,
    label: "Начислять после вычета бонусов",
    description: "Если включено, бонусы начисляются от суммы после списаний",
    group: "Начисление",
    type: "boolean",
  },
  level_calculation_period_days: {
    default: 60,
    label: "Период расчета уровня",
    description: "Количество дней для расчета суммы заказов",
    group: "Уровни",
    type: "number",
  },
  level_calculation_include_delivery: {
    default: false,
    label: "Учитывать доставку в уровне",
    description: "Если включено, доставка участвует в расчете уровня",
    group: "Уровни",
    type: "boolean",
  },
  level_degradation_enabled: {
    default: true,
    label: "Деградация уровня",
    description: "Понижение уровня при отсутствии заказов",
    group: "Уровни",
    type: "boolean",
  },
  level_degradation_period_days: {
    default: 180,
    label: "Период деградации",
    description: "Количество дней без заказов для понижения уровня",
    group: "Уровни",
    type: "number",
  },
  registration_bonus_enabled: {
    default: true,
    label: "Бонус за регистрацию",
    description: "Автоматическое начисление при регистрации",
    group: "Регистрация",
    type: "boolean",
  },
  registration_bonus_amount: {
    default: 1000,
    label: "Сумма бонусов за регистрацию",
    description: "Количество бонусов за регистрацию",
    group: "Регистрация",
    type: "number",
  },
  registration_bonus_expires_days: {
    default: 30,
    label: "Срок регистрации",
    description: "Срок действия регистрационных бонусов (дни)",
    group: "Регистрация",
    type: "number",
  },
  birthday_bonus_enabled: {
    default: true,
    label: "Бонус на день рождения",
    description: "Автоматическое начисление на день рождения",
    group: "День рождения",
    type: "boolean",
  },
  birthday_bonus_amount: {
    default: 500,
    label: "Сумма бонусов на день рождения",
    description: "Количество бонусов на день рождения",
    group: "День рождения",
    type: "number",
  },
  birthday_bonus_days_before: {
    default: 3,
    label: "Дней до дня рождения",
    description: "За сколько дней начислять бонус",
    group: "День рождения",
    type: "number",
  },
  birthday_bonus_days_after: {
    default: 7,
    label: "Дней после дня рождения",
    description: "Сколько дней бонус действует после дня рождения",
    group: "День рождения",
    type: "number",
  },
  default_bonus_expires_days: {
    default: 60,
    label: "Срок обычных бонусов",
    description: "Срок действия начисленных бонусов (дни)",
    group: "Сроки",
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
