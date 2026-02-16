import { getIntegrationSettings, getPremiumBonusClientOrNull } from "../services/integrationConfigService.js";
import * as localLoyaltyService from "../../loyalty/services/loyaltyService.js";
import db from "../../../config/database.js";

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

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    const info = await client.buyerInfo({ identificator: users[0].pb_client_id || users[0].phone });
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

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    return client.transactionHistory({ identificator: users[0].pb_client_id || users[0].phone });
  }

  async calculateMaxSpend(userId, orderTotal, deliveryCost) {
    const mode = await this.getMode();
    if (mode === "local") {
      return localLoyaltyService.calculateMaxSpend(userId, orderTotal, deliveryCost);
    }

    const [users] = await db.query("SELECT pb_client_id, phone FROM users WHERE id = ?", [userId]);
    if (users.length === 0) throw new Error("Пользователь не найден");

    const client = await getPremiumBonusClientOrNull();
    if (!client) throw new Error("Клиент PremiumBonus недоступен");

    return client.purchaseRequest({
      identificator: users[0].pb_client_id || users[0].phone,
      order_total: Number(orderTotal) || 0,
      delivery_cost: Number(deliveryCost) || 0,
    });
  }
}

export default new LoyaltyAdapter();
