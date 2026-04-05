import { getSystemSettings } from "../../../utils/settings.js";
import { validateCalculateMaxSpendQuery, validateHistoryQuery } from "../validators/loyaltyValidators.js";
import loyaltyAdapter from "../../integrations/adapters/loyaltyAdapter.js";
import { getPremiumBonusClientOrNull } from "../../integrations/services/integrationConfigService.js";
import db from "../../../config/database.js";

const normalizePhoneForPremiumBonus = (value) => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 10) return `7${digits}`;
  return digits;
};

const normalizeBonusAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return Math.ceil(parsed);
  return Math.floor(parsed);
};

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.status = statusCode;
  return error;
};

const resolveSecurePremiumBonusPhoneContext = async (userId) => {
  const [users] = await db.query("SELECT pb_client_id FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    throw createHttpError("Пользователь не найден", 404);
  }

  const pbClientId = String(users[0].pb_client_id || "").trim();
  if (!pbClientId) {
    throw createHttpError("Аккаунт PremiumBonus не привязан. Требуется подтверждение номера телефона.", 409);
  }

  const client = await getPremiumBonusClientOrNull();
  if (!client) {
    throw createHttpError("Клиент PremiumBonus недоступен", 503);
  }

  const info = await client.buyerInfo({ identificator: pbClientId });
  const normalizedPhone = normalizePhoneForPremiumBonus(info?.phone);
  if (!normalizedPhone || normalizedPhone.length !== 11) {
    throw createHttpError("Не удалось определить подтвержденный номер PremiumBonus", 502);
  }

  return { client, phone: normalizedPhone };
};

const ensureBonusesEnabled = async (res) => {
  const settings = await getSystemSettings();
  const loyaltyEnabled = Boolean(settings.bonuses_enabled) || Boolean(settings.premiumbonus_enabled);
  if (!loyaltyEnabled) {
    res.status(403).json({ error: "Бонусная система отключена" });
    return false;
  }
  return true;
};

const normalizeLoyaltyInfoSections = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      title: String(item?.title || "").trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item) => item.title && item.description);
};

const getClientLoyaltyCapabilities = (settings = {}) => ({
  historyAvailableForClient: !settings.premiumbonus_enabled,
  loyaltyInfoSections: normalizeLoyaltyInfoSections(settings.loyalty_info_sections),
});

const attachClientLoyaltyCapabilities = (payload, settings = {}) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  return {
    ...payload,
    ...getClientLoyaltyCapabilities(settings),
  };
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
        res.json(attachClientLoyaltyCapabilities(data, settings));
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
        res.json(attachClientLoyaltyCapabilities(data, settings));
      } catch (error) {
        next(error);
      }
    },

    async getHistory(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const { value } = validateHistoryQuery(req.query);
        const settings = await getSystemSettings();
        const capabilities = getClientLoyaltyCapabilities(settings);
        if (!capabilities.historyAvailableForClient) {
          return res.json({
            transactions: [],
            has_more: false,
            ...capabilities,
          });
        }
        const data = settings.premiumbonus_enabled
          ? await loyaltyAdapter.getTransactionHistory(req.user.id)
          : await loyaltyService.getHistory(req.user.id, value.page, value.limit);
        res.json(attachClientLoyaltyCapabilities(data, settings));
      } catch (error) {
        next(error);
      }
    },

    async getLevels(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const settings = await getSystemSettings();
        const data = settings.premiumbonus_enabled
          ? await loyaltyAdapter.getLevelsSummary(req.user.id)
          : await loyaltyService.getLevelsSummary(req.user.id);
        res.json(attachClientLoyaltyCapabilities(data, settings));
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

        const { client, phone: normalizedPhone } = await resolveSecurePremiumBonusPhoneContext(req.user.id);
        const result = await client.activatePromocode({
          phone: normalizedPhone,
          code,
        });

        return res.json(result);
      } catch (error) {
        next(error);
      }
    },

    async sendWriteOffConfirmationCode(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const settings = await getSystemSettings();
        if (!settings.premiumbonus_enabled) {
          return res.status(400).json({ error: "Интеграция PremiumBonus отключена" });
        }

        const purchaseAmount = Number(req.body?.purchase_amount);
        const writeOffBonus = normalizeBonusAmount(req.body?.write_off_bonus);
        if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
          return res.status(400).json({ error: "purchase_amount должен быть больше 0" });
        }
        if (writeOffBonus <= 0) {
          return res.status(400).json({ error: "write_off_bonus должен быть больше 0" });
        }

        const { client, phone: normalizedPhone } = await resolveSecurePremiumBonusPhoneContext(req.user.id);
        const result = await client.sendWriteOffConfirmationCode({
          phone: normalizedPhone,
          purchase_amount: Number(purchaseAmount.toFixed(2)),
          write_off_bonus: writeOffBonus,
        });
        return res.json(result);
      } catch (error) {
        next(error);
      }
    },

    async verifyConfirmationCode(req, res, next) {
      try {
        if (!(await ensureBonusesEnabled(res))) return;
        const settings = await getSystemSettings();
        if (!settings.premiumbonus_enabled) {
          return res.status(400).json({ error: "Интеграция PremiumBonus отключена" });
        }

        const code = String(req.body?.code || "").trim();
        if (!code) {
          return res.status(400).json({ error: "Код подтверждения обязателен" });
        }

        const { client, phone: normalizedPhone } = await resolveSecurePremiumBonusPhoneContext(req.user.id);
        const result = await client.verifyConfirmationCode({
          phone: normalizedPhone,
          code,
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
