import db from "../../../config/database.js";
import { getCachedUserBroadcast, setCachedUserBroadcast } from "../utils/cache.js";

const ORDER_STATUSES = ["completed", "delivered"];

const getDaysBetween = (fromDate, toDate) => {
  if (!fromDate || !toDate) return null;
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const diff = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
};

const normalizeString = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

export function buildPersonalizedText(template, data) {
  const safeTemplate = template || "";
  return safeTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    if (!data || data[key] === undefined || data[key] === null) return "";
    return normalizeString(data[key]);
  });
}

export async function getUserBroadcastData(userId) {
  const cached = await getCachedUserBroadcast(userId);
  if (cached) return cached;
  const dataMap = await getUsersBroadcastData([userId]);
  return dataMap[userId] || null;
}

export async function getUsersBroadcastData(userIds) {
  const ids = Array.from(new Set(userIds || [])).filter(Boolean);
  if (!ids.length) return {};

  const cachedEntries = await Promise.all(ids.map((id) => getCachedUserBroadcast(id)));
  const result = {};
  const missingIds = [];

  ids.forEach((id, index) => {
    const cached = cachedEntries[index];
    if (cached) {
      result[id] = cached;
    } else {
      missingIds.push(id);
    }
  });

  if (!missingIds.length) return result;

  const [rows] = await db.query(
    `SELECT u.id as user_id,
            u.telegram_id,
            u.first_name,
            u.last_name,
            u.phone,
            u.created_at,
            u.timezone as user_timezone,
            u.current_loyalty_level_id,
            u.loyalty_balance,
            ll.name as loyalty_level_name,
            us.selected_city_id,
            c.timezone as city_timezone,
            MAX(o.created_at) as last_order_at,
            COUNT(o.id) as total_orders,
            COALESCE(SUM(o.total), 0) as total_spent
     FROM users u
     LEFT JOIN loyalty_levels ll ON ll.id = u.current_loyalty_level_id
     LEFT JOIN user_states us ON us.user_id = u.id
     LEFT JOIN cities c ON c.id = us.selected_city_id
     LEFT JOIN orders o ON o.user_id = u.id AND o.status IN (${ORDER_STATUSES.map(() => "?").join(", ")})
     WHERE u.id IN (?)
     GROUP BY u.id`,
    [...ORDER_STATUSES, missingIds],
  );

  const now = new Date();
  for (const row of rows) {
    const daysSinceOrder = getDaysBetween(row.last_order_at || row.created_at, now);
    const payload = {
      user_id: row.user_id,
      telegram_id: row.telegram_id,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      phone: row.phone || "",
      loyalty_level: row.loyalty_level_name || "",
      loyalty_level_id: row.current_loyalty_level_id,
      bonus_balance: row.loyalty_balance ?? 0,
      days_since_order: daysSinceOrder ?? "",
      total_orders: row.total_orders ?? 0,
      total_spent: row.total_spent ?? 0,
      timezone: row.user_timezone || row.city_timezone || "Europe/Moscow",
      city_id: row.selected_city_id || null,
    };
    result[row.user_id] = payload;
    await setCachedUserBroadcast(row.user_id, payload);
  }

  return result;
}

export default {
  buildPersonalizedText,
  getUserBroadcastData,
  getUsersBroadcastData,
};
