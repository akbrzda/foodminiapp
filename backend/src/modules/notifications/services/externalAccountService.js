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

const buildFieldOrderSql = (column, platforms) => {
  if (!platforms.length) return { sql: `${column} ASC`, params: [] };
  return {
    sql: `FIELD(${column}, ${platforms.map(() => "?").join(", ")}), ${column} ASC`,
    params: platforms,
  };
};

export const buildNotificationChannelCondition = ({ userAlias = "u", platforms } = {}) => {
  const selectedPlatforms = sortPlatformsByPriority(normalizePlatforms(platforms));
  if (!selectedPlatforms.length) {
    return { sql: "1 = 0", params: [] };
  }

  return {
    sql: `EXISTS (
      SELECT 1
      FROM user_external_accounts uea
      WHERE uea.user_id = ${userAlias}.id
        AND uea.platform IN (${selectedPlatforms.map(() => "?").join(", ")})
    )`,
    params: selectedPlatforms,
  };
};

export const resolvePreferredNotificationChannelForUser = async (userId, { platforms } = {}) => {
  const selectedPlatforms = sortPlatformsByPriority(normalizePlatforms(platforms));
  if (!userId || !selectedPlatforms.length) return null;

  const orderBy = buildFieldOrderSql("uea.platform", selectedPlatforms);
  const [accounts] = await db.query(
    `SELECT uea.platform, uea.external_id
     FROM user_external_accounts uea
     WHERE uea.user_id = ?
       AND uea.platform IN (${selectedPlatforms.map(() => "?").join(", ")})
     ORDER BY ${orderBy.sql}, uea.id ASC
     LIMIT 1`,
    [userId, ...selectedPlatforms, ...orderBy.params],
  );

  const account = accounts[0];
  if (account?.platform && account?.external_id) {
    return {
      platform: String(account.platform).toLowerCase(),
      externalId: String(account.external_id),
      source: "user_external_accounts",
    };
  }
  return null;
};

export default {
  buildNotificationChannelCondition,
  resolvePreferredNotificationChannelForUser,
};
