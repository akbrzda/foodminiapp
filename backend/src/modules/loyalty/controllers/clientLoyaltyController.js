import { getSystemSettings } from "../../../utils/settings.js";
import { validateCalculateMaxSpendQuery, validateHistoryQuery } from "../validators/loyaltyValidators.js";

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
        const data = await loyaltyService.getBalanceSummary(req.user.id);
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
        const data = await loyaltyService.calculateMaxSpend(req.user.id, value.orderTotal, value.deliveryCost);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },

    async getHistory(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const { value } = validateHistoryQuery(req.query);
        const data = await loyaltyService.getHistory(req.user.id, value.page, value.limit);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },

    async getLevels(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const data = await loyaltyService.getLevelsSummary(req.user.id);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },
  };
}

export default {
  createClientLoyaltyController,
};
