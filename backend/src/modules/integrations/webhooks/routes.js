import express from "express";
import db from "../../../config/database.js";
import { IIKO_STATUS_MAP_TO_LOCAL, INTEGRATION_MODULE, INTEGRATION_TYPE, SYNC_STATUS } from "../constants.js";
import { getIntegrationSettings } from "../services/integrationConfigService.js";
import { logIntegrationEvent } from "../services/integrationLoggerService.js";
import menuAdapter from "../adapters/menuAdapter.js";
import ordersAdapter from "../adapters/ordersAdapter.js";
import { getSystemSettings } from "../../../utils/settings.js";
import {
  cancelOrderBonuses,
  earnBonuses,
  getLoyaltyLevelsFromDb,
  redeliveryEarnBonuses,
  removeEarnedBonuses,
} from "../../loyalty/services/loyaltyService.js";

const router = express.Router();

function isValidWebhookSignature(req, secret) {
  const normalizedSecret = String(secret || "").trim();
  if (!normalizedSecret) return true;

  const normalizeHeaderValues = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    return [String(value || "").trim()].filter(Boolean);
  };

  const candidates = [
    ...normalizeHeaderValues(req.headers.authorization),
    ...normalizeHeaderValues(req.headers["x-iiko-signature"]),
    ...normalizeHeaderValues(req.headers["x-webhook-signature"]),
    ...normalizeHeaderValues(req.headers["x-api-key"]),
  ];

  return candidates.some((candidate) => {
    const normalizedCandidate = String(candidate || "").trim();
    if (!normalizedCandidate) return false;
    if (normalizedCandidate === normalizedSecret) return true;

    const bearerPrefix = "Bearer ";
    if (normalizedCandidate.startsWith(bearerPrefix)) {
      return normalizedCandidate.slice(bearerPrefix.length).trim() === normalizedSecret;
    }

    return false;
  });
}

async function processLocalBonusStatusChange(order, oldStatus, newStatus) {
  const settings = await getSystemSettings();
  const useLocalBonuses = settings.bonuses_enabled && !settings.premiumbonus_enabled;
  if (!useLocalBonuses) return;

  const loyaltyLevels = await getLoyaltyLevelsFromDb();
  const orderData = {
    id: order.id,
    user_id: order.user_id,
    order_number: order.order_number,
    total: parseFloat(order.total) || 0,
    subtotal: parseFloat(order.subtotal) || 0,
    delivery_cost: parseFloat(order.delivery_cost) || 0,
    bonus_spent: parseFloat(order.bonus_spent) || 0,
    bonus_earn_amount: parseFloat(order.bonus_earn_amount) || 0,
  };

  if (oldStatus === "completed" && newStatus !== "completed" && newStatus !== "cancelled") {
    await removeEarnedBonuses(orderData, null, loyaltyLevels);
  }

  if (newStatus === "completed" && oldStatus !== "completed" && orderData.total > 0) {
    await db.query("UPDATE loyalty_transactions SET status = 'completed' WHERE order_id = ? AND type = 'spend' AND status = 'pending'", [order.id]);
    if (orderData.bonus_earn_amount > 0) {
      await redeliveryEarnBonuses(orderData, null, loyaltyLevels);
    } else {
      await earnBonuses(orderData, null, loyaltyLevels);
    }
  }

  if (newStatus === "cancelled" && oldStatus !== "cancelled") {
    await cancelOrderBonuses(orderData, null, loyaltyLevels);
  }
}

function extractEventInfoPayload(payload) {
  return payload?.eventInfo && typeof payload.eventInfo === "object" ? payload.eventInfo : {};
}

function detectWebhookPayloadKind(payload = {}) {
  const eventType = String(payload?.eventType || payload?.event_type || "")
    .trim()
    .toLowerCase();
  if (eventType === "stoplistupdate") return "stoplist";
  if (eventType === "deliveryorderupdate" || eventType === "deliveryordererror") return "order-status";

  const eventInfoPayload = extractEventInfoPayload(payload);
  const hasStopListUpdates =
    Array.isArray(payload?.terminalGroupsStopListsUpdates) || Array.isArray(eventInfoPayload?.terminalGroupsStopListsUpdates);
  if (hasStopListUpdates) return "stoplist";

  const orderInfoPayload = payload?.orderInfo && typeof payload.orderInfo === "object" ? payload.orderInfo : eventInfoPayload;
  const orderPayload = orderInfoPayload?.order && typeof orderInfoPayload.order === "object" ? orderInfoPayload.order : {};
  const hasOrderHints =
    Boolean(payload?.status || payload?.order_status || orderInfoPayload?.status || orderPayload?.status) ||
    Boolean(payload?.order_id || payload?.id || orderInfoPayload?.id || orderPayload?.id);
  if (hasOrderHints) return "order-status";

  return "unknown";
}

async function processOrderStatusWebhookPayload(payload = {}) {
  const eventInfoPayload = extractEventInfoPayload(payload);
  const orderInfoPayload = payload?.orderInfo && typeof payload.orderInfo === "object" ? payload.orderInfo : eventInfoPayload;
  const orderPayload = orderInfoPayload?.order && typeof orderInfoPayload.order === "object" ? orderInfoPayload.order : {};
  const iikoOrderId = payload.order_id || payload.id || orderInfoPayload.id || orderPayload.id || null;
  const externalNumber =
    payload.external_number || payload.externalNumber || orderInfoPayload.externalNumber || orderPayload.externalNumber || orderPayload.number || null;
  const iikoStatus = payload.status || payload.order_status || orderInfoPayload.status || orderPayload.status || null;

  if (!iikoOrderId || !iikoStatus) {
    return { ok: false, statusCode: 400, error: "order_id и status обязательны" };
  }

  const mappedStatus = IIKO_STATUS_MAP_TO_LOCAL[iikoStatus] || IIKO_STATUS_MAP_TO_LOCAL[String(iikoStatus).toLowerCase()] || null;
  let orders = [];
  if (iikoOrderId) {
    const [rows] = await db.query(
      `SELECT id, status, user_id, total, subtotal, delivery_cost, bonus_spent, bonus_earn_amount, order_number
       FROM orders
       WHERE iiko_order_id = ?
       LIMIT 1`,
      [String(iikoOrderId)],
    );
    orders = rows;
  }

  let resolvedByExternalNumber = false;
  if (orders.length === 0 && externalNumber) {
    const [rows] = await db.query(
      `SELECT id, status, user_id, total, subtotal, delivery_cost, bonus_spent, bonus_earn_amount, order_number
       FROM orders
       WHERE (order_number = ? OR CAST(id AS CHAR) = ?)
       ORDER BY created_at DESC
       LIMIT 1`,
      [String(externalNumber), String(externalNumber)],
    );
    orders = rows;
    resolvedByExternalNumber = orders.length > 0;
  }

  if (orders.length === 0) {
    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.ORDERS,
      action: "webhook_order_status",
      status: "failed",
      errorMessage: "Заказ по iiko_order_id/externalNumber не найден",
      requestData: payload,
    });
    return { ok: false, statusCode: 404, error: "Заказ не найден" };
  }

  const order = orders[0];
  if (resolvedByExternalNumber && iikoOrderId) {
    await db.query("UPDATE orders SET iiko_order_id = COALESCE(iiko_order_id, ?), iiko_last_sync_at = NOW() WHERE id = ?", [String(iikoOrderId), order.id]);
  }

  if (mappedStatus && order.status !== mappedStatus) {
    const oldStatus = order.status;
    await db.query("UPDATE orders SET status = ?, iiko_sync_status = ?, updated_at = NOW() WHERE id = ?", [mappedStatus, SYNC_STATUS.SYNCED, order.id]);
    await db.query(
      "UPDATE orders SET pb_sync_status = 'pending', pb_sync_error = NULL, pb_sync_attempts = 0, pb_last_sync_at = NOW() WHERE id = ?",
      [order.id],
    );
    try {
      await processLocalBonusStatusChange(order, oldStatus, mappedStatus);
    } catch (bonusError) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "webhook_order_status_bonus",
        status: "failed",
        entityType: "order",
        entityId: order.id,
        errorMessage: bonusError?.message || "Ошибка обработки бонусов при смене статуса",
        requestData: payload,
        responseData: { oldStatus, mappedStatus },
      });
    }

    const [freshRows] = await db.query("SELECT pb_purchase_id FROM orders WHERE id = ? LIMIT 1", [order.id]);
    const hasPbPurchaseId = String(freshRows[0]?.pb_purchase_id || "").trim().length > 0;
    const pbAction = mappedStatus === "cancelled" ? (hasPbPurchaseId ? "cancel" : "create") : hasPbPurchaseId ? "status" : "create";
    try {
      await ordersAdapter.enqueuePurchaseSync(order.id, pbAction, { source: "iiko-webhook" });
    } catch (pbSyncError) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
        module: INTEGRATION_MODULE.PURCHASES,
        action: `enqueue_purchase_${pbAction}`,
        status: "failed",
        entityType: "order",
        entityId: order.id,
        errorMessage: pbSyncError?.message || "Ошибка постановки PB sync из webhook iiko",
        requestData: payload,
        responseData: { mappedStatus },
      });
    }
  }

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.ORDERS,
    action: "webhook_order_status",
    status: "success",
    entityType: "order",
    entityId: order.id,
    requestData: payload,
    responseData: { mappedStatus },
  });

  return { ok: true, statusCode: 200, orderId: order.id, mappedStatus };
}

async function processStopListWebhookPayload(payload = {}) {
  const eventInfoPayload = extractEventInfoPayload(payload);
  const updates = Array.isArray(payload?.terminalGroupsStopListsUpdates)
    ? payload.terminalGroupsStopListsUpdates
    : Array.isArray(eventInfoPayload?.terminalGroupsStopListsUpdates)
      ? eventInfoPayload.terminalGroupsStopListsUpdates
      : [];
  const terminalGroupIds = updates
    .map((update) => String(update?.id || update?.terminalGroupId || update?.terminal_group_id || "").trim())
    .filter(Boolean);

  const targetBranchIds = [];
  if (terminalGroupIds.length > 0) {
    const placeholders = terminalGroupIds.map(() => "?").join(", ");
    const [branchRows] = await db.query(
      `SELECT id
       FROM branches
       WHERE iiko_terminal_group_id IN (${placeholders})`,
      terminalGroupIds,
    );
    for (const row of branchRows) {
      const branchId = Number(row.id);
      if (Number.isFinite(branchId) && !targetBranchIds.includes(branchId)) {
        targetBranchIds.push(branchId);
      }
    }
  }

  const syncResults = [];
  if (targetBranchIds.length > 0) {
    for (const targetBranchId of targetBranchIds) {
      const result = await menuAdapter.triggerStopListSync({
        reason: "webhook",
        branchId: targetBranchId,
      });
      syncResults.push({
        branch_id: targetBranchId,
        ...result,
      });
    }
  } else {
    const result = await menuAdapter.triggerStopListSync({
      reason: "webhook",
      branchId: null,
    });
    syncResults.push({
      branch_id: null,
      ...result,
    });
  }
  const acceptedJobs = syncResults.filter((result) => result.accepted);
  const failedJobs = syncResults.filter((result) => !result.accepted);

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.STOPLIST,
    action: "webhook_stoplist",
    status: failedJobs.length === 0 ? "success" : "failed",
    requestData: payload,
    responseData: {
      terminal_group_ids: terminalGroupIds,
      target_branch_ids: targetBranchIds,
      jobs: syncResults,
    },
    errorMessage:
      failedJobs.length === 0 ? null : failedJobs.map((result) => result.reason || "Не удалось поставить задачу синхронизации стоп-листа").join("; "),
  });

  if (acceptedJobs.length === 0) {
    return { ok: false, statusCode: 400, error: "Не удалось запустить синхронизацию стоп-листа", jobs: syncResults };
  }

  return {
    ok: true,
    statusCode: 202,
    jobs: acceptedJobs.map((result) => ({
      branch_id: result.branch_id,
      job_id: result.jobId || null,
    })),
  };
}

router.post("/event", async (req, res, next) => {
  try {
    const settings = await getIntegrationSettings();
    if (!settings.iikoEnabled) {
      return res.status(400).json({ error: "Интеграция iiko выключена" });
    }

    if (!isValidWebhookSignature(req, settings.iikoWebhookSecret)) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "webhook_signature_rejected",
        status: "failed",
        errorMessage: "Неверная подпись webhook",
        requestData: {
          path: "/event",
          headers: {
            authorization: req.headers.authorization || null,
            x_iiko_signature: req.headers["x-iiko-signature"] || null,
            x_webhook_signature: req.headers["x-webhook-signature"] || null,
            x_api_key: req.headers["x-api-key"] || null,
          },
        },
      });
      return res.status(401).json({ error: "Неверная подпись webhook" });
    }

    const payload = req.body;
    const events = Array.isArray(payload) ? payload : [payload || {}];
    const results = [];

    for (let index = 0; index < events.length; index += 1) {
      const eventPayload = events[index] && typeof events[index] === "object" ? events[index] : {};
      const kind = detectWebhookPayloadKind(eventPayload);
      if (kind === "order-status") {
        const result = await processOrderStatusWebhookPayload(eventPayload);
        results.push({ index, kind, ...result });
        continue;
      }
      if (kind === "stoplist") {
        const result = await processStopListWebhookPayload(eventPayload);
        results.push({ index, kind, ...result });
        continue;
      }

      results.push({ index, kind: "unknown", ok: false, statusCode: 202, error: "Неподдерживаемый тип события webhook" });
    }

    const processed = results.filter((row) => row.kind !== "unknown").length;
    const success = results.filter((row) => row.ok).length;
    const failed = results.filter((row) => !row.ok).length;

    // iiko ожидает HTTP 200 для подтверждения приема webhook.
    return res.status(200).json({
      ok: true,
      processed,
      success,
      failed,
      total: results.length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/order-status", async (req, res, next) => {
  try {
    const settings = await getIntegrationSettings();
    if (!settings.iikoEnabled) {
      return res.status(400).json({ error: "Интеграция iiko выключена" });
    }

    if (!isValidWebhookSignature(req, settings.iikoWebhookSecret)) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "webhook_signature_rejected",
        status: "failed",
        errorMessage: "Неверная подпись webhook",
        requestData: {
          path: "/order-status",
          headers: {
            authorization: req.headers.authorization || null,
            x_iiko_signature: req.headers["x-iiko-signature"] || null,
            x_webhook_signature: req.headers["x-webhook-signature"] || null,
            x_api_key: req.headers["x-api-key"] || null,
          },
        },
      });
      return res.status(401).json({ error: "Неверная подпись webhook" });
    }
    const result = await processOrderStatusWebhookPayload(req.body || {});
    if (!result.ok) {
      return res.status(result.statusCode || 400).json({ ok: false, error: result.error, jobs: result.jobs || [] });
    }
    return res.status(result.statusCode || 200).json({ ok: true, order_id: result.orderId || null, mapped_status: result.mappedStatus || null });
  } catch (error) {
    next(error);
  }
});

router.post("/stoplist", async (req, res, next) => {
  try {
    const settings = await getIntegrationSettings();
    if (!settings.iikoEnabled) {
      return res.status(400).json({ error: "Интеграция iiko выключена" });
    }

    if (!isValidWebhookSignature(req, settings.iikoWebhookSecret)) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.STOPLIST,
        action: "webhook_signature_rejected",
        status: "failed",
        errorMessage: "Неверная подпись webhook",
        requestData: {
          path: "/stoplist",
          headers: {
            authorization: req.headers.authorization || null,
            x_iiko_signature: req.headers["x-iiko-signature"] || null,
            x_webhook_signature: req.headers["x-webhook-signature"] || null,
            x_api_key: req.headers["x-api-key"] || null,
          },
        },
      });
      return res.status(401).json({ error: "Неверная подпись webhook" });
    }
    const result = await processStopListWebhookPayload(req.body || {});
    if (!result.ok) {
      return res.status(result.statusCode || 400).json({ ok: false, error: result.error, jobs: result.jobs || [] });
    }
    return res.status(result.statusCode || 202).json({ ok: true, jobs: result.jobs || [] });
  } catch (error) {
    next(error);
  }
});

export default router;
