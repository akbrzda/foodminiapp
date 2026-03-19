import db from "../../../config/database.js";
import { getDispatchablePlatforms } from "./channelAdapters.js";

const DEFAULT_PLATFORM_PRIORITY = ["telegram", "max"];

const unique = (items) => Array.from(new Set(items));

const normalizePlatforms = (platforms) => {
  const requested = Array.isArray(platforms) && platforms.length ? platforms : getDispatchablePlatforms();
  const normalized = requested
    .map((platform) => String(platform || "").trim().toLowerCase())
    .filter(Boolean);
  const dispatchable = new Set(getDispatchablePlatforms());
  const filtered = normalized.filter((platform) => dispatchable.has(platform));
  return unique(filtered);
};

const sortPlatformsByPriority = (platforms) => {
  const set = new Set(platforms);
  const sorted = DEFAULT_PLATFORM_PRIORITY.filter((platform) => set.has(platform));
  for (const platform of platforms) {
    if (!sorted.includes(platform)) {
      sorted.push(platform);
    }
  }
  return sorted;
};

export const buildNotificationChannelCondition = ({ userAlias = "u", platforms } = {}) => {
  const selectedPlatforms = sortPlatformsByPriority(normalizePlatforms(platforms));
  if (!selectedPlatforms.length) {
    return { sql: "1 = 0", params: [] };
  }

  const conditions = [];
  if (selectedPlatforms.includes("telegram")) {
    conditions.push("ux.telegram_id IS NOT NULL");
  }
  if (selectedPlatforms.includes("max")) {
    conditions.push("ux.max_id IS NOT NULL");
  }

  if (!conditions.length) {
    return { sql: "1 = 0", params: [] };
  }

  return {
    sql: `EXISTS (
      SELECT 1
      FROM users ux
      WHERE ux.id = ${userAlias}.id
        AND (${conditions.join(" OR ")})
    )`,
    params: [],
  };
};

export const resolvePreferredNotificationChannelForUser = async (userId, { platforms } = {}) => {
  const selectedPlatforms = sortPlatformsByPriority(normalizePlatforms(platforms));
  if (!userId || !selectedPlatforms.length) return null;

  const [rows] = await db.query(
    `SELECT telegram_id, max_id
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );

  const user = rows[0];
  if (!user) return null;

  for (const platform of selectedPlatforms) {
    if (platform === "telegram" && user.telegram_id !== null && user.telegram_id !== undefined) {
      return {
        platform: "telegram",
        externalId: String(user.telegram_id),
        source: "users.telegram_id",
      };
    }
    if (platform === "max" && user.max_id !== null && user.max_id !== undefined) {
      return {
        platform: "max",
        externalId: String(user.max_id),
        source: "users.max_id",
      };
    }
  }
  return null;
};

export default {
  buildNotificationChannelCondition,
  resolvePreferredNotificationChannelForUser,
};
