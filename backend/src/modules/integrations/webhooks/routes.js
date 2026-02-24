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
    const iikoOrderId = payload.order_id || payload.id || null;
    const iikoStatus = payload.status || payload.order_status || null;

    if (!iikoOrderId || !iikoStatus) {
      return res.status(400).json({ error: "order_id и status обязательны" });
    }

    const mappedStatus = IIKO_STATUS_MAP_TO_LOCAL[iikoStatus] || null;
    const [orders] = await db.query(
      `SELECT id, status, user_id, total, subtotal, delivery_cost, bonus_spent, bonus_earn_amount, order_number
       FROM orders
       WHERE iiko_order_id = ?
       LIMIT 1`,
      [String(iikoOrderId)],
    );
    if (orders.length === 0) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "webhook_order_status",
        status: "failed",
        errorMessage: "Заказ по iiko_order_id не найден",
        requestData: payload,
      });
      return res.status(404).json({ error: "Заказ не найден" });
    }

    const order = orders[0];
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
    const syncResult = await menuAdapter.triggerStopListSync({
      reason: "webhook",
      branchId: null,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.STOPLIST,
      action: "webhook_stoplist",
      status: syncResult.accepted ? "success" : "failed",
      requestData: payload,
      responseData: syncResult,
      errorMessage: syncResult.accepted ? null : syncResult.reason || "Не удалось поставить задачу синхронизации стоп-листа",
    });

    if (!syncResult.accepted) {
      return res.status(400).json({ ok: false, error: syncResult.reason || "Не удалось запустить синхронизацию стоп-листа" });
    }

    return res.status(202).json({ ok: true, jobId: syncResult.jobId || null });
  } catch (error) {
    next(error);
  }
});

export default router;
