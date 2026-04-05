import {
  getIntegrationSettings,
  getPremiumBonusClientOrNull,
} from "../services/integrationConfigService.js";
import * as localLoyaltyService from "../../loyalty/services/loyaltyService.js";
import db from "../../../config/database.js";
import redis from "../../../config/redis.js";

const DEFAULT_MAX_SPEND_PERCENT = 0.2;
const DEFAULT_LEVEL_THRESHOLDS = [0, 10000, 20000];
const PB_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const PB_CACHE_VERSION = 5;
const PB_EXPIRE_PACKAGES_CACHE_TTL_SECONDS = 60 * 60 * 24 * 45;
const PB_EXPIRING_WINDOW_DAYS = 14;
const PB_HISTORY_EXTERNAL_SOURCES = ["pb_purchase_list", "pb_buyer_bonus"];

function normalizePhoneForPremiumBonus(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBonusAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return Math.ceil(parsed);
  return Math.floor(parsed);
}

function parseIsoDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatDateForSqlTimestamp(value) {
  const iso = parseIsoDateOrNull(value);
  if (!iso) return null;
  return iso.slice(0, 19).replace("T", " ");
}

function parseBonusPackageAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Number(parsed.toFixed(2));
}

function buildPremiumBonusExpiringBonuses({
  buyerBonusPackages = [],
  windowDays = PB_EXPIRING_WINDOW_DAYS,
  now = new Date(),
} = {}) {
  const nowTs = now.getTime();
  const windowEndTs = nowTs + Math.max(1, Number(windowDays) || PB_EXPIRING_WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const items = [];

  for (const pkg of Array.isArray(buyerBonusPackages) ? buyerBonusPackages : []) {
    const amountRaw = parseBonusPackageAmount(pkg?.bonus);
    const amount = normalizeBonusAmount(amountRaw);
    if (amount <= 0) continue;

    const activationAt = parseIsoDateOrNull(pkg?.activation_at);
    const explicitExpireAt = parseIsoDateOrNull(pkg?.expire_at);
    const expireAt = explicitExpireAt;
    if (!expireAt) continue;

    const expireTs = new Date(expireAt).getTime();
    if (!Number.isFinite(expireTs)) continue;
    if (expireTs < nowTs || expireTs > windowEndTs) continue;

    const daysLeft = Math.max(0, Math.ceil((expireTs - nowTs) / (24 * 60 * 60 * 1000)));
    const id = [
      String(activationAt || ""),
      String(expireAt),
      String(amount),
      "explicit",
    ].join("|");

    items.push({
      id,
      amount,
      expires_at: expireAt,
      days_left: daysLeft,
      projected: false,
    });
  }

  items.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return { items, total: Math.floor(total) };
}

function parsePbActiveBalance(info = {}) {
  const inactive = Math.max(0, toNumber(info?.bonus_inactive, 0));
  const accumulated = Number(info?.balance_bonus_accumulated);
  const present = Number(info?.balance_bonus_present);
  const action = Number(info?.balance_bonus_action);
  if (Number.isFinite(accumulated) || Number.isFinite(present) || Number.isFinite(action)) {
    const bucketsTotal =
      (Number.isFinite(accumulated) ? accumulated : 0) +
      (Number.isFinite(present) ? present : 0) +
      (Number.isFinite(action) ? action : 0);
    return normalizeBonusAmount(Math.max(0, bucketsTotal - inactive));
  }

  const rawBalance = toNumber(info?.balance, NaN);
  if (!Number.isFinite(rawBalance)) return 0;
  return normalizeBonusAmount(Math.max(0, rawBalance - inactive));
}

function assertPremiumBonusSuccess(payload, fallbackMessage) {
  if (payload?.success === false) {
    const message = String(payload?.error_description || payload?.error || "").trim();
    throw new Error(message || fallbackMessage);
  }
}

async function loadBuyerInfo(client, identificator = "") {
  const normalizedIdentificator = String(identificator || "").trim();
  if (!normalizedIdentificator) {
    return null;
  }

  return client.buyerInfo({
    identificator: normalizedIdentificator,
    extra_fields: ["payments_amount"],
  });
}

function firstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function parseGroupPercent(rawName) {
  const source = String(rawName || "")
    .trim()
    .replace(",", ".");
  if (!source) return null;
  const match = source.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function normalizePercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return Math.min(1, Math.max(0, Number(parsed.toFixed(2))));
}

function parseWriteOffPercentFromQuote(quote = {}, amount = 0) {
  const grossAmount = Number(amount);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return null;

  const writeOffAvailable = toNumber(quote?.write_off_available, NaN);
  if (!Number.isFinite(writeOffAvailable) || writeOffAvailable < 0) return null;

  return normalizePercent(writeOffAvailable / grossAmount);
}

async function resolveLocalLevelIdByPremiumBonusGroup({ groupId = "", groupName = "" } = {}) {
  const normalizedGroupId = String(groupId || "").trim();
  const normalizedGroupName = String(groupName || "").trim();

  if (normalizedGroupId) {
    const [rows] = await db.query(
      `SELECT id
       FROM loyalty_levels
       WHERE is_enabled = 1
         AND pb_group_id = ?
       ORDER BY sort_order ASC, threshold_amount ASC, id ASC
       LIMIT 1`,
      [normalizedGroupId]
    );
    if (rows[0]?.id) return rows[0].id;
  }

  if (normalizedGroupName) {
    const [rows] = await db.query(
      `SELECT id
       FROM loyalty_levels
       WHERE is_enabled = 1
         AND (
           LOWER(TRIM(pb_group_name)) = LOWER(TRIM(?))
           OR LOWER(TRIM(name)) = LOWER(TRIM(?))
         )
       ORDER BY sort_order ASC, threshold_amount ASC, id ASC
       LIMIT 1`,
      [normalizedGroupName, normalizedGroupName]
    );
    if (rows[0]?.id) return rows[0].id;
  }

  const percent = parseGroupPercent(groupName);
  if (!Number.isFinite(percent)) return null;
  const [rows] = await db.query(
    `SELECT id
     FROM loyalty_levels
     WHERE is_enabled = 1
       AND earn_percentage = ?
     ORDER BY id ASC
     LIMIT 1`,
    [percent]
  );
  return rows[0]?.id || null;
}

async function getLocalLoyaltyLevelsForDisplay(options = {}) {
  const [rows] = await db.query(
    `SELECT id, name, threshold_amount, earn_percentage, max_spend_percentage, is_enabled, sort_order, pb_group_id, pb_group_name
     FROM loyalty_levels
     WHERE is_enabled = 1
     ORDER BY sort_order ASC, threshold_amount ASC, id ASC`
  );

  const forcedMaxSpendPercent = normalizePercent(options?.forcedMaxSpendPercent);
  return rows.map((row) => ({
    id: row.id,
    name: String(row.name || "").trim() || `Уровень ${row.id}`,
    threshold: Number(row.threshold_amount || 0),
    earnRate: Number(row.earn_percentage || 0) / 100,
    maxSpendPercent: forcedMaxSpendPercent ?? Number(row.max_spend_percentage || 0) / 100,
    pbGroupId: String(row.pb_group_id || "").trim(),
    pbGroupName: String(row.pb_group_name || "").trim(),
    sortOrder: Number(row.sort_order || 0),
  }));
}

function resolveCurrentLocalLevelByPbGroup(levels = [], groupId = "", groupName = "") {
  const normalizedGroupId = String(groupId || "").trim();
  const normalizedGroupName = String(groupName || "")
    .trim()
    .toLowerCase();
  if (!levels.length) return null;

  if (normalizedGroupId) {
    const byId = levels.find((level) => String(level.pbGroupId || "").trim() === normalizedGroupId);
    if (byId) return byId;
  }

  if (normalizedGroupName) {
    const byPbName = levels.find(
      (level) =>
        String(level.pbGroupName || "")
          .trim()
          .toLowerCase() === normalizedGroupName
    );
    if (byPbName) return byPbName;
    const byLocalName = levels.find(
      (level) =>
        String(level.name || "")
          .trim()
          .toLowerCase() === normalizedGroupName
    );
    if (byLocalName) return byLocalName;
  }

  const groupPercent = parseGroupPercent(groupName);
  if (Number.isFinite(groupPercent)) {
    const byPercent = levels.find(
      (level) => Math.round(Number(level.earnRate || 0) * 100) === Math.round(groupPercent)
    );
    if (byPercent) return byPercent;
  }

  return null;
}

function resolveCurrentLevel(totalSpent, levels, groupId = null, groupName = "") {
  const normalizedGroupId = String(groupId || "").trim();
  const normalizedGroupName = String(groupName || "")
    .trim()
    .toLowerCase();
  if (normalizedGroupId) {
    const byId = levels.find((level) => String(level.id) === normalizedGroupId);
    if (byId) return byId;
  }
  if (normalizedGroupName) {
    const byName = levels.find(
      (level) =>
        String(level.name || "")
          .trim()
          .toLowerCase() === normalizedGroupName
    );
    if (byName) return byName;
  }

  let current = levels[0] || null;
  for (const level of levels) {
    if (totalSpent >= Number(level.threshold || 0)) {
      current = level;
    }
  }
  return current;
}

function resolveNextLevel(currentLevel, levels) {
  if (!currentLevel) return null;
  const index = levels.findIndex((level) => String(level.id) === String(currentLevel.id));
  if (index < 0 || index >= levels.length - 1) return null;
  return levels[index + 1];
}

function extractAmountToNextLevel(transitionState) {
  const up = Array.isArray(transitionState?.transition_up) ? transitionState.transition_up : [];
  for (const item of up) {
    const value = firstFinite(
      toNumber(item?.leftover, NaN),
      toNumber(item?.left_amount, NaN),
      toNumber(item?.leftover_amount, NaN),
      toNumber(item?.amount_left, NaN),
      toNumber(item?.sum_left, NaN)
    );
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function parseTransitionThreshold(transition = {}) {
  return firstFinite(
    toNumber(transition?.required_payments_amount, NaN),
    toNumber(transition?.payments_amount, NaN),
    toNumber(transition?.payment_amount, NaN),
    toNumber(transition?.threshold_amount, NaN),
    toNumber(transition?.min_amount, NaN),
    toNumber(transition?.amount_from, NaN)
  );
}

function extractTransitionField(transition = {}, candidates = []) {
  for (const key of candidates) {
    const value = transition?.[key];
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function buildLevelsFromTransitionInfo(transitionState, options = {}) {
  const transitions = Array.isArray(transitionState?.client_group_transitions_list)
    ? transitionState.client_group_transitions_list
    : [];
  const maxSpendPercent = normalizePercent(options?.maxSpendPercent) ?? DEFAULT_MAX_SPEND_PERCENT;
  const info = options?.info || {};

  const levelsByKey = new Map();
  const upsert = ({ id = "", name = "", threshold = NaN } = {}) => {
    const normalizedId = String(id || "").trim();
    const normalizedName = String(name || "").trim();
    const key = normalizedId || normalizedName.toLowerCase();
    if (!key) return;

    const current = levelsByKey.get(key) || {
      id: normalizedId || key,
      name: normalizedName || `Уровень ${levelsByKey.size + 1}`,
      threshold: Number.isFinite(threshold) ? threshold : NaN,
      earnRate: Number.isFinite(parseGroupPercent(normalizedName))
        ? parseGroupPercent(normalizedName) / 100
        : 0,
      maxSpendPercent,
    };

    if (!current.id && normalizedId) current.id = normalizedId;
    if ((!current.name || /^уровень /i.test(current.name)) && normalizedName)
      current.name = normalizedName;
    if (!Number.isFinite(current.earnRate) || current.earnRate <= 0) {
      const parsedPercent = parseGroupPercent(normalizedName);
      if (Number.isFinite(parsedPercent)) {
        current.earnRate = parsedPercent / 100;
      }
    }
    if (Number.isFinite(threshold)) {
      if (!Number.isFinite(current.threshold) || threshold < current.threshold) {
        current.threshold = threshold;
      }
    }

    levelsByKey.set(key, current);
  };

  for (const transition of transitions) {
    const threshold = parseTransitionThreshold(transition);

    const fromId = extractTransitionField(transition, [
      "client_group_from_id",
      "from_group_id",
      "old_group_id",
      "group_from_id",
    ]);
    const fromName = extractTransitionField(transition, [
      "client_group_transition_from_name",
      "from_group_name",
      "old_group_name",
      "group_from_name",
    ]);
    const toId = extractTransitionField(transition, [
      "client_group_id",
      "buyer_group_id",
      "group_id",
      "to_group_id",
      "target_group_id",
      "new_group_id",
    ]);
    const toName = extractTransitionField(transition, [
      "client_group_transition_to_name",
      "to_group_name",
      "new_group_name",
      "group_to_name",
    ]);

    upsert({ id: fromId, name: fromName, threshold: 0 });
    upsert({ id: toId, name: toName, threshold });
  }

  upsert({
    id: String(info?.group_id || "").trim(),
    name: String(info?.group_name || "").trim(),
    threshold: 0,
  });

  const levels = [...levelsByKey.values()]
    .map((level, index) => ({
      ...level,
      id: level.id || String(index + 1),
      name: level.name || `Уровень ${index + 1}`,
      threshold: Number.isFinite(level.threshold) ? Number(level.threshold) : NaN,
      earnRate: Number.isFinite(level.earnRate) ? level.earnRate : 0,
      maxSpendPercent,
    }))
    .sort((a, b) => {
      const ta = Number.isFinite(a.threshold) ? a.threshold : Number.POSITIVE_INFINITY;
      const tb = Number.isFinite(b.threshold) ? b.threshold : Number.POSITIVE_INFINITY;
      return ta - tb;
    });

  if (!levels.length) return [];

  const firstFiniteThreshold = levels.find((level) => Number.isFinite(level.threshold));
  if (!firstFiniteThreshold) {
    return levels.map((level, index) => ({
      ...level,
      threshold: index === 0 ? 0 : Number.POSITIVE_INFINITY,
    }));
  }

  if (Number(firstFiniteThreshold.threshold) > 0) {
    levels[0] = {
      ...levels[0],
      threshold: 0,
    };
  }

  return levels.map((level, index) => ({
    ...level,
    threshold: Number.isFinite(level.threshold)
      ? level.threshold
      : (DEFAULT_LEVEL_THRESHOLDS[index] ?? 0),
  }));
}

function buildLevelsFromPremiumBonus(groupsResponse, transitionState, options = {}) {
  const maxSpendPercent = normalizePercent(options?.maxSpendPercent) ?? DEFAULT_MAX_SPEND_PERCENT;
  const groups = Array.isArray(groupsResponse?.list) ? groupsResponse.list : [];
  if (groups.length === 0) {
    const derivedFromTransitions = buildLevelsFromTransitionInfo(transitionState, options);
    if (derivedFromTransitions.length > 0) {
      return derivedFromTransitions;
    }

    const currentGroupName = String(options?.info?.group_name || "").trim();
    const currentGroupId = String(options?.info?.group_id || "").trim();
    if (currentGroupName || currentGroupId) {
      return [
        {
          id: currentGroupId || 1,
          name: currentGroupName || "Текущий уровень",
          threshold: 0,
          earnRate: Number.isFinite(parseGroupPercent(currentGroupName))
            ? parseGroupPercent(currentGroupName) / 100
            : 0,
          maxSpendPercent,
        },
      ];
    }

    return [{ id: 1, name: "Текущий уровень", threshold: 0, earnRate: 0, maxSpendPercent }];
  }

  const transitions = Array.isArray(transitionState?.client_group_transitions_list)
    ? transitionState.client_group_transitions_list
    : [];
  const transitionThresholdByGroupId = new Map();
  for (const transition of transitions) {
    const groupId =
      transition?.client_group_id ??
      transition?.buyer_group_id ??
      transition?.group_id ??
      transition?.to_group_id ??
      transition?.target_group_id ??
      transition?.new_group_id;
    const threshold = firstFinite(
      toNumber(transition?.required_payments_amount, NaN),
      toNumber(transition?.payments_amount, NaN),
      toNumber(transition?.payment_amount, NaN),
      toNumber(transition?.threshold_amount, NaN),
      toNumber(transition?.min_amount, NaN),
      toNumber(transition?.amount_from, NaN)
    );
    if (groupId == null || !Number.isFinite(threshold)) continue;

    const key = String(groupId);
    const prev = transitionThresholdByGroupId.get(key);
    if (!Number.isFinite(prev) || threshold < prev) {
      transitionThresholdByGroupId.set(key, threshold);
    }
  }

  const mapped = groups.map((group, index) => {
    const percent = parseGroupPercent(group?.name);
    const transitionThreshold = transitionThresholdByGroupId.get(String(group?.id));
    const fallbackThreshold =
      DEFAULT_LEVEL_THRESHOLDS[index] ??
      DEFAULT_LEVEL_THRESHOLDS[DEFAULT_LEVEL_THRESHOLDS.length - 1] ??
      0;

    return {
      id: group?.id ?? index + 1,
      name: String(group?.name || "").trim() || `Уровень ${index + 1}`,
      threshold: Number.isFinite(transitionThreshold) ? transitionThreshold : fallbackThreshold,
      earnRate: Number.isFinite(percent) ? percent / 100 : 0,
      maxSpendPercent,
    };
  });

  const hasThresholdData = mapped.some(
    (level, index) => Number(level.threshold) !== Number(DEFAULT_LEVEL_THRESHOLDS[index] ?? 0)
  );
  const sorted = mapped.sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
  if (hasThresholdData) return sorted;

  return sorted.map((level, index) => ({
    ...level,
    threshold:
      DEFAULT_LEVEL_THRESHOLDS[index] ??
      DEFAULT_LEVEL_THRESHOLDS[DEFAULT_LEVEL_THRESHOLDS.length - 1] ??
      0,
  }));
}

function mapOrderItemsToPremiumBonus(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.item_price) || 0;
      const amount = Number(item?.subtotal);
      const resolvedAmount = Number.isFinite(amount) ? amount : unitPrice * quantity;
      if (quantity <= 0 || resolvedAmount <= 0) return null;

      return {
        name: String(item?.item_name || item?.name || "").trim() || "Позиция",
        external_item_id:
          String(item?.iiko_item_id || item?.item_id || item?.id || "").trim() || undefined,
        amount: Number(resolvedAmount.toFixed(2)),
        quantity: Number(quantity.toFixed(3)),
        type: "product",
      };
    })
    .filter(Boolean);
}

function mapPbPurchasesToTransactions(list = []) {
  const transactions = [];

  for (const purchase of Array.isArray(list) ? list : []) {
    const createdAt = purchase?.date || null;
    const orderRef = purchase?.external_id || purchase?.id || null;
    const writeOffAccumulated = toNumber(purchase?.bonus_accumulated_write_off);
    const writeOffPresent = toNumber(purchase?.bonus_present_write_off);
    const writeOffAction = toNumber(purchase?.bonus_action_write_off);
    const writeOnAccumulated = toNumber(purchase?.bonus_accumulated_write_on);
    const writeOnPresent = toNumber(purchase?.bonus_present_write_on);
    const writeOnAction = toNumber(purchase?.bonus_action_write_on);
    const expireAccumulated = toNumber(purchase?.bonus_accumulated_expire);
    const expirePresent = toNumber(purchase?.bonus_present_expire);
    const expireAction = toNumber(purchase?.bonus_action_expire);

    const writeOnTotal = writeOnAccumulated + writeOnPresent + writeOnAction;
    const writeOffTotal = writeOffAccumulated + writeOffPresent + writeOffAction;
    const expireTotal = expireAccumulated + expirePresent + expireAction;
    if (writeOnTotal <= 0 && writeOffTotal <= 0 && expireTotal <= 0) continue;

    const explicitOperationName = String(
      purchase?.operation_name || purchase?.operation || purchase?.operation_type || ""
    ).trim();
    const isLegacyExpireEvent =
      expireTotal <= 0 &&
      ((writeOffAction > 0 &&
        writeOffAccumulated === 0 &&
        writeOffPresent === 0 &&
        writeOnTotal === 0) ||
      /сгора/i.test(explicitOperationName));

    const activationAtRaw =
      purchase?.bonus_activation_at ||
      purchase?.bonus_activate_at ||
      purchase?.bonus_write_on_activate_at ||
      purchase?.bonus_write_on_activation_at ||
      purchase?.write_on_activation_at ||
      null;
    const activationAt = parseIsoDateOrNull(activationAtRaw);
    const isPendingEarn = activationAt ? new Date(activationAt).getTime() > Date.now() : false;

    if (writeOnTotal > 0) {
      transactions.push({
        id: `${purchase?.id || orderRef || createdAt || Math.random()}-earn`,
        type: "earn",
        amount: normalizeBonusAmount(writeOnTotal),
        promo_amount: normalizeBonusAmount(writeOnAction),
        created_at: createdAt,
        order_id: orderRef,
        order_number: orderRef,
        status: isPendingEarn ? "pending" : "completed",
        activate_at: activationAt,
        raw_status: purchase?.status || null,
      });
    }

    if (expireTotal > 0 || isLegacyExpireEvent) {
      const expiredAmount = expireTotal > 0 ? expireTotal : writeOffAction;
      const expiredPromoAmount = expireTotal > 0 ? expireAction : writeOffAction;
      transactions.push({
        id: `${purchase?.id || orderRef || createdAt || Math.random()}-expire`,
        type: "expire",
        amount: normalizeBonusAmount(expiredAmount),
        promo_amount: normalizeBonusAmount(expiredPromoAmount),
        created_at: createdAt,
        order_id: orderRef,
        order_number: orderRef,
        status: "completed",
        raw_status: purchase?.status || null,
      });
    }

    const effectiveWriteOffTotal = Math.max(0, writeOffTotal - Math.max(0, expireTotal));
    const effectiveWriteOffAction = Math.max(0, writeOffAction - Math.max(0, expireAction));
    if (effectiveWriteOffTotal > 0) {
      transactions.push({
        id: `${purchase?.id || orderRef || createdAt || Math.random()}-spend`,
        type: "spend",
        amount: normalizeBonusAmount(effectiveWriteOffTotal),
        promo_amount: normalizeBonusAmount(effectiveWriteOffAction),
        created_at: createdAt,
        order_id: orderRef,
        order_number: orderRef,
        status: "completed",
        raw_status: purchase?.status || null,
      });
    }
  }

  transactions.sort((a, b) => {
    const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    if (diff !== 0) return diff;
    const sameOrder =
      String(a.order_id || "") && String(a.order_id || "") === String(b.order_id || "");
    if (sameOrder && a.type !== b.type) {
      if (a.type === "earn") return -1;
      if (b.type === "earn") return 1;
    }
    const idDiff =
      Number(String(b.id || "").replace(/[^\d]/g, "")) -
      Number(String(a.id || "").replace(/[^\d]/g, ""));
    if (Number.isFinite(idDiff) && idDiff !== 0) return idDiff;
    if (a.type === b.type) return 0;
    if (a.type === "earn") return -1;
    if (b.type === "earn") return 1;
    return 0;
  });
  return transactions;
}

function getPbCacheKey(type, userId) {
  return `pb:loyalty:v${PB_CACHE_VERSION}:${type}:user:${userId}`;
}

function getPbExpirePackagesCacheKey(userId) {
  return `pb:loyalty:v${PB_CACHE_VERSION}:expire_packages:user:${userId}`;
}

async function savePbCache(type, userId, payload) {
  try {
    await redis.set(
      getPbCacheKey(type, userId),
      JSON.stringify(payload),
      "EX",
      PB_CACHE_TTL_SECONDS
    );
  } catch (error) {
    // Кеш не критичен, не прерываем основной поток.
  }
}

async function loadPbCache(type, userId) {
  try {
    const raw = await redis.get(getPbCacheKey(type, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

async function loadObservedExpirePackages(userId) {
  try {
    const raw = await redis.get(getPbExpirePackagesCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    return [];
  }
}

async function saveObservedExpirePackages(userId, packages = []) {
  try {
    await redis.set(
      getPbExpirePackagesCacheKey(userId),
      JSON.stringify(packages),
      "EX",
      PB_EXPIRE_PACKAGES_CACHE_TTL_SECONDS
    );
  } catch (error) {
    // Кеш вспомогательный, не прерываем основной поток.
  }
}

function buildObservedPackageFingerprint(pkg = {}) {
  return [
    String(pkg.activation_at || "").trim(),
    String(pkg.expire_at || "").trim(),
    String(parseBonusPackageAmount(pkg.bonus) || ""),
  ].join("|");
}

function mapObservedPackagesFromBuyerBonus(data = []) {
  const nowIso = new Date().toISOString();
  const normalized = (Array.isArray(data) ? data : [])
    .map((pkg) => {
      const expireAt = parseIsoDateOrNull(pkg?.expire_at);
      const activationAt = parseIsoDateOrNull(pkg?.activation_at) || nowIso;
      const amount = parseBonusPackageAmount(pkg?.bonus);
      if (amount <= 0) return null;
      return {
        fingerprint: buildObservedPackageFingerprint({
          activation_at: activationAt,
          expire_at: expireAt,
          bonus: amount,
        }),
        bonus: amount,
        activation_at: activationAt,
        expire_at: expireAt,
      };
    })
    .filter(Boolean);

  const fingerprintCounters = new Map();
  return normalized.map((pkg) => {
    const ordinal = (fingerprintCounters.get(pkg.fingerprint) || 0) + 1;
    fingerprintCounters.set(pkg.fingerprint, ordinal);
    return {
      key: `${pkg.fingerprint}|${ordinal}`,
      bonus: pkg.bonus,
      activation_at: pkg.activation_at,
      expire_at: pkg.expire_at,
      first_seen_at: nowIso,
      is_purchase_covered: false,
      emitted_expire_at: null,
    };
  });
}

function isObservedPackageCoveredByPurchaseEarn(pkg = {}, purchaseTransactions = []) {
  const pkgAmount = parseBonusPackageAmount(pkg?.bonus);
  const normalizedPkgAmount = normalizeBonusAmount(pkgAmount);
  const pkgActivationAt = parseIsoDateOrNull(pkg?.activation_at);
  if (pkgAmount <= 0) return false;

  return (Array.isArray(purchaseTransactions) ? purchaseTransactions : []).some((tx) => {
    if (tx?.type !== "earn") return false;
    const txActivationAt = parseIsoDateOrNull(tx?.activate_at);
    const hasActivationMatch =
      Boolean(pkgActivationAt) && Boolean(txActivationAt) && txActivationAt === pkgActivationAt;
    const txAmount = normalizeBonusAmount(tx?.amount);
    const txPromoAmount = normalizeBonusAmount(tx?.promo_amount);
    const txAccumulatedPart = Math.max(0, txAmount - Math.max(0, txPromoAmount));
    const hasAmountMatch =
      Math.abs(txAmount - normalizedPkgAmount) <= 1 ||
      Math.abs(txPromoAmount - normalizedPkgAmount) <= 1 ||
      Math.abs(txAccumulatedPart - normalizedPkgAmount) <= 1;
    if (!hasAmountMatch) return false;
    if (hasActivationMatch) return true;

    // В некоторых purchase-list нет activate_at. Тогда матчим с покупкой
    // только в узком временном окне после created_at заказа.
    if (tx?.order_id && pkgActivationAt) {
      const txCreatedAt = parseIsoDateOrNull(tx?.created_at);
      if (!txCreatedAt) return false;
      const createdTs = new Date(txCreatedAt).getTime();
      const activationTs = new Date(pkgActivationAt).getTime();
      if (!Number.isFinite(createdTs) || !Number.isFinite(activationTs)) return false;
      const diffHours = (activationTs - createdTs) / (1000 * 60 * 60);
      return diffHours >= 0 && diffHours <= 24;
    }

    return (
      Math.abs(txAmount - normalizedPkgAmount) <= 1 ||
      Math.abs(txPromoAmount - normalizedPkgAmount) <= 1
    );
  });
}

function mergeObservedPackages(existing = [], fresh = [], purchaseTransactions = []) {
  const normalizeObservedPackage = (pkg = {}) => {
    const bonus = parseBonusPackageAmount(pkg?.bonus);
    const activation_at = parseIsoDateOrNull(pkg?.activation_at);
    const expire_at = parseIsoDateOrNull(pkg?.expire_at);
    if (bonus <= 0 || !activation_at) return null;
    return {
      bonus,
      activation_at,
      expire_at,
      first_seen_at: parseIsoDateOrNull(pkg?.first_seen_at) || new Date().toISOString(),
      is_purchase_covered:
        Object.prototype.hasOwnProperty.call(pkg || {}, "is_purchase_covered")
          ? Boolean(pkg?.is_purchase_covered)
          : true,
      emitted_expire_at: parseIsoDateOrNull(pkg?.emitted_expire_at || pkg?.emitted_at),
    };
  };

  const normalizedExisting = (Array.isArray(existing) ? existing : [])
    .map(normalizeObservedPackage)
    .filter(Boolean);
  const normalizedFresh = (Array.isArray(fresh) ? fresh : [])
    .map(normalizeObservedPackage)
    .filter(Boolean);

  const existingByFingerprintCount = new Map();
  for (const pkg of normalizedExisting) {
    const fingerprint = buildObservedPackageFingerprint(pkg);
    existingByFingerprintCount.set(
      fingerprint,
      (existingByFingerprintCount.get(fingerprint) || 0) + 1
    );
  }

  const map = new Map();
  const existingCounters = new Map();
  for (const pkg of normalizedExisting) {
    const fingerprint = buildObservedPackageFingerprint(pkg);
    const ordinal = (existingCounters.get(fingerprint) || 0) + 1;
    existingCounters.set(fingerprint, ordinal);
    const key = `${fingerprint}|${ordinal}`;
    map.set(key, {
      key,
      ...pkg,
    });
  }

  const freshCounters = new Map();
  for (const pkg of normalizedFresh) {
    const fingerprint = buildObservedPackageFingerprint(pkg);
    const ordinal = (freshCounters.get(fingerprint) || 0) + 1;
    freshCounters.set(fingerprint, ordinal);
    const existingCount = existingByFingerprintCount.get(fingerprint) || 0;
    if (ordinal <= existingCount) continue;

    const key = `${fingerprint}|${ordinal}`;
    map.set(key, {
      ...pkg,
      key,
      is_purchase_covered: isObservedPackageCoveredByPurchaseEarn(pkg, purchaseTransactions),
      emitted_expire_at: null,
    });
  }
  return [...map.values()];
}

function buildSyntheticTransactionsFromObserved(packages = [], now = new Date()) {
  const nowTs = now.getTime();
  const transactions = [];
  const nextState = [];

  for (const pkg of Array.isArray(packages) ? packages : []) {
    const activationAt = parseIsoDateOrNull(pkg?.activation_at);
    const expireAt = parseIsoDateOrNull(pkg?.expire_at);
    const amount = parseBonusPackageAmount(pkg?.bonus);
    const emittedExpireAt = parseIsoDateOrNull(pkg?.emitted_expire_at || pkg?.emitted_at);
    if (amount <= 0 || !activationAt) continue;

    const activationTs = new Date(activationAt).getTime();
    const isPending = Number.isFinite(activationTs) && activationTs > nowTs;
    const nextPackage = {
      ...pkg,
      bonus: amount,
      activation_at: activationAt,
      expire_at: expireAt,
      emitted_expire_at: emittedExpireAt,
    };

    if (!nextPackage.is_purchase_covered) {
      transactions.push({
        id: `${pkg.key}-earn`,
        type: "earn",
        amount: normalizeBonusAmount(amount),
        created_at: activationAt,
        order_id: null,
        order_number: null,
        status: isPending ? "pending" : "completed",
        activate_at: activationAt,
      });
    }

    nextState.push(nextPackage);
  }

  return { transactions, nextState };
}

function resolveExternalSourceByTransaction(transaction = {}) {
  const hasOrderRef = String(transaction?.order_id || "").trim().length > 0;
  return hasOrderRef ? "pb_purchase_list" : "pb_buyer_bonus";
}

function buildExternalPayloadByTransaction(transaction = {}) {
  const payload = {
    promo_amount: Number.isFinite(Number(transaction?.promo_amount))
      ? normalizeBonusAmount(transaction.promo_amount)
      : null,
    activate_at: parseIsoDateOrNull(transaction?.activate_at),
    raw_status: String(transaction?.raw_status || "").trim() || null,
    order_number: String(transaction?.order_number || "").trim() || null,
    projected: Boolean(transaction?.projected),
  };
  return payload;
}

async function persistPremiumBonusTransactions(userId, transactions = []) {
  const list = Array.isArray(transactions) ? transactions : [];
  if (!list.length) return;
  const allowedTypes = new Set(["earn", "spend", "expire", "adjustment", "registration", "birthday"]);
  await Promise.all(
    list.map(async (tx) => {
      const externalRef = String(tx?.id || "").trim();
      const createdAt = formatDateForSqlTimestamp(tx?.created_at) || formatDateForSqlTimestamp(Date.now());
      const externalSource = resolveExternalSourceByTransaction(tx);
      const amount = normalizeBonusAmount(tx?.amount);
      if (!externalRef || amount === 0) return;

      const type = String(tx?.type || "").trim().toLowerCase();
      if (!allowedTypes.has(type)) return;

      const status = String(tx?.status || "completed").trim().toLowerCase();
      const normalizedStatus = ["pending", "completed", "cancelled"].includes(status)
        ? status
        : "completed";
      const orderId = null;
      const expiresAt = formatDateForSqlTimestamp(tx?.expires_at);
      const payload = buildExternalPayloadByTransaction(tx);

      await db.query(
        `INSERT INTO loyalty_transactions
        (user_id, type, status, amount, order_id, description, external_source, external_ref, external_payload, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          type = VALUES(type),
          status = VALUES(status),
          amount = VALUES(amount),
          order_id = COALESCE(VALUES(order_id), order_id),
          description = VALUES(description),
          external_payload = VALUES(external_payload),
          expires_at = COALESCE(VALUES(expires_at), expires_at),
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          type,
          normalizedStatus,
          amount,
          orderId,
          "Операция PremiumBonus",
          externalSource,
          externalRef,
          JSON.stringify(payload),
          expiresAt,
          createdAt,
        ]
      );
    })
  );
}

function mapPersistedPremiumBonusRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    let payload = {};
    if (row?.external_payload) {
      try {
        payload =
          typeof row.external_payload === "string"
            ? JSON.parse(row.external_payload)
            : row.external_payload;
      } catch (error) {
        payload = {};
      }
    }

    return {
      id: String(row.external_ref || row.id),
      type: row.type,
      amount: normalizeBonusAmount(row.amount),
      promo_amount:
        payload?.promo_amount !== null &&
        payload?.promo_amount !== undefined &&
        Number.isFinite(Number(payload?.promo_amount))
        ? normalizeBonusAmount(payload.promo_amount)
        : null,
      created_at: parseIsoDateOrNull(row.created_at) || row.created_at,
      order_id: row.order_id ?? null,
      order_number: payload?.order_number || (row.order_id ? String(row.order_id) : null),
      status: row.status || "completed",
      activate_at: payload?.activate_at || null,
      raw_status: payload?.raw_status || null,
      expires_at: parseIsoDateOrNull(row.expires_at) || null,
      projected: Boolean(payload?.projected),
    };
  });
}

async function loadPersistedPremiumBonusTransactions(userId) {
  const [rows] = await db.query(
    `SELECT id, type, status, amount, order_id, expires_at, created_at, external_ref, external_payload
     FROM loyalty_transactions
     WHERE user_id = ? AND external_source IN (?, ?)
     ORDER BY created_at DESC, id DESC
     LIMIT 500`,
    [userId, PB_HISTORY_EXTERNAL_SOURCES[0], PB_HISTORY_EXTERNAL_SOURCES[1]]
  );
  return mapPersistedPremiumBonusRows(rows);
}

async function syncLocalLoyaltyMirror(userId, payload = {}) {
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, "balance")) {
    const normalizedBalance = normalizeBonusAmount(payload.balance);
    updates.push("loyalty_balance = ?");
    values.push(normalizedBalance);
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "groupName") ||
    Object.prototype.hasOwnProperty.call(payload, "groupId")
  ) {
    const localLevelId = await resolveLocalLevelIdByPremiumBonusGroup({
      groupId: payload.groupId,
      groupName: payload.groupName,
    });
    if (Number.isInteger(localLevelId)) {
      updates.push("current_loyalty_level_id = ?");
      values.push(localLevelId);
    }
  }

  if (updates.length === 0) return;
  values.push(userId);
  await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
}

export class LoyaltyAdapter {
  async resolvePremiumBonusContext(userId) {
    const [users] = await db.query(
      "SELECT pb_client_id, loyalty_balance, phone FROM users WHERE id = ?",
      [userId]
    );
    if (users.length === 0) throw new Error("Пользователь не найден");

    const pbClientId = String(users[0].pb_client_id || "").trim();
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);
    const identifiers = [normalizedPhone, pbClientId].filter(Boolean);
    if (identifiers.length === 0)
      throw new Error("У пользователя отсутствует идентификатор PremiumBonus (phone/pb_client_id)");

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    return {
      user: users[0],
      identifiers,
      identificator: identifiers[0],
      client,
    };
  }

  async getPremiumBonusLevelsSummary(userId) {
    const { client, identifiers } = await this.resolvePremiumBonusContext(userId);

    try {
      const info = await loadBuyerInfo(client, identifiers[0]);
      assertPremiumBonusSuccess(
        info,
        "PremiumBonus вернул ошибку при получении профиля покупателя"
      );
      const premiumBonusPhone = normalizePhoneForPremiumBonus(info?.phone);

      const [groupsResult, transitionsResult] = await Promise.allSettled([
        client.buyerGroups({}),
        premiumBonusPhone
          ? client.statusTransitionInfo({ phone: premiumBonusPhone })
          : Promise.resolve(null),
      ]);

      const groupsResponse = groupsResult.status === "fulfilled" ? groupsResult.value : null;
      const transitionsResponse =
        transitionsResult.status === "fulfilled" ? transitionsResult.value : null;
      const transitionState = transitionsResponse?.client_group_transition_leftover || {};

      const maxSpendPercent = null;

      const levels = buildLevelsFromPremiumBonus(groupsResponse, transitionState, {
        maxSpendPercent,
        info,
      });
      const totalSpent = toNumber(info?.payments_amount, toNumber(info?.init_payment_amount, 0));
      const localLevels = await getLocalLoyaltyLevelsForDisplay({
        forcedMaxSpendPercent: maxSpendPercent,
      });
      const mappedCurrentLocalLevel = resolveCurrentLocalLevelByPbGroup(
        localLevels,
        info?.group_id,
        info?.group_name
      );
      const uiLevels = localLevels.length > 0 ? localLevels : levels;
      const currentLevel =
        mappedCurrentLocalLevel ||
        resolveCurrentLevel(totalSpent, uiLevels, info?.group_id, info?.group_name);
      const nextLevel = resolveNextLevel(currentLevel, uiLevels);

      let amountToNext = 0;
      let progress = 1;
      if (currentLevel && nextLevel) {
        const directAmountToNext = extractAmountToNextLevel(transitionState);
        amountToNext = Number.isFinite(directAmountToNext)
          ? Math.max(0, directAmountToNext)
          : Math.max(0, Number(nextLevel.threshold || 0) - totalSpent);

        const span = Number(nextLevel.threshold || 0) - Number(currentLevel.threshold || 0);
        if (span > 0) {
          progress = Math.min(
            1,
            Math.max(0, (totalSpent - Number(currentLevel.threshold || 0)) / span)
          );
        } else {
          progress = amountToNext > 0 ? 0 : 1;
        }
      }

      const result = {
        balance: parsePbActiveBalance(info),
        current_level: currentLevel,
        next_level: nextLevel,
        total_spent_60_days: totalSpent,
        total_spent_all_time: totalSpent,
        progress_to_next_level: progress,
        amount_to_next_level: amountToNext,
        levels: uiLevels,
        period_days: null,
        max_spend_percent:
          normalizePercent(currentLevel?.maxSpendPercent) ?? normalizePercent(maxSpendPercent) ?? null,
        bonus_inactive: normalizeBonusAmount(toNumber(info?.bonus_inactive, 0)),
        bonus_next_activation_text: String(info?.bonus_next_activation_text || "").trim() || null,
        raw: {
          info,
          groups: groupsResponse,
          transitions: transitionsResponse,
        },
      };
      await syncLocalLoyaltyMirror(userId, {
        balance: result.balance,
        groupId: info?.group_id || "",
        groupName: currentLevel?.name || info?.group_name || "",
      });
      await savePbCache("levels", userId, result);
      return result;
    } catch (error) {
      const cached = await loadPbCache("levels", userId);
      if (cached) {
        return {
          ...cached,
          stale: true,
          stale_reason: "premiumbonus_unavailable",
        };
      }

      const localFallback = await localLoyaltyService.getLevelsSummary(userId);
      return {
        ...localFallback,
        balance: normalizeBonusAmount(localFallback?.balance),
        stale: true,
        stale_reason: "premiumbonus_unavailable",
      };
    }
  }

  async getMode() {
    const settings = await getIntegrationSettings();
    const loyaltyMode = String(settings?.integrationMode?.loyalty || "local")
      .trim()
      .toLowerCase();
    return settings.premiumbonusEnabled && loyaltyMode === "external" ? "premiumbonus" : "local";
  }

  async getUserBalance(userId) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.getBalanceSummary(userId);
    }
    const { client, identifiers, user } = await this.resolvePremiumBonusContext(userId);
    try {
      const info = await loadBuyerInfo(client, identifiers[0]);
      assertPremiumBonusSuccess(
        info,
        "PremiumBonus вернул ошибку при получении баланса покупателя"
      );
      const buyerBonusPhone = normalizePhoneForPremiumBonus(info?.phone || identifiers[0]);
      let buyerBonusPackages = [];
      if (buyerBonusPhone) {
        const [buyerBonusResponse, historyResponse] = await Promise.all([
          client.buyerBonus({ phone: buyerBonusPhone }),
          client.transactionHistory({ phone: buyerBonusPhone }),
        ]);
        assertPremiumBonusSuccess(
          buyerBonusResponse,
          "PremiumBonus вернул ошибку при получении бонусных пакетов"
        );
        assertPremiumBonusSuccess(
          historyResponse,
          "PremiumBonus вернул ошибку при получении истории транзакций"
        );
        buyerBonusPackages = Array.isArray(buyerBonusResponse?.data) ? buyerBonusResponse.data : [];
      }
      const { items: expiringBonuses, total: totalExpiring } = buildPremiumBonusExpiringBonuses({
        buyerBonusPackages,
      });

      const result = {
        balance: parsePbActiveBalance(info),
        current_level: info?.group_name || null,
        total_spent_60_days: toNumber(
          info?.payments_amount,
          toNumber(info?.init_payment_amount, 0)
        ),
        total_spent_all_time: toNumber(
          info?.payments_amount,
          toNumber(info?.init_payment_amount, 0)
        ),
        period_days: null,
        bonus_inactive: normalizeBonusAmount(toNumber(info?.bonus_inactive, 0)),
        bonus_next_activation_text: String(info?.bonus_next_activation_text || "").trim() || null,
        expiring_bonuses: expiringBonuses,
        total_expiring: totalExpiring,
        raw: info,
      };
      await syncLocalLoyaltyMirror(userId, {
        balance: result.balance,
        groupId: info?.group_id || "",
        groupName: result.current_level || "",
      });
      await savePbCache("balance", userId, result);
      return result;
    } catch (error) {
      const cached = await loadPbCache("balance", userId);
      if (cached) {
        return {
          ...cached,
          stale: true,
          stale_reason: "premiumbonus_unavailable",
        };
      }

      return {
        balance: normalizeBonusAmount(user?.loyalty_balance),
        current_level: null,
        total_spent_60_days: 0,
        total_spent_all_time: 0,
        period_days: null,
        bonus_inactive: 0,
        bonus_next_activation_text: null,
        expiring_bonuses: [],
        total_expiring: 0,
        stale: true,
        stale_reason: "premiumbonus_unavailable",
      };
    }
  }

  async getTransactionHistory(userId) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.getHistory(userId, 1, 50);
    }

    const [users] = await db.query("SELECT pb_client_id, phone FROM users WHERE id = ?", [userId]);
    if (users.length === 0) throw new Error("Пользователь не найден");
    const pbClientId = String(users[0].pb_client_id || "").trim();
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);
    const identificator = normalizedPhone || pbClientId;
    if (!identificator)
      throw new Error("У пользователя отсутствует идентификатор PremiumBonus (phone/pb_client_id)");

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    try {
      const [response, buyerInfo] = await Promise.all([
        client.transactionHistory({
          identificator,
        }),
        loadBuyerInfo(client, normalizedPhone || pbClientId),
      ]);
      assertPremiumBonusSuccess(
        buyerInfo,
        "PremiumBonus вернул ошибку при получении профиля покупателя"
      );
      const buyerBonusPhone = normalizePhoneForPremiumBonus(buyerInfo?.phone || identificator);
      let buyerBonusData = [];
      if (buyerBonusPhone) {
        const buyerBonusResponse = await client.buyerBonus({ phone: buyerBonusPhone });
        assertPremiumBonusSuccess(
          buyerBonusResponse,
          "PremiumBonus вернул ошибку при получении бонусных пакетов"
        );
        buyerBonusData = Array.isArray(buyerBonusResponse?.data) ? buyerBonusResponse.data : [];
      }

      assertPremiumBonusSuccess(
        response,
        "PremiumBonus вернул ошибку при получении истории транзакций"
      );
      const purchases = Array.isArray(response?.list) ? response.list : [];
      const purchaseTransactions = mapPbPurchasesToTransactions(purchases);

      // Синтетика по buyer-bonus:
      // - показываем только начисления пакетов, которые не покрыты операциями purchase-list.
      // Сгорание берем из transactionHistory, чтобы не создавать ложные expire по расчетным датам.
      const observedPackages = await loadObservedExpirePackages(userId);
      const freshObservedPackages = mapObservedPackagesFromBuyerBonus(buyerBonusData);
      const mergedObservedPackages = mergeObservedPackages(
        observedPackages,
        freshObservedPackages,
        purchaseTransactions
      );
      const { transactions: observedTransactions, nextState: nextObservedPackages } =
        buildSyntheticTransactionsFromObserved(mergedObservedPackages);
      await saveObservedExpirePackages(userId, nextObservedPackages);

      const mergedTransactions = [...purchaseTransactions, ...observedTransactions];
      mergedTransactions.sort((a, b) => {
        const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        if (diff !== 0) return diff;
        const sameOrder =
          String(a.order_id || "") && String(a.order_id || "") === String(b.order_id || "");
        if (sameOrder && a.type !== b.type) {
          if (a.type === "earn") return -1;
          if (b.type === "earn") return 1;
        }
        const idDiff =
          Number(String(b.id || "").replace(/[^\d]/g, "")) -
          Number(String(a.id || "").replace(/[^\d]/g, ""));
        if (Number.isFinite(idDiff) && idDiff !== 0) return idDiff;
        if (a.type === b.type) return 0;
        if (a.type === "earn") return -1;
        if (b.type === "earn") return 1;
        return 0;
      });

      await persistPremiumBonusTransactions(userId, mergedTransactions);
      const persistedTransactions = await loadPersistedPremiumBonusTransactions(userId);

      const result = {
        transactions: persistedTransactions,
        has_more: false,
        raw: {
          ...response,
          list: purchases,
        },
      };
      await savePbCache("history", userId, result);
      return result;
    } catch (error) {
      const persistedTransactions = await loadPersistedPremiumBonusTransactions(userId);
      if (persistedTransactions.length > 0) {
        return {
          transactions: persistedTransactions,
          has_more: false,
          stale: true,
          stale_reason: "premiumbonus_unavailable",
        };
      }

      const cached = await loadPbCache("history", userId);
      if (cached) {
        return {
          ...cached,
          stale: true,
          stale_reason: "premiumbonus_unavailable",
        };
      }

      return {
        transactions: [],
        has_more: false,
        stale: true,
        stale_reason: "premiumbonus_unavailable",
      };
    }
  }

  async calculateMaxSpend(userId, orderTotal, deliveryCost, options = {}) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.calculateMaxSpend(userId, orderTotal, deliveryCost);
    }

    const [users] = await db.query(
      "SELECT pb_client_id, loyalty_balance, phone FROM users WHERE id = ?",
      [userId]
    );
    if (users.length === 0) throw new Error("Пользователь не найден");
    const pbClientId = String(users[0].pb_client_id || "").trim();
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);
    const identificator = normalizedPhone || pbClientId;
    if (!identificator)
      throw new Error("У пользователя отсутствует идентификатор PremiumBonus (phone/pb_client_id)");

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    const payload = {
      identificator,
      items: mapOrderItemsToPremiumBonus(options?.items),
      discount: Number(options?.discount) || 0,
      promocode: String(options?.promocode || "").trim() || undefined,
    };
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      payload.items = [
        {
          name: "Заказ",
          amount: Number(orderTotal) || 0,
          quantity: 1,
          type: "product",
        },
      ];
    }

    try {
      const data = await client.purchaseRequest(payload);
      assertPremiumBonusSuccess(data, "PremiumBonus вернул ошибку при расчете списания");
      const baseAmount = Math.max(0, Number(orderTotal || 0) - Number(deliveryCost || 0));
      const result = {
        max_usable: normalizeBonusAmount(data?.write_off_available),
        user_balance: normalizeBonusAmount(data?.balance),
        max_percent: parseWriteOffPercentFromQuote(data, baseAmount),
        raw: data,
      };
      await syncLocalLoyaltyMirror(userId, {
        balance: result.user_balance,
        groupName: data?.group_name || "",
      });
      await savePbCache("maxspend", userId, result);
      return result;
    } catch (error) {
      const cached = await loadPbCache("maxspend", userId);
      if (cached) {
        return {
          ...cached,
          stale: true,
          stale_reason: "premiumbonus_unavailable",
        };
      }

      const localBalance = normalizeBonusAmount(users[0]?.loyalty_balance);
      const baseAmount = Math.max(0, Number(orderTotal || 0) - Number(deliveryCost || 0));
      const maxByRule = Math.floor(baseAmount * DEFAULT_MAX_SPEND_PERCENT);
      return {
        max_usable: Math.max(0, Math.min(localBalance, maxByRule)),
        user_balance: localBalance,
        max_percent: DEFAULT_MAX_SPEND_PERCENT,
        stale: true,
        stale_reason: "premiumbonus_unavailable",
      };
    }
  }

  async getLevelsSummary(userId) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.getLevelsSummary(userId);
    }
    return this.getPremiumBonusLevelsSummary(userId);
  }
}

export default new LoyaltyAdapter();
