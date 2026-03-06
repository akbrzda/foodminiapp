import { getIntegrationSettings, getPremiumBonusClientOrNull } from "../services/integrationConfigService.js";
import * as localLoyaltyService from "../../loyalty/services/loyaltyService.js";
import db from "../../../config/database.js";

const DEFAULT_LEVEL_PERIOD_DAYS = 60;
const DEFAULT_MAX_SPEND_PERCENT = 0.25;
const DEFAULT_LEVEL_THRESHOLDS = [0, 10000, 20000];

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

function buildLevelsFromPremiumBonus(groupsResponse, transitionState) {
  const groups = Array.isArray(groupsResponse?.list) ? groupsResponse.list : [];
  if (groups.length === 0) {
    return [
      { id: 1, name: "Бронза", threshold: 0, earnRate: 0.03, maxSpendPercent: DEFAULT_MAX_SPEND_PERCENT },
      { id: 2, name: "Серебро", threshold: 10000, earnRate: 0.05, maxSpendPercent: DEFAULT_MAX_SPEND_PERCENT },
      { id: 3, name: "Золото", threshold: 20000, earnRate: 0.07, maxSpendPercent: DEFAULT_MAX_SPEND_PERCENT },
    ];
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
      maxSpendPercent: DEFAULT_MAX_SPEND_PERCENT,
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
      });
    }
  }

  transactions.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return transactions;
}

export class LoyaltyAdapter {
  async resolvePremiumBonusContext(userId) {
    const [users] = await db.query("SELECT pb_client_id, phone FROM users WHERE id = ?", [userId]);
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

    const levels = buildLevelsFromPremiumBonus(groupsResponse, transitionState);
    const totalSpent = toNumber(info?.payments_amount, toNumber(info?.init_payment_amount, 0));
    const currentLevel = resolveCurrentLevel(totalSpent, levels, info?.group_id, info?.group_name);
    const nextLevel = resolveNextLevel(currentLevel, levels);

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

    return {
      balance: normalizeBonusAmount(toNumber(info?.balance, 0)),
      current_level: currentLevel,
      next_level: nextLevel,
      total_spent_60_days: totalSpent,
      progress_to_next_level: progress,
      amount_to_next_level: amountToNext,
      levels,
      period_days: extractPeriodDays(transitionState),
      raw: {
        info,
        groups: groupsResponse,
        transitions: transitionsResponse,
      },
    };
  }

  async getMode() {
    const settings = await getIntegrationSettings();
    return settings.premiumbonusEnabled ? "premiumbonus" : "local";
  }

  async getUserBalance(userId) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.getBalanceSummary(userId);
    }
    const { client, identificator } = await this.resolvePremiumBonusContext(userId);
    const info = await client.buyerInfo({
      identificator,
      extra_fields: ["payments_amount"],
    });

    return {
      balance: normalizeBonusAmount(info?.balance),
      current_level: info?.group_name || null,
      total_spent_60_days: toNumber(info?.payments_amount, toNumber(info?.init_payment_amount, 0)),
      raw: info,
    };
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

    const response = await client.transactionHistory({
      phone: normalizedPhone,
      identificator: normalizedPhone || users[0].pb_client_id,
    });

    return {
      transactions: mapPbPurchasesToTransactions(response?.list || []),
      has_more: false,
      raw: response,
    };
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

    const data = await client.purchaseRequest(payload);
    return {
      max_usable: normalizeBonusAmount(data?.write_off_available),
      user_balance: normalizeBonusAmount(data?.balance),
      max_percent: null,
      raw: data,
    };
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
