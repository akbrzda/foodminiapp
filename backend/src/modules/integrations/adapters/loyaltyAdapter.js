import { getIntegrationSettings, getPremiumBonusClientOrNull } from "../services/integrationConfigService.js";
import * as localLoyaltyService from "../../loyalty/services/loyaltyService.js";
import db from "../../../config/database.js";
import redis from "../../../config/redis.js";

const DEFAULT_LEVEL_PERIOD_DAYS = 60;
const DEFAULT_MAX_SPEND_PERCENT = 0.25;
const DEFAULT_LEVEL_THRESHOLDS = [0, 10000, 20000];
const PB_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

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

function parsePbActiveBalance(info = {}) {
  const inactive = Math.max(0, toNumber(info?.bonus_inactive, 0));
  const accumulated = Number(info?.balance_bonus_accumulated);
  const present = Number(info?.balance_bonus_present);
  const action = Number(info?.balance_bonus_action);
  if (Number.isFinite(accumulated) || Number.isFinite(present) || Number.isFinite(action)) {
    const bucketsTotal =
      (Number.isFinite(accumulated) ? accumulated : 0) + (Number.isFinite(present) ? present : 0) + (Number.isFinite(action) ? action : 0);
    return normalizeBonusAmount(Math.max(0, bucketsTotal - inactive));
  }

  const rawBalance = toNumber(info?.balance, NaN);
  if (!Number.isFinite(rawBalance)) return 0;
  return normalizeBonusAmount(Math.max(0, rawBalance - inactive));
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

async function resolvePremiumBonusWriteOffPercent(client, identificator, activeBalance) {
  const balance = toNumber(activeBalance, 0);
  if (balance <= 0) return null;

  const probeAmount = Number(Math.max(1, balance).toFixed(2));
  const quote = await client.purchaseRequest({
    identificator,
    items: [
      {
        name: "Проверка списания",
        amount: probeAmount,
        quantity: 1,
        type: "product",
      },
    ],
  });

  return parseWriteOffPercentFromQuote(quote, probeAmount);
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
      [normalizedGroupId],
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
      [normalizedGroupName, normalizedGroupName],
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
    [percent],
  );
  return rows[0]?.id || null;
}

async function getLocalLoyaltyLevelsForDisplay(options = {}) {
  const [rows] = await db.query(
    `SELECT id, name, threshold_amount, earn_percentage, max_spend_percentage, is_enabled, sort_order, pb_group_id, pb_group_name
     FROM loyalty_levels
     WHERE is_enabled = 1
     ORDER BY sort_order ASC, threshold_amount ASC, id ASC`,
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
  const normalizedGroupName = String(groupName || "").trim().toLowerCase();
  if (!levels.length) return null;

  if (normalizedGroupId) {
    const byId = levels.find((level) => String(level.pbGroupId || "").trim() === normalizedGroupId);
    if (byId) return byId;
  }

  if (normalizedGroupName) {
    const byPbName = levels.find((level) => String(level.pbGroupName || "").trim().toLowerCase() === normalizedGroupName);
    if (byPbName) return byPbName;
    const byLocalName = levels.find((level) => String(level.name || "").trim().toLowerCase() === normalizedGroupName);
    if (byLocalName) return byLocalName;
  }

  const groupPercent = parseGroupPercent(groupName);
  if (Number.isFinite(groupPercent)) {
    const byPercent = levels.find((level) => Math.round(Number(level.earnRate || 0) * 100) === Math.round(groupPercent));
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
    const byName = levels.find((level) => String(level.name || "").trim().toLowerCase() === normalizedGroupName);
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

function extractPeriodDays(transitionState) {
  const direct = toNumber(transitionState?.period_days, 0);
  if (direct > 0) return Math.floor(direct);

  const candidates = [
    ...(Array.isArray(transitionState?.client_group_transitions_list) ? transitionState.client_group_transitions_list : []),
    ...(Array.isArray(transitionState?.transition_up) ? transitionState.transition_up : []),
    ...(Array.isArray(transitionState?.transition_keep) ? transitionState.transition_keep : []),
    ...(Array.isArray(transitionState?.transition_down) ? transitionState.transition_down : []),
  ];
  for (const item of candidates) {
    const value =
      toNumber(item?.period_days, 0) ||
      toNumber(item?.period_day, 0) ||
      toNumber(item?.period, 0) ||
      toNumber(item?.days, 0);
    if (value > 0) return Math.floor(value);
  }
  return DEFAULT_LEVEL_PERIOD_DAYS;
}

function extractAmountToNextLevel(transitionState) {
  const up = Array.isArray(transitionState?.transition_up) ? transitionState.transition_up : [];
  for (const item of up) {
    const value = firstFinite(
      toNumber(item?.leftover, NaN),
      toNumber(item?.left_amount, NaN),
      toNumber(item?.leftover_amount, NaN),
      toNumber(item?.amount_left, NaN),
      toNumber(item?.sum_left, NaN),
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
    toNumber(transition?.amount_from, NaN),
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
  const transitions = Array.isArray(transitionState?.client_group_transitions_list) ? transitionState.client_group_transitions_list : [];
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
      earnRate: Number.isFinite(parseGroupPercent(normalizedName)) ? parseGroupPercent(normalizedName) / 100 : 0,
      maxSpendPercent,
    };

    if (!current.id && normalizedId) current.id = normalizedId;
    if ((!current.name || /^уровень /i.test(current.name)) && normalizedName) current.name = normalizedName;
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

    const fromId = extractTransitionField(transition, ["client_group_from_id", "from_group_id", "old_group_id", "group_from_id"]);
    const fromName = extractTransitionField(transition, ["client_group_transition_from_name", "from_group_name", "old_group_name", "group_from_name"]);
    const toId = extractTransitionField(transition, ["client_group_id", "buyer_group_id", "group_id", "to_group_id", "target_group_id", "new_group_id"]);
    const toName = extractTransitionField(transition, ["client_group_transition_to_name", "to_group_name", "new_group_name", "group_to_name"]);

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
    threshold: Number.isFinite(level.threshold) ? level.threshold : DEFAULT_LEVEL_THRESHOLDS[index] ?? 0,
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
          earnRate: Number.isFinite(parseGroupPercent(currentGroupName)) ? parseGroupPercent(currentGroupName) / 100 : 0,
          maxSpendPercent,
        },
      ];
    }

    return [{ id: 1, name: "Текущий уровень", threshold: 0, earnRate: 0, maxSpendPercent }];
  }

  const transitions = Array.isArray(transitionState?.client_group_transitions_list) ? transitionState.client_group_transitions_list : [];
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
      toNumber(transition?.amount_from, NaN),
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
    const fallbackThreshold = DEFAULT_LEVEL_THRESHOLDS[index] ?? DEFAULT_LEVEL_THRESHOLDS[DEFAULT_LEVEL_THRESHOLDS.length - 1] ?? 0;

    return {
      id: group?.id ?? index + 1,
      name: String(group?.name || "").trim() || `Уровень ${index + 1}`,
      threshold: Number.isFinite(transitionThreshold) ? transitionThreshold : fallbackThreshold,
      earnRate: Number.isFinite(percent) ? percent / 100 : 0,
      maxSpendPercent,
    };
  });

  const hasThresholdData = mapped.some((level, index) => Number(level.threshold) !== Number(DEFAULT_LEVEL_THRESHOLDS[index] ?? 0));
  const sorted = mapped.sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
  if (hasThresholdData) return sorted;

  return sorted.map((level, index) => ({
    ...level,
    threshold: DEFAULT_LEVEL_THRESHOLDS[index] ?? DEFAULT_LEVEL_THRESHOLDS[DEFAULT_LEVEL_THRESHOLDS.length - 1] ?? 0,
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
        external_item_id: String(item?.iiko_item_id || item?.item_id || item?.id || "").trim() || undefined,
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
    const writeOff =
      toNumber(purchase?.bonus_accumulated_write_off) + toNumber(purchase?.bonus_present_write_off) + toNumber(purchase?.bonus_action_write_off);
    const writeOn =
      toNumber(purchase?.bonus_accumulated_write_on) + toNumber(purchase?.bonus_present_write_on) + toNumber(purchase?.bonus_action_write_on);
    const activationAtRaw =
      purchase?.bonus_activation_at ||
      purchase?.bonus_activate_at ||
      purchase?.bonus_write_on_activate_at ||
      purchase?.bonus_write_on_activation_at ||
      purchase?.write_on_activation_at ||
      null;
    let activationAt = null;
    if (activationAtRaw) {
      const parsedActivation = new Date(activationAtRaw);
      if (!Number.isNaN(parsedActivation.getTime())) {
        activationAt = parsedActivation.toISOString();
      }
    }
    const isPendingEarn = activationAt ? new Date(activationAt).getTime() > Date.now() : false;

    if (writeOff > 0) {
      transactions.push({
        id: `${purchase?.id || orderRef || createdAt || Math.random()}-spend`,
        type: "spend",
        amount: normalizeBonusAmount(writeOff),
        created_at: createdAt,
        order_id: orderRef,
        order_number: orderRef,
      });
    }
    if (writeOn > 0) {
      transactions.push({
        id: `${purchase?.id || orderRef || createdAt || Math.random()}-earn`,
        type: "earn",
        amount: normalizeBonusAmount(writeOn),
        created_at: createdAt,
        order_id: orderRef,
        order_number: orderRef,
        status: isPendingEarn ? "pending" : "completed",
        activate_at: activationAt,
      });
    }
  }

  transactions.sort((a, b) => {
    const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    if (diff !== 0) return diff;
    const sameOrder = String(a.order_id || "") && String(a.order_id || "") === String(b.order_id || "");
    if (sameOrder && a.type !== b.type) {
      if (a.type === "earn") return -1;
      if (b.type === "earn") return 1;
    }
    const idDiff = Number(String(b.id || "").replace(/[^\d]/g, "")) - Number(String(a.id || "").replace(/[^\d]/g, ""));
    if (Number.isFinite(idDiff) && idDiff !== 0) return idDiff;
    if (a.type === b.type) return 0;
    if (a.type === "earn") return -1;
    if (b.type === "earn") return 1;
    return 0;
  });
  return transactions;
}

function normalizeOrderReference(value) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  return normalized;
}

async function buildLocalOrderReferenceSet(userId) {
  const [rows] = await db.query(
    `SELECT id, order_number, pb_purchase_id
     FROM orders
     WHERE user_id = ?`,
    [userId],
  );

  const references = new Set();
  for (const row of rows) {
    const idRef = normalizeOrderReference(row?.id);
    const orderNumberRef = normalizeOrderReference(row?.order_number);
    const pbPurchaseRef = normalizeOrderReference(row?.pb_purchase_id);
    if (idRef) references.add(idRef);
    if (orderNumberRef) references.add(orderNumberRef);
    if (pbPurchaseRef) references.add(pbPurchaseRef);
  }

  return references;
}

function filterPbPurchasesByLocalOrders(list = [], orderReferences = new Set()) {
  if (!orderReferences || orderReferences.size === 0) return [];

  return (Array.isArray(list) ? list : []).filter((purchase) => {
    const candidates = [
      purchase?.external_id,
      purchase?.external_purchase_id,
      purchase?.id,
      purchase?.purchase_id,
    ]
      .map((value) => normalizeOrderReference(value))
      .filter(Boolean);

    return candidates.some((candidate) => orderReferences.has(candidate));
  });
}

function getPbCacheKey(type, userId) {
  return `pb:loyalty:${type}:user:${userId}`;
}

async function savePbCache(type, userId, payload) {
  try {
    await redis.set(getPbCacheKey(type, userId), JSON.stringify(payload), "EX", PB_CACHE_TTL_SECONDS);
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

async function syncLocalLoyaltyMirror(userId, payload = {}) {
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, "balance")) {
    const normalizedBalance = normalizeBonusAmount(payload.balance);
    updates.push("loyalty_balance = ?");
    values.push(normalizedBalance);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "groupName") || Object.prototype.hasOwnProperty.call(payload, "groupId")) {
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
    const [users] = await db.query("SELECT pb_client_id, phone, loyalty_balance FROM users WHERE id = ?", [userId]);
    if (users.length === 0) throw new Error("Пользователь не найден");

    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);
    const identificator = normalizedPhone || users[0].pb_client_id;
    if (!identificator) {
      throw new Error("У пользователя отсутствует идентификатор PremiumBonus");
    }

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    return {
      user: users[0],
      normalizedPhone,
      identificator,
      client,
    };
  }

  async getPremiumBonusLevelsSummary(userId) {
    const { client, identificator, normalizedPhone } = await this.resolvePremiumBonusContext(userId);

    try {
      const info = await client.buyerInfo({
        identificator,
        extra_fields: ["payments_amount"],
      });

      const [groupsResult, transitionsResult] = await Promise.allSettled([
        client.buyerGroups({}),
        normalizedPhone ? client.statusTransitionInfo({ phone: normalizedPhone }) : Promise.resolve(null),
      ]);

      const groupsResponse = groupsResult.status === "fulfilled" ? groupsResult.value : null;
      const transitionsResponse = transitionsResult.status === "fulfilled" ? transitionsResult.value : null;
      const transitionState = transitionsResponse?.client_group_transition_leftover || {};

      let maxSpendPercent = null;
      try {
        maxSpendPercent = await resolvePremiumBonusWriteOffPercent(client, identificator, info?.balance);
      } catch (error) {
        maxSpendPercent = null;
      }

      const levels = buildLevelsFromPremiumBonus(groupsResponse, transitionState, {
        maxSpendPercent,
        info,
      });
      const totalSpent = toNumber(info?.payments_amount, toNumber(info?.init_payment_amount, 0));
      const localLevels = await getLocalLoyaltyLevelsForDisplay({
        forcedMaxSpendPercent: maxSpendPercent,
      });
      const mappedCurrentLocalLevel = resolveCurrentLocalLevelByPbGroup(localLevels, info?.group_id, info?.group_name);
      const uiLevels = localLevels.length > 0 ? localLevels : levels;
      const currentLevel = mappedCurrentLocalLevel || resolveCurrentLevel(totalSpent, uiLevels, info?.group_id, info?.group_name);
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
          progress = Math.min(1, Math.max(0, (totalSpent - Number(currentLevel.threshold || 0)) / span));
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
        max_spend_percent: normalizePercent(maxSpendPercent) ?? null,
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
    const { client, identificator, user } = await this.resolvePremiumBonusContext(userId);
    try {
      const info = await client.buyerInfo({
        identificator,
        extra_fields: ["payments_amount"],
      });

      const result = {
        balance: parsePbActiveBalance(info),
        current_level: info?.group_name || null,
        total_spent_60_days: toNumber(info?.payments_amount, toNumber(info?.init_payment_amount, 0)),
        total_spent_all_time: toNumber(info?.payments_amount, toNumber(info?.init_payment_amount, 0)),
        period_days: null,
        bonus_inactive: normalizeBonusAmount(toNumber(info?.bonus_inactive, 0)),
        bonus_next_activation_text: String(info?.bonus_next_activation_text || "").trim() || null,
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
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    try {
      const response = await client.transactionHistory({
        phone: normalizedPhone,
        identificator: normalizedPhone || users[0].pb_client_id,
      });
      const localOrderReferences = await buildLocalOrderReferenceSet(userId);
      const filteredPurchases = filterPbPurchasesByLocalOrders(response?.list || [], localOrderReferences);

      const result = {
        transactions: mapPbPurchasesToTransactions(filteredPurchases),
        has_more: false,
        raw: {
          ...response,
          list: filteredPurchases,
        },
      };
      await savePbCache("history", userId, result);
      return result;
    } catch (error) {
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

    const [users] = await db.query("SELECT pb_client_id, phone FROM users WHERE id = ?", [userId]);
    if (users.length === 0) throw new Error("Пользователь не найден");
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    const payload = {
      identificator: normalizedPhone || users[0].pb_client_id,
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
