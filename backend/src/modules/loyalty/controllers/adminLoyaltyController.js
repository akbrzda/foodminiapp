import { getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";
import { logger } from "../../../utils/logger.js";
import { validateAdjustBody, validateToggleBody, parseIntParam } from "../validators/loyaltyValidators.js";
import { getOrdersByUserAndCities } from "../repositories/loyaltyRepository.js";

export function createAdminLoyaltyController({ loyaltyService }) {
  return {
    async getStatus(req, res, next) {
      try {
        const settings = await getSystemSettings();
        res.json({ bonuses_enabled: Boolean(settings.bonuses_enabled) });
      } catch (error) {
        next(error);
      }
    },

    async toggle(req, res, next) {
      try {
        const { value, error } = validateToggleBody(req.body);
        if (error) {
          return res.status(400).json({ error });
        }
        const { updated, errors } = await updateSystemSettings({ bonuses_enabled: value.enabled });
        if (errors) {
          return res.status(400).json({ errors });
        }
        await logger.admin.action(req.user?.id, "toggle_loyalty", "settings", null, JSON.stringify(updated), req);
        res.json({ bonuses_enabled: value.enabled });
      } catch (error) {
        next(error);
      }
    },

    async adjust(req, res, next) {
      const connection = await loyaltyService.getConnection();
      try {
        await connection.beginTransaction();
        const { value, error } = validateAdjustBody(req.body);
        if (error) {
          await connection.rollback();
          return res.status(400).json({ error });
        }

        const settings = await getSystemSettings();
        if (!settings.bonuses_enabled) {
          await connection.rollback();
          return res.status(403).json({ error: "Бонусная система отключена" });
        }

        const delta = value.type === "spend" ? -Math.abs(value.amount) : Math.abs(value.amount);
        const result = await loyaltyService.applyManualBonusAdjustment({
          userId: value.userId,
          delta,
          description: value.reason,
          connection,
          adminId: req.user.id,
        });

        await connection.commit();
        await logger.admin.action(req.user?.id, "loyalty_adjust", "users", value.userId, JSON.stringify({ delta, reason: value.reason, type: value.type }), req);

        res.json({ balance: result.balance });
      } catch (error) {
        await connection.rollback();
        next(error);
      } finally {
        connection.release();
      }
    },

    async getUserLoyalty(req, res, next) {
      try {
        const userId = parseIntParam(req.params.id);
        if (!Number.isInteger(userId)) {
          return res.status(400).json({ error: "Некорректный ID" });
        }
        if (req.user.role === "manager") {
          const cityIds = Array.isArray(req.user.cities) ? req.user.cities.filter((cityId) => Number.isInteger(cityId)) : [];
          if (cityIds.length === 0) {
            return res.status(403).json({ error: "Нет доступа к пользователю" });
          }
          const orders = await getOrdersByUserAndCities(userId, cityIds);
          if (orders.length === 0) {
            return res.status(403).json({ error: "Нет доступа к пользователю" });
          }
        }

        const data = await loyaltyService.getAdminUserLoyalty(userId);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },
  };
}

export default {
  createAdminLoyaltyController,
};
