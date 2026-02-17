import express from "express";
import db from "../../../config/database.js";
import { IIKO_STATUS_MAP_TO_LOCAL, INTEGRATION_MODULE, INTEGRATION_TYPE, SYNC_STATUS } from "../constants.js";
import { getIntegrationSettings } from "../services/integrationConfigService.js";
import { logIntegrationEvent } from "../services/integrationLoggerService.js";

const router = express.Router();

function isValidWebhookSignature(req, secret) {
  if (!secret) return true;
  const signature = req.headers["x-iiko-signature"] || req.headers["x-webhook-signature"];
  return signature === secret;
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
    const [orders] = await db.query("SELECT id, status FROM orders WHERE iiko_order_id = ? LIMIT 1", [String(iikoOrderId)]);
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
      await db.query("UPDATE orders SET status = ?, iiko_sync_status = ?, updated_at = NOW() WHERE id = ?", [mappedStatus, SYNC_STATUS.SYNCED, order.id]);
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

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.STOPLIST,
      action: "webhook_stoplist",
      status: "success",
      requestData: payload,
    });

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
