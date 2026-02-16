import { getSystemSettings } from "../../../utils/settings.js";
import { validateCalculateMaxSpendQuery, validateHistoryQuery } from "../validators/loyaltyValidators.js";
import loyaltyAdapter from "../../integrations/adapters/loyaltyAdapter.js";
import { getPremiumBonusClientOrNull } from "../../integrations/services/integrationConfigService.js";
import db from "../../../config/database.js";

const ensureBonusesEnabled = async (res) => {
  const settings = await getSystemSettings();
  if (!settings.bonuses_enabled) {
    res.status(403).json({ error: "Бонусная система отключена" });
    return false;
  }
  return true;
};

export function createClientLoyaltyController({ loyaltyService }) {
  return {
    async getBalance(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const settings = await getSystemSettings();
        const data = settings.premiumbonus_enabled
          ? await loyaltyAdapter.getUserBalance(req.user.id)
          : await loyaltyService.getBalanceSummary(req.user.id);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },

    async calculateMaxSpend(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const { value, error } = validateCalculateMaxSpendQuery(req.query);
        if (error) {
          return res.status(400).json({ error });
        }
        const settings = await getSystemSettings();
        const data = settings.premiumbonus_enabled
          ? await loyaltyAdapter.calculateMaxSpend(req.user.id, value.orderTotal, value.deliveryCost)
          : await loyaltyService.calculateMaxSpend(req.user.id, value.orderTotal, value.deliveryCost);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },

    async getHistory(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const { value } = validateHistoryQuery(req.query);
        const settings = await getSystemSettings();
        const data = settings.premiumbonus_enabled
          ? await loyaltyAdapter.getTransactionHistory(req.user.id)
          : await loyaltyService.getHistory(req.user.id, value.page, value.limit);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },

    async getLevels(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const settings = await getSystemSettings();
        const data = settings.premiumbonus_enabled
          ? await loyaltyAdapter.getUserBalance(req.user.id)
          : await loyaltyService.getLevelsSummary(req.user.id);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },

    async activatePromocode(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const settings = await getSystemSettings();
        if (!settings.premiumbonus_enabled) {
          return res.status(400).json({ error: "Интеграция PremiumBonus отключена" });
        }

        const code = String(req.body?.code || "").trim();
        if (!code) {
          return res.status(400).json({ error: "Промокод обязателен" });
        }

        const [users] = await db.query("SELECT phone, pb_client_id FROM users WHERE id = ?", [req.user.id]);
        if (users.length === 0) {
          return res.status(404).json({ error: "Пользователь не найден" });
        }

        const client = await getPremiumBonusClientOrNull();
        if (!client) {
          return res.status(503).json({ error: "Клиент PremiumBonus недоступен" });
        }

        const result = await client.activatePromocode({
          identificator: users[0].pb_client_id || users[0].phone,
          promocode: code,
        });

        return res.json(result);
      } catch (error) {
        next(error);
      }
    },
  };
}

export default {
  createClientLoyaltyController,
};
