import db from "../../../config/database.js";

const BASE_SELECT = `SELECT
  sc.id, sc.tag, sc.title, sc.channel_id, sc.channel_url, sc.welcome_message, sc.success_message, sc.error_message,
  sc.media_type, sc.media_url, sc.is_reward_unique, sc.is_active, sc.is_perpetual, sc.start_date, sc.end_date,
  sc.created_at, sc.updated_at
FROM subscription_campaigns sc`;

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeSortDirection = (value) => {
  if (String(value || "").toLowerCase() === "asc") return "ASC";
  return "DESC";
};

const parseCampaignRow = (row) => ({
  ...row,
  is_reward_unique: Boolean(row.is_reward_unique),
  is_active: Boolean(row.is_active),
  is_perpetual: Boolean(row.is_perpetual),
});

const normalizePagination = ({ page = 1, limit = 20 }) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
};

const parseSubscriptionCampaignPayload = (payload, { isUpdate = false } = {}) => {
  const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const fromPayload = (field, transform) => {
    if (isUpdate && !hasField(field)) return undefined;
    const source = payload[field];
    return transform ? transform(source) : source;
  };

  const parsed = {
    tag: fromPayload("tag", (value) => value?.trim()),
    title: fromPayload("title", (value) => value?.trim()),
    channel_id: fromPayload("channel_id", (value) => value?.trim()),
    channel_url: fromPayload("channel_url", (value) => value?.trim()),
    welcome_message: fromPayload("welcome_message", (value) => value?.trim()),
    success_message: fromPayload("success_message", (value) => value?.trim()),
    error_message: fromPayload("error_message", (value) => value?.trim()),
    media_type: fromPayload("media_type", (value) => (value ? String(value).trim().toLowerCase() : null)),
    media_url: fromPayload("media_url", (value) => value?.trim() || null),
    is_reward_unique: fromPayload("is_reward_unique", (value) => normalizeBoolean(value, false)),
    is_active: fromPayload("is_active", (value) => normalizeBoolean(value, true)),
    is_perpetual: fromPayload("is_perpetual", (value) => normalizeBoolean(value, false)),
    start_date: fromPayload("start_date", normalizeDateTime),
    end_date: fromPayload("end_date", normalizeDateTime),
  };

  const requiredFields = ["tag", "title", "channel_id", "channel_url", "welcome_message", "success_message", "error_message"];
  if (!isUpdate) {
    const missingField = requiredFields.find((field) => !parsed[field]);
    if (missingField) {
      const error = new Error(`Обязательное поле не заполнено: ${missingField}`);
      error.status = 400;
      throw error;
    }
  }

  if (parsed.tag !== undefined) {
    if (!parsed.tag || !/^[a-zA-Z0-9_-]{2,50}$/.test(parsed.tag)) {
      const error = new Error("Тег должен содержать 2-50 символов: латиница, цифры, '_' или '-'");
      error.status = 400;
      throw error;
    }
  }

  if (parsed.channel_id !== undefined) {
    const validChannelId = /^@[\w\d_]{4,100}$/.test(parsed.channel_id || "") || /^-100\d{5,30}$/.test(parsed.channel_id || "");
    if (!validChannelId) {
      const error = new Error("Некорректный channel_id. Ожидается @channel или -100...");
      error.status = 400;
      throw error;
    }
  }

  if (parsed.channel_url !== undefined) {
    const validChannelUrl = /^https:\/\/t\.me\/[\w\d_]{4,100}$/i.test(parsed.channel_url || "");
    if (!validChannelUrl) {
      const error = new Error("Некорректный channel_url. Ожидается формат https://t.me/<channel>");
      error.status = 400;
      throw error;
    }
  }

  if (parsed.media_type && !["photo", "video"].includes(parsed.media_type)) {
    const error = new Error("media_type поддерживает только значения: photo, video");
    error.status = 400;
    throw error;
  }

  if (parsed.media_url && !/^https?:\/\//i.test(parsed.media_url)) {
    const error = new Error("media_url должен быть абсолютным URL");
    error.status = 400;
    throw error;
  }

  if (!parsed.is_perpetual) {
    if (parsed.start_date && parsed.end_date && parsed.start_date > parsed.end_date) {
      const error = new Error("Дата начала не может быть позже даты завершения");
      error.status = 400;
      throw error;
    }
    if (!isUpdate && (!parsed.start_date || !parsed.end_date)) {
      const error = new Error("Для непостоянной кампании обязательны start_date и end_date");
      error.status = 400;
      throw error;
    }
  } else {
    parsed.start_date = null;
    parsed.end_date = null;
  }

  if (isUpdate) {
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
  }
  return parsed;
};

export const createSubscriptionCampaign = async (payload) => {
  const data = parseSubscriptionCampaignPayload(payload, { isUpdate: false });
  const [result] = await db.query(
    `INSERT INTO subscription_campaigns
      (tag, title, channel_id, channel_url, welcome_message, success_message, error_message, media_type, media_url,
       is_reward_unique, is_active, is_perpetual, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tag,
      data.title,
      data.channel_id,
      data.channel_url,
      data.welcome_message,
      data.success_message,
      data.error_message,
      data.media_type,
      data.media_url,
      data.is_reward_unique ? 1 : 0,
      data.is_active ? 1 : 0,
      data.is_perpetual ? 1 : 0,
      data.start_date,
      data.end_date,
    ],
  );
  return getSubscriptionCampaignById(result.insertId);
};

export const getSubscriptionCampaignById = async (campaignId) => {
  const [rows] = await db.query(`${BASE_SELECT} WHERE sc.id = ? LIMIT 1`, [campaignId]);
  if (!rows.length) return null;
  return parseCampaignRow(rows[0]);
};

export const updateSubscriptionCampaign = async (campaignId, payload) => {
  const existing = await getSubscriptionCampaignById(campaignId);
  if (!existing) return null;

  const parsedPayload = parseSubscriptionCampaignPayload(payload, { isUpdate: true });
  const merged = {
    ...existing,
    ...parsedPayload,
  };
  parseSubscriptionCampaignPayload(merged, { isUpdate: false });

  const updates = [];
  const values = [];
  for (const [field, value] of Object.entries(parsedPayload)) {
    updates.push(`${field} = ?`);
    if (["is_reward_unique", "is_active", "is_perpetual"].includes(field)) {
      values.push(value ? 1 : 0);
    } else {
      values.push(value);
    }
  }

  if (!updates.length) return existing;

  values.push(campaignId);
  await db.query(`UPDATE subscription_campaigns SET ${updates.join(", ")} WHERE id = ?`, values);
  return getSubscriptionCampaignById(campaignId);
};

export const deleteSubscriptionCampaign = async (campaignId) => {
  const [result] = await db.query("DELETE FROM subscription_campaigns WHERE id = ?", [campaignId]);
  return result.affectedRows > 0;
};

export const listSubscriptionCampaigns = async (filters = {}) => {
  const { page, limit, offset } = normalizePagination(filters);
  const where = [];
  const params = [];

  if (filters.search) {
    where.push("(sc.title LIKE ? OR sc.tag LIKE ?)");
    params.push(`%${String(filters.search).trim()}%`, `%${String(filters.search).trim()}%`);
  }
  if (filters.is_active !== undefined && filters.is_active !== "") {
    where.push("sc.is_active = ?");
    params.push(normalizeBoolean(filters.is_active, true) ? 1 : 0);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [items] = await db.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY sc.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [totalRows] = await db.query(`SELECT COUNT(*) as total FROM subscription_campaigns sc ${whereSql}`, params);
  const total = Number(totalRows[0]?.total || 0);

  return {
    items: items.map(parseCampaignRow),
    pagination: {
      total,
      page,
      limit,
      totalPages: total > 0 ? Math.ceil(total / limit) : 1,
    },
  };
};

export const getSubscriptionCampaignStats = async (campaignId) => {
  const [rows] = await db.query(
    `SELECT
       COUNT(sa.id) as participants_total,
       SUM(sa.attempts_count) as checks_total,
       SUM(CASE WHEN sa.first_subscribed_at IS NOT NULL THEN 1 ELSE 0 END) as subscribed_total,
       SUM(CASE WHEN sa.is_currently_subscribed = 1 THEN 1 ELSE 0 END) as currently_subscribed_total,
       SUM(sa.rewards_claimed_count) as rewards_claimed_total
     FROM subscription_attempts sa
     WHERE sa.campaign_id = ?`,
    [campaignId],
  );

  const stats = rows[0] || {};
  const participantsTotal = Number(stats.participants_total || 0);
  const subscribedTotal = Number(stats.subscribed_total || 0);
  const conversionRate = participantsTotal > 0 ? (subscribedTotal / participantsTotal) * 100 : 0;

  return {
    participants_total: participantsTotal,
    checks_total: Number(stats.checks_total || 0),
    subscribed_total: subscribedTotal,
    currently_subscribed_total: Number(stats.currently_subscribed_total || 0),
    rewards_claimed_total: Number(stats.rewards_claimed_total || 0),
    conversion_rate: Number(conversionRate.toFixed(2)),
  };
};

export const listSubscriptionCampaignParticipants = async (campaignId, filters = {}) => {
  const { page, limit, offset } = normalizePagination(filters);
  const where = ["sa.campaign_id = ?"];
  const params = [campaignId];
  const sortByMap = {
    created_at: "sa.created_at",
    first_click_at: "sa.first_click_at",
    last_check_at: "sa.last_check_at",
    first_subscribed_at: "sa.first_subscribed_at",
    rewards_claimed_count: "sa.rewards_claimed_count",
    attempts_count: "sa.attempts_count",
  };

  if (filters.is_currently_subscribed !== undefined && filters.is_currently_subscribed !== "") {
    where.push("sa.is_currently_subscribed = ?");
    params.push(normalizeBoolean(filters.is_currently_subscribed, true) ? 1 : 0);
  }

  if (filters.date_from) {
    const parsed = normalizeDateTime(filters.date_from);
    if (parsed) {
      where.push("sa.first_click_at >= ?");
      params.push(parsed);
    }
  }
  if (filters.date_to) {
    const parsed = normalizeDateTime(filters.date_to);
    if (parsed) {
      where.push("sa.first_click_at <= ?");
      params.push(parsed);
    }
  }

  if (filters.search) {
    const searchValue = `%${String(filters.search).trim()}%`;
    where.push("(u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR CAST(sa.telegram_id AS CHAR) LIKE ?)");
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  const sortColumn = sortByMap[String(filters.sort_by || "").toLowerCase()] || "sa.created_at";
  const sortDirection = normalizeSortDirection(filters.sort_order);
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [items] = await db.query(
    `SELECT
       sa.id, sa.user_id, sa.telegram_id, sa.first_click_at, sa.last_check_at, sa.first_subscribed_at, sa.last_reward_claimed_at,
       sa.attempts_count, sa.rewards_claimed_count, sa.is_currently_subscribed, sa.created_at, sa.updated_at,
       u.first_name, u.last_name, u.phone
     FROM subscription_attempts sa
     JOIN users u ON u.id = sa.user_id
     ${whereSql}
     ORDER BY ${sortColumn} ${sortDirection}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [totalRows] = await db.query(`SELECT COUNT(*) as total FROM subscription_attempts sa JOIN users u ON u.id = sa.user_id ${whereSql}`, params);
  const total = Number(totalRows[0]?.total || 0);

  return {
    items: items.map((item) => ({
      ...item,
      is_currently_subscribed: Boolean(item.is_currently_subscribed),
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: total > 0 ? Math.ceil(total / limit) : 1,
    },
  };
};

export const exportSubscriptionCampaignParticipants = async (campaignId, filters = {}) => {
  const allItems = [];
  let page = 1;
  let totalPages = 1;

  do {
    const batch = await listSubscriptionCampaignParticipants(campaignId, {
      ...filters,
      page,
      limit: 100,
    });
    allItems.push(...batch.items);
    totalPages = batch.pagination.totalPages || 1;
    page += 1;
  } while (page <= totalPages);

  return allItems;
};

export default {
  createSubscriptionCampaign,
  getSubscriptionCampaignById,
  updateSubscriptionCampaign,
  deleteSubscriptionCampaign,
  listSubscriptionCampaigns,
  getSubscriptionCampaignStats,
  listSubscriptionCampaignParticipants,
  exportSubscriptionCampaignParticipants,
};
