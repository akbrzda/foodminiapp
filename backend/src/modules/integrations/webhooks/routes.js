import express from "express";
import db from "../../../config/database.js";
import { IIKO_STATUS_MAP_TO_LOCAL, INTEGRATION_MODULE, INTEGRATION_TYPE, SYNC_STATUS } from "../constants.js";
import { getIntegrationSettings } from "../services/integrationConfigService.js";
import { logIntegrationEvent } from "../services/integrationLoggerService.js";
import menuAdapter from "../adapters/menuAdapter.js";
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
  if (!secret) return true;
  const signature = req.headers["x-iiko-signature"] || req.headers["x-webhook-signature"];
  return signature === secret;
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

router.post("/order-status", async (req, res, next) => {
  try {
    const settings = await getIntegrationSettings();
    if (!settings.iikoEnabled) {
      return res.status(400).json({ error: "Интеграция iiko выключена" });
    }

    if (!isValidWebhookSignature(req, settings.iikoWebhookSecret)) {
      return res.status(401).json({ error: "Неверная подпись webhook" });
    }

    const payload = req.body || {};
    const orderInfoPayload = payload?.orderInfo && typeof payload.orderInfo === "object" ? payload.orderInfo : {};
    const iikoOrderId = payload.order_id || payload.id || orderInfoPayload.id || null;
    const externalNumber = payload.external_number || payload.externalNumber || orderInfoPayload.externalNumber || null;
    const iikoStatus =
      payload.status ||
      payload.order_status ||
      orderInfoPayload.status ||
      (orderInfoPayload.order && orderInfoPayload.order.status) ||
      null;

    if (!iikoOrderId || !iikoStatus) {
      return res.status(400).json({ error: "order_id и status обязательны" });
    }

    const mappedStatus = IIKO_STATUS_MAP_TO_LOCAL[iikoStatus] || null;
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
      return res.status(404).json({ error: "Заказ не найден" });
    }

    const order = orders[0];
    if (resolvedByExternalNumber && iikoOrderId) {
      await db.query("UPDATE orders SET iiko_order_id = COALESCE(iiko_order_id, ?), iiko_last_sync_at = NOW() WHERE id = ?", [String(iikoOrderId), order.id]);
    }

    if (mappedStatus && order.status !== mappedStatus) {
      const oldStatus = order.status;
      await db.query("UPDATE orders SET status = ?, iiko_sync_status = ?, updated_at = NOW() WHERE id = ?", [mappedStatus, SYNC_STATUS.SYNCED, order.id]);
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

    return res.json({ ok: true });
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
      return res.status(401).json({ error: "Неверная подпись webhook" });
    }

    const payload = req.body || {};
    const updates = Array.isArray(payload?.terminalGroupsStopListsUpdates) ? payload.terminalGroupsStopListsUpdates : [];
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
        failedJobs.length === 0
          ? null
          : failedJobs.map((result) => result.reason || "Не удалось поставить задачу синхронизации стоп-листа").join("; "),
    });

    if (acceptedJobs.length === 0) {
      return res.status(400).json({ ok: false, error: "Не удалось запустить синхронизацию стоп-листа", jobs: syncResults });
    }

    return res.status(202).json({
      ok: true,
      jobs: acceptedJobs.map((result) => ({
        branch_id: result.branch_id,
        job_id: result.jobId || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
