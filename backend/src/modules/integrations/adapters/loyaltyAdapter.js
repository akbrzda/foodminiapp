import { getIntegrationSettings, getPremiumBonusClientOrNull } from "../services/integrationConfigService.js";
import * as localLoyaltyService from "../../loyalty/services/loyaltyService.js";
import db from "../../../config/database.js";

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
        amount: writeOff,
        created_at: createdAt,
        order_id: orderRef,
        order_number: orderRef,
      });
    }
    if (writeOn > 0) {
      transactions.push({
        id: `${purchase?.id || orderRef || createdAt || Math.random()}-earn`,
        type: "earn",
        amount: writeOn,
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
  async getMode() {
    const settings = await getIntegrationSettings();
    return settings.premiumbonusEnabled ? "premiumbonus" : "local";
  }

  async getUserBalance(userId) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.getBalanceSummary(userId);
    }

    const [users] = await db.query("SELECT pb_client_id, phone FROM users WHERE id = ?", [userId]);
    if (users.length === 0) throw new Error("Пользователь не найден");
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    const info = await client.buyerInfo({ identificator: normalizedPhone || users[0].pb_client_id });
    return {
      balance: Number(info?.balance || 0),
      current_level: info?.buyer_group || null,
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

  async calculateMaxSpend(userId, orderTotal, deliveryCost) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.calculateMaxSpend(userId, orderTotal, deliveryCost);
    }

    const [users] = await db.query("SELECT pb_client_id, phone FROM users WHERE id = ?", [userId]);
    if (users.length === 0) throw new Error("Пользователь не найден");
    const normalizedPhone = normalizePhoneForPremiumBonus(users[0].phone);

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    return client.purchaseRequest({
      identificator: normalizedPhone || users[0].pb_client_id,
      order_total: Number(orderTotal) || 0,
      delivery_cost: Number(deliveryCost) || 0,
    });
  }
}

export default new LoyaltyAdapter();
