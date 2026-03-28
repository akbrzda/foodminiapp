import { getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";
import { logger } from "../../../utils/logger.js";
import {
  validateAdjustBody,
  validateToggleBody,
  validateBulkAccrualCalculateBody,
  validateBulkAccrualCreateBody,
} from "../validators/loyaltyValidators.js";
import { getOrdersByUserAndCities } from "../repositories/loyaltyRepository.js";
import loyaltyAdapter from "../../integrations/adapters/loyaltyAdapter.js";
import db from "../../../config/database.js";
import { getIntegrationSettings, getPremiumBonusClientOrNull } from "../../integrations/services/integrationConfigService.js";
import { decryptEmail } from "../../../utils/encryption.js";
import { buildSegmentQuery, calculateSegmentSize } from "../../broadcasts/services/segmentService.js";
import { getChannelAdapter } from "../../notifications/services/channelAdapters.js";
import { resolvePreferredNotificationChannelForUser } from "../../notifications/services/externalAccountService.js";

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

  const isPremiumBonusExternalMode = async () => {
    const settings = await getSystemSettings();
    return Boolean(settings.premiumbonus_enabled);
  };

  const renderAccrualMessage = (template, payload) => {
    const messageTemplate = String(template || "").trim();
    if (!messageTemplate) return "";

    const replacements = {
      "{first_name}": String(payload?.first_name || "").trim(),
      "{last_name}": String(payload?.last_name || "").trim(),
      "{bonus_amount}": String(payload?.bonus_amount || 0),
      "{bonus_balance}": String(payload?.bonus_balance || 0),
      "{accrual_name}": String(payload?.accrual_name || "").trim(),
      "{accrual_date}": String(payload?.accrual_date || "").trim(),
    };

    let result = messageTemplate;
    for (const [token, value] of Object.entries(replacements)) {
      result = result.split(token).join(value);
    }
    return result;
  };

  const sendAccrualNotification = async ({ userId, text }) => {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
      return { status: "skipped", error: null };
    }

    const channel = await resolvePreferredNotificationChannelForUser(userId);
    if (!channel?.platform || !channel?.externalId) {
      return { status: "skipped", error: null };
    }

    const adapter = getChannelAdapter(channel.platform);
    if (!adapter?.sendBroadcast) {
      return { status: "failed", error: "Канал уведомления недоступен" };
    }

    try {
      await adapter.sendBroadcast({
        externalId: channel.externalId,
        text: normalizedText,
      });
      return { status: "sent", error: null };
    } catch (error) {
      return {
        status: "failed",
        error: String(error?.message || "Ошибка отправки уведомления"),
      };
    }
  };

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

    async calculateBulkAccrualAudience(req, res, next) {
      try {
        const { value, error } = validateBulkAccrualCalculateBody(req.body);
        if (error) {
          return res.status(400).json({ error });
        }

        if (await isPremiumBonusExternalMode()) {
          return res.status(403).json({
            error: "Массовое начисление недоступно при активной интеграции PremiumBonus",
          });
        }

        const audienceCount = await calculateSegmentSize(value.segmentConfig, { useCache: false });
        return res.json({ audience_count: Number(audienceCount || 0) });
      } catch (error) {
        next(error);
      }
    },

    async createBulkAccrual(req, res, next) {
      try {
        const { value, error } = validateBulkAccrualCreateBody(req.body);
        if (error) {
          return res.status(400).json({ error });
        }

        if (await isPremiumBonusExternalMode()) {
          return res.status(403).json({
            error: "Массовое начисление недоступно при активной интеграции PremiumBonus",
          });
        }

        const [result] = await db.query(
          `INSERT INTO loyalty_bulk_accruals
           (name, status, segment_config, bonus_amount, message_template, created_by)
           VALUES (?, 'draft', ?, ?, ?, ?)`,
          [value.name, JSON.stringify(value.segmentConfig), value.bonusAmount, value.messageTemplate || null, req.user.id],
        );

        return res.status(201).json({ id: result.insertId });
      } catch (error) {
        next(error);
      }
    },

    async startBulkAccrual(req, res, next) {
      try {
        if (await isPremiumBonusExternalMode()) {
          return res.status(403).json({
            error: "Массовое начисление недоступно при активной интеграции PremiumBonus",
          });
        }

        const accrualId = Number(req.params.id);
        if (!Number.isInteger(accrualId) || accrualId <= 0) {
          return res.status(400).json({ error: "Некорректный id операции" });
        }

        const [accrualRows] = await db.query(
          `SELECT id, name, status, segment_config, bonus_amount, message_template, created_by
           FROM loyalty_bulk_accruals
           WHERE id = ?
           LIMIT 1`,
          [accrualId],
        );
        if (!accrualRows.length) {
          return res.status(404).json({ error: "Операция массового начисления не найдена" });
        }
        const accrual = accrualRows[0];
        if (accrual.status !== "draft") {
          return res.status(400).json({ error: "Запустить можно только операцию в статусе draft" });
        }

        let segmentConfig = accrual.segment_config;
        if (typeof segmentConfig === "string") {
          try {
            segmentConfig = JSON.parse(segmentConfig);
          } catch (parseError) {
            segmentConfig = null;
          }
        }
        if (!segmentConfig || typeof segmentConfig !== "object") {
          return res.status(400).json({ error: "Некорректный segment_config у операции начисления" });
        }

        await db.query(
          `UPDATE loyalty_bulk_accruals
           SET status = 'processing', started_at = NOW(), completed_at = NULL
           WHERE id = ?`,
          [accrualId],
        );

        const bonusAmount = Number(accrual.bonus_amount || 0);
        const { sql, params } = buildSegmentQuery(segmentConfig, { select: "u.id, u.first_name, u.last_name" });
        const [users] = await db.query(`SELECT segment.id, segment.first_name, segment.last_name FROM (${sql}) as segment`, params);

        const audienceCount = users.length;
        const requestedTotalAmount = audienceCount * bonusAmount;
        await db.query(
          `UPDATE loyalty_bulk_accruals
           SET audience_count = ?, requested_total_amount = ?
           WHERE id = ?`,
          [audienceCount, requestedTotalAmount, accrualId],
        );

        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let actualTotalAmount = 0;

        const nowDate = new Date().toISOString().slice(0, 10);

        for (const user of users) {
          const userId = Number(user.id);
          if (!Number.isInteger(userId) || userId <= 0) {
            continue;
          }

          try {
            const [existingRows] = await db.query(
              `SELECT id, status
               FROM loyalty_bulk_accrual_recipients
               WHERE accrual_id = ? AND user_id = ?
               LIMIT 1`,
              [accrualId, userId],
            );
            if (existingRows.length > 0 && existingRows[0].status === "completed") {
              skippedCount += 1;
              continue;
            }

            const connection = await loyaltyService.getConnection();
            let adjustmentResult = null;
            try {
              await connection.beginTransaction();
              adjustmentResult = await loyaltyService.applyManualBonusAdjustment({
                userId,
                delta: bonusAmount,
                description: `Массовое начисление: ${accrual.name}`,
                connection,
                adminId: req.user.id,
              });
              await connection.commit();
            } catch (error) {
              await connection.rollback();
              throw error;
            } finally {
              connection.release();
            }

            const message = renderAccrualMessage(accrual.message_template, {
              first_name: user.first_name,
              last_name: user.last_name,
              bonus_amount: bonusAmount,
              bonus_balance: Math.floor(Number(adjustmentResult?.balance || 0)),
              accrual_name: accrual.name,
              accrual_date: nowDate,
            });
            const notifyResult = await sendAccrualNotification({
              userId,
              text: message,
            });

            await db.query(
              `INSERT INTO loyalty_bulk_accrual_recipients
               (accrual_id, user_id, status, error_message, transaction_id, notification_status, notification_error, processed_at)
               VALUES (?, ?, 'completed', NULL, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE
                 status = VALUES(status),
                 error_message = VALUES(error_message),
                 transaction_id = VALUES(transaction_id),
                 notification_status = VALUES(notification_status),
                 notification_error = VALUES(notification_error),
                 processed_at = VALUES(processed_at),
                 updated_at = CURRENT_TIMESTAMP`,
              [
                accrualId,
                userId,
                adjustmentResult?.transaction_id || null,
                notifyResult.status,
                notifyResult.error || null,
              ],
            );

            successCount += 1;
            actualTotalAmount += bonusAmount;
          } catch (error) {
            failedCount += 1;
            await db.query(
              `INSERT INTO loyalty_bulk_accrual_recipients
               (accrual_id, user_id, status, error_message, notification_status, processed_at)
               VALUES (?, ?, 'failed', ?, 'skipped', NOW())
               ON DUPLICATE KEY UPDATE
                 status = VALUES(status),
                 error_message = VALUES(error_message),
                 notification_status = VALUES(notification_status),
                 processed_at = VALUES(processed_at),
                 updated_at = CURRENT_TIMESTAMP`,
              [accrualId, userId, String(error?.message || "Ошибка начисления")],
            );
          }
        }

        const finalStatus = failedCount > 0 && successCount === 0 ? "failed" : "completed";
        await db.query(
          `UPDATE loyalty_bulk_accruals
           SET status = ?, success_count = ?, failed_count = ?, skipped_count = ?, actual_total_amount = ?, completed_at = NOW()
           WHERE id = ?`,
          [finalStatus, successCount, failedCount, skippedCount, actualTotalAmount, accrualId],
        );

        await logger.admin.action(
          req.user?.id,
          "loyalty_bulk_accrual_start",
          "loyalty_bulk_accruals",
          accrualId,
          JSON.stringify({
            audience_count: audienceCount,
            success_count: successCount,
            failed_count: failedCount,
            skipped_count: skippedCount,
            bonus_amount: bonusAmount,
          }),
          req,
        );

        return res.json({
          id: accrualId,
          status: finalStatus,
          audience_count: audienceCount,
          success_count: successCount,
          failed_count: failedCount,
          skipped_count: skippedCount,
          requested_total_amount: requestedTotalAmount,
          actual_total_amount: actualTotalAmount,
        });
      } catch (error) {
        next(error);
      }
    },

    async listBulkAccruals(req, res, next) {
      try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const offset = Math.max(0, Number(req.query.offset) || 0);

        const [rows] = await db.query(
          `SELECT a.id, a.name, a.status, a.bonus_amount, a.audience_count, a.success_count, a.failed_count, a.skipped_count,
                  a.requested_total_amount, a.actual_total_amount, a.created_by, a.started_at, a.completed_at, a.created_at, a.updated_at,
                  au.first_name as created_by_first_name, au.last_name as created_by_last_name
           FROM loyalty_bulk_accruals a
           LEFT JOIN admin_users au ON au.id = a.created_by
           ORDER BY a.created_at DESC
           LIMIT ? OFFSET ?`,
          [limit, offset],
        );

        return res.json({ items: rows });
      } catch (error) {
        next(error);
      }
    },

    async getBulkAccrual(req, res, next) {
      try {
        const accrualId = Number(req.params.id);
        if (!Number.isInteger(accrualId) || accrualId <= 0) {
          return res.status(400).json({ error: "Некорректный id операции" });
        }

        const [rows] = await db.query(
          `SELECT a.id, a.name, a.status, a.segment_config, a.bonus_amount, a.message_template,
                  a.audience_count, a.success_count, a.failed_count, a.skipped_count,
                  a.requested_total_amount, a.actual_total_amount, a.created_by,
                  a.started_at, a.completed_at, a.created_at, a.updated_at,
                  au.first_name as created_by_first_name, au.last_name as created_by_last_name
           FROM loyalty_bulk_accruals a
           LEFT JOIN admin_users au ON au.id = a.created_by
           WHERE a.id = ?
           LIMIT 1`,
          [accrualId],
        );
        if (!rows.length) {
          return res.status(404).json({ error: "Операция массового начисления не найдена" });
        }

        const item = rows[0];
        if (typeof item.segment_config === "string") {
          try {
            item.segment_config = JSON.parse(item.segment_config);
          } catch (parseError) {
            item.segment_config = null;
          }
        }

        return res.json({ item });
      } catch (error) {
        next(error);
      }
    },

    async listBulkAccrualRecipients(req, res, next) {
      try {
        const accrualId = Number(req.params.id);
        if (!Number.isInteger(accrualId) || accrualId <= 0) {
          return res.status(400).json({ error: "Некорректный id операции" });
        }
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const status = String(req.query.status || "").trim();

        const whereClauses = ["r.accrual_id = ?"];
        const params = [accrualId];
        if (status) {
          whereClauses.push("r.status = ?");
          params.push(status);
        }

        params.push(limit, offset);
        const [rows] = await db.query(
          `SELECT r.id, r.user_id, r.status, r.error_message, r.transaction_id, r.notification_status, r.notification_error, r.processed_at, r.created_at,
                  u.first_name, u.last_name, u.phone
           FROM loyalty_bulk_accrual_recipients r
           LEFT JOIN users u ON u.id = r.user_id
           WHERE ${whereClauses.join(" AND ")}
           ORDER BY r.id DESC
           LIMIT ? OFFSET ?`,
          params,
        );

        return res.json({ items: rows });
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
