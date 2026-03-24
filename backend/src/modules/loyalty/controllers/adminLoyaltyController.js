import { getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";
import { logger } from "../../../utils/logger.js";
import { validateAdjustBody, validateToggleBody, parseIntParam } from "../validators/loyaltyValidators.js";
import { getOrdersByUserAndCities } from "../repositories/loyaltyRepository.js";
import loyaltyAdapter from "../../integrations/adapters/loyaltyAdapter.js";
import db from "../../../config/database.js";
import { getIntegrationSettings, getPremiumBonusClientOrNull } from "../../integrations/services/integrationConfigService.js";
import { decryptEmail } from "../../../utils/encryption.js";

const DEFAULT_PB_EARN_TRIGGER_AMOUNTS = new Set([1, 5, 10, 50, 100]);

export function createAdminLoyaltyController({ loyaltyService }) {
  const normalizePhoneForPremiumBonus = (value) => {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (digits.length === 11 && digits.startsWith("7")) return digits;
    if (digits.length === 10) return `7${digits}`;
    return digits;
  };

  const normalizePbGroupName = (value) => String(value || "").trim();
  const normalizePbGroupId = (value) => String(value || "").trim();
  const parsePercent = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.floor(parsed)));
  };
  const parseMoney = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Number(parsed.toFixed(2)));
  };
  const parseSortOrder = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.floor(parsed);
  };
  const normalizeTriggerAmount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const normalized = Math.floor(parsed);
    if (normalized <= 0) return null;
    return normalized;
  };
  const decomposeAmountByChunks = (amount, chunks = []) => {
    let remaining = amount;
    const plan = [];
    for (const chunk of chunks) {
      if (!Number.isInteger(chunk) || chunk <= 0) continue;
      while (remaining >= chunk) {
        plan.push(chunk);
        remaining -= chunk;
      }
    }
    if (remaining !== 0) return null;
    return plan;
  };
  const buildEarnTriggerPlan = (configuredValue, amount) => {
    const normalizedAmount = normalizeTriggerAmount(amount);
    if (!normalizedAmount) return null;

    const source = String(configuredValue || "").trim();
    if (!source) {
      const chunks = Array.from(DEFAULT_PB_EARN_TRIGGER_AMOUNTS).sort((a, b) => b - a);
      const decomposed = decomposeAmountByChunks(normalizedAmount, chunks);
      if (!decomposed) return null;
      return decomposed.map((chunk) => ({
        amount: chunk,
        event_name: `starterRefill${chunk}`,
      }));
    }

    if (source.includes("{{amount}}")) {
      const chunks = Array.from(DEFAULT_PB_EARN_TRIGGER_AMOUNTS).sort((a, b) => b - a);
      const decomposed = decomposeAmountByChunks(normalizedAmount, chunks);
      if (!decomposed) return null;
      return decomposed.map((chunk) => ({
        amount: chunk,
        event_name: source.replaceAll("{{amount}}", String(chunk)),
      }));
    }

    if (source.startsWith("{")) {
      try {
        const parsed = JSON.parse(source);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        const entries = Object.entries(parsed)
          .map(([rawAmount, rawEventName]) => ({
            amount: normalizeTriggerAmount(rawAmount),
            event_name: String(rawEventName || "").trim(),
          }))
          .filter((item) => Number.isInteger(item.amount) && item.amount > 0 && item.event_name)
          .sort((a, b) => b.amount - a.amount);
        if (!entries.length) return null;
        const decomposed = decomposeAmountByChunks(
          normalizedAmount,
          entries.map((entry) => entry.amount)
        );
        if (!decomposed) return null;

        return decomposed.map((chunk) => ({
          amount: chunk,
          event_name: entries.find((entry) => entry.amount === chunk)?.event_name || "",
        }));
      } catch (error) {
        return null;
      }
    }

    return [
      {
        amount: normalizedAmount,
        event_name: source,
      },
    ];
  };

  const mapDbLevel = (row) => ({
    id: row.id,
    name: row.name,
    threshold_amount: Number(row.threshold_amount || 0),
    earn_percentage: Number(row.earn_percentage || 0),
    max_spend_percentage: Number(row.max_spend_percentage || 0),
    is_enabled: Boolean(row.is_enabled),
    sort_order: Number(row.sort_order || 0),
    pb_group_id: row.pb_group_id || "",
    pb_group_name: row.pb_group_name || "",
  });

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
      try {
        const { value, error } = validateAdjustBody(req.body);
        if (error) {
          return res.status(400).json({ error });
        }

        const settings = await getSystemSettings();
        if (!settings.bonuses_enabled) {
          return res.status(403).json({ error: "Бонусная система отключена" });
        }

        const integrationSettings = await getIntegrationSettings();
        const usePremiumBonus =
          Boolean(settings.premiumbonus_enabled) &&
          String(integrationSettings?.integrationMode?.loyalty || "local")
            .trim()
            .toLowerCase() === "external";

        if (usePremiumBonus) {
          if (value.type === "spend") {
            return res.status(400).json({
              error:
                "В режиме PremiumBonus ручное списание через admin adjust отключено. Доступно только ручное начисление через trigger.",
            });
          }

          const normalizedTriggerAmount = normalizeTriggerAmount(value.amount);
          if (!normalizedTriggerAmount) {
            return res.status(400).json({
              error: "Для начисления через PremiumBonus amount должен быть положительным целым числом",
            });
          }

          const triggerPlan = buildEarnTriggerPlan(
            integrationSettings.premiumbonusTriggerAdjustEarnEventName,
            normalizedTriggerAmount
          );
          if (!triggerPlan || triggerPlan.length === 0 || triggerPlan.some((item) => !item.event_name)) {
            return res.status(400).json({
              error:
                "Не найден trigger-план для указанной суммы. По умолчанию поддерживаются комбинации 1/5/10/50/100, либо задайте premiumbonus_trigger_adjust_earn_event_name (шаблон {{amount}} или JSON-маппинг).",
            });
          }

          const [users] = await db.query("SELECT id, phone, email FROM users WHERE id = ? LIMIT 1", [value.userId]);
          if (!users.length) {
            return res.status(404).json({ error: "Пользователь не найден" });
          }
          const phone = normalizePhoneForPremiumBonus(users[0].phone);
          let email = "";
          try {
            email = String(users[0].email ? decryptEmail(users[0].email) : "").trim();
          } catch (decryptError) {
            email = "";
          }
          if (!phone && !email) {
            return res.status(400).json({ error: "У пользователя отсутствуют корректные phone/email для PremiumBonus" });
          }

          const client = await getPremiumBonusClientOrNull();
          if (!client) {
            return res.status(503).json({ error: "Клиент PremiumBonus недоступен" });
          }

          const executedTriggers = [];
          for (const step of triggerPlan) {
            const triggerPayload = {
              event_name: step.event_name,
              ...(phone ? { phone } : { email }),
            };

            const triggerResponse = await client.trigger(triggerPayload);
            if (triggerResponse?.success === false) {
              return res.status(400).json({
                error: String(
                  triggerResponse?.error_description ||
                    triggerResponse?.error ||
                    "PremiumBonus вернул ошибку запуска триггера"
                ),
                failed_trigger: step.event_name,
                executed_triggers: executedTriggers,
              });
            }

            executedTriggers.push({
              event_name: step.event_name,
              amount: step.amount,
              logger: triggerResponse?.logger || null,
            });
          }

          const freshBalance = await loyaltyAdapter.getUserBalance(value.userId);
          await logger.admin.action(
            req.user?.id,
            "loyalty_adjust_pb_trigger",
            "users",
            value.userId,
            JSON.stringify({
              trigger_plan: triggerPlan,
              executed_triggers: executedTriggers,
              reason: value.reason,
              type: value.type,
              requested_amount: value.amount,
              normalized_amount: normalizedTriggerAmount,
            }),
            req,
          );

          return res.json({
            balance: freshBalance?.balance ?? 0,
            mode: "premiumbonus",
            trigger_event: executedTriggers[0]?.event_name || null,
            trigger_events: executedTriggers,
            normalized_amount: normalizedTriggerAmount,
            warning:
              "Сумма разложена на набор trigger-событий PremiumBonus; итог начисления и срок активации задаются сценариями PB.",
          });
        }

        const connection = await loyaltyService.getConnection();
        try {
          await connection.beginTransaction();
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
          throw error;
        } finally {
          connection.release();
        }
      } catch (error) {
        next(error);
      }
    },

    async getLevels(req, res, next) {
      try {
        const [rows] = await db.query(
          `SELECT id, name, threshold_amount, earn_percentage, max_spend_percentage, is_enabled, sort_order, pb_group_id, pb_group_name
           FROM loyalty_levels
           ORDER BY sort_order ASC, threshold_amount ASC, id ASC`,
        );

        const integrationSettings = await getIntegrationSettings();
        const usePremiumBonus =
          Boolean(integrationSettings?.premiumbonusEnabled) &&
          String(integrationSettings?.integrationMode?.loyalty || "local")
            .trim()
            .toLowerCase() === "external";

        let pbGroups = [];
        if (usePremiumBonus) {
          const client = await getPremiumBonusClientOrNull();
          if (client) {
            try {
              const groups = await client.buyerGroups({});
              pbGroups = (Array.isArray(groups?.list) ? groups.list : []).map((group) => ({
                id: String(group?.id || "").trim(),
                name: String(group?.name || "").trim(),
              }));
            } catch (error) {
              pbGroups = [];
            }
          }
        }

        return res.json({
          levels: rows.map(mapDbLevel),
          pb_groups: pbGroups,
          mode: {
            premiumbonus_enabled: Boolean(integrationSettings?.premiumbonusEnabled),
            loyalty_integration_mode: String(integrationSettings?.integrationMode?.loyalty || "local"),
          },
        });
      } catch (error) {
        next(error);
      }
    },

    async saveLevels(req, res, next) {
      const connection = await loyaltyService.getConnection();
      let transactionStarted = false;
      try {
        const levels = Array.isArray(req.body?.levels) ? req.body.levels : [];
        if (!levels.length) {
          return res.status(400).json({ error: "Список уровней не может быть пустым" });
        }

        const normalized = levels.map((level, index) => ({
          id: Number(level?.id) || null,
          name: String(level?.name || "").trim(),
          threshold_amount: parseMoney(level?.threshold_amount, 0),
          earn_percentage: parsePercent(level?.earn_percentage, 0),
          max_spend_percentage: parsePercent(level?.max_spend_percentage, 0),
          is_enabled: level?.is_enabled !== false,
          sort_order: parseSortOrder(level?.sort_order, (index + 1) * 10),
          pb_group_id: normalizePbGroupId(level?.pb_group_id),
          pb_group_name: normalizePbGroupName(level?.pb_group_name),
        }));

        if (normalized.some((level) => !level.name)) {
          return res.status(400).json({ error: "Название уровня обязательно для всех записей" });
        }

        const thresholdSet = new Set();
        for (const level of normalized) {
          const key = level.threshold_amount.toFixed(2);
          if (thresholdSet.has(key)) {
            return res.status(400).json({ error: "Пороговые суммы уровней должны быть уникальными" });
          }
          thresholdSet.add(key);
        }

        const pbGroupIdSet = new Set();
        for (const level of normalized) {
          if (!level.pb_group_id) continue;
          if (pbGroupIdSet.has(level.pb_group_id)) {
            return res.status(400).json({ error: "PB Group ID должен быть уникальным между уровнями" });
          }
          pbGroupIdSet.add(level.pb_group_id);
        }

        await connection.beginTransaction();
        transactionStarted = true;

        for (const level of normalized) {
          if (level.id) {
            await connection.query(
              `UPDATE loyalty_levels
               SET name = ?, threshold_amount = ?, earn_percentage = ?, max_spend_percentage = ?, is_enabled = ?, sort_order = ?, pb_group_id = ?, pb_group_name = ?
               WHERE id = ?`,
              [
                level.name,
                level.threshold_amount,
                level.earn_percentage,
                level.max_spend_percentage,
                level.is_enabled ? 1 : 0,
                level.sort_order,
                level.pb_group_id || null,
                level.pb_group_name || null,
                level.id,
              ],
            );
          } else {
            await connection.query(
              `INSERT INTO loyalty_levels
               (name, threshold_amount, earn_percentage, max_spend_percentage, is_enabled, sort_order, pb_group_id, pb_group_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                level.name,
                level.threshold_amount,
                level.earn_percentage,
                level.max_spend_percentage,
                level.is_enabled ? 1 : 0,
                level.sort_order,
                level.pb_group_id || null,
                level.pb_group_name || null,
              ],
            );
          }
        }

        await connection.commit();
        await logger.admin.action(req.user?.id, "loyalty_levels_save", "loyalty_levels", null, JSON.stringify({ levels: normalized }), req);

        const [rows] = await db.query(
          `SELECT id, name, threshold_amount, earn_percentage, max_spend_percentage, is_enabled, sort_order, pb_group_id, pb_group_name
           FROM loyalty_levels
           ORDER BY sort_order ASC, threshold_amount ASC, id ASC`,
        );
        return res.json({ levels: rows.map(mapDbLevel) });
      } catch (error) {
        if (transactionStarted) {
          await connection.rollback();
        }
        if (String(error?.message || "").includes("uniq_loyalty_threshold")) {
          return res.status(400).json({ error: "Пороговые суммы уровней должны быть уникальными" });
        }
        if (String(error?.message || "").includes("uniq_loyalty_levels_pb_group_id")) {
          return res.status(400).json({ error: "PB Group ID должен быть уникальным" });
        }
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

        const settings = await getSystemSettings();
        const integrationSettings = await getIntegrationSettings();
        const usePremiumBonus =
          Boolean(settings.premiumbonus_enabled) &&
          String(integrationSettings?.integrationMode?.loyalty || "local")
            .trim()
            .toLowerCase() === "external";
        let data;

        if (usePremiumBonus) {
          const [users] = await db.query(
            `SELECT u.id, u.first_name, u.last_name, u.phone, u.loyalty_balance, u.loyalty_joined_at, u.current_loyalty_level_id
             FROM users u
             WHERE u.id = ?
             LIMIT 1`,
            [userId],
          );
          if (!users.length) {
            return res.status(404).json({ error: "Пользователь не найден" });
          }

          const [balanceSummary, levelsSummary, historySummary] = await Promise.all([
            loyaltyAdapter.getUserBalance(userId),
            loyaltyAdapter.getLevelsSummary(userId),
            loyaltyAdapter.getTransactionHistory(userId),
          ]);

          const transactions = (Array.isArray(historySummary?.transactions) ? historySummary.transactions : []).map((tx) => ({
            ...tx,
            status: tx?.status || "completed",
          }));

          const totalEarned = transactions
            .filter((tx) => tx.type === "earn" || tx.type === "registration" || tx.type === "birthday")
            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
          const totalSpent = transactions.filter((tx) => tx.type === "spend").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
          const totalExpired = transactions.filter((tx) => tx.type === "expire").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

          data = {
            user: users[0],
            stats: {
              total_spent_all_time: Math.floor(Number(levelsSummary?.total_spent_all_time) || 0),
              total_earned: Math.floor(totalEarned),
              total_spent: Math.floor(totalSpent),
              total_expired: Math.floor(totalExpired),
              progress_to_next_level: Number(levelsSummary?.progress_to_next_level) || 0,
              amount_to_next_level: Math.floor(Number(levelsSummary?.amount_to_next_level) || 0),
              current_level: levelsSummary?.current_level || null,
              next_level: levelsSummary?.next_level || null,
              stale: balanceSummary?.stale === true || levelsSummary?.stale === true || historySummary?.stale === true,
            },
            transactions,
            level_history: [],
          };
        } else {
          data = await loyaltyService.getAdminUserLoyalty(userId);
        }
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
