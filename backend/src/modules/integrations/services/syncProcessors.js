import db from "../../../config/database.js";
import { getIikoClientOrNull, getIntegrationSettings } from "./integrationConfigService.js";
import {
  IIKO_STATUS_MAP_TO_LOCAL,
  INTEGRATION_MODULE,
  INTEGRATION_TYPE,
  MAX_SYNC_ATTEMPTS,
  SYNC_STATUS,
} from "../constants.js";
import { logIntegrationEvent } from "./integrationLoggerService.js";
import {
  markOrderIikoSync,
  markOrderPbSync,
  markUserPbSync,
} from "./sync-processors/state.repository.js";
import { processIikoOrderSync } from "./sync-processors/iiko-order.processor.js";
import { processPremiumBonusClientSync } from "./sync-processors/premiumbonus-client.processor.js";
import { processPremiumBonusPurchaseSync } from "./sync-processors/premiumbonus-purchase.processor.js";
import { processIikoMenuSync } from "./sync-processors/iiko-menu-db-sync.js";
import { processIikoStopListSync } from "./sync-processors/iiko-stoplist.processor.js";

export { markOrderIikoSync, markOrderPbSync, markUserPbSync };
export {
  processIikoOrderSync,
  processPremiumBonusClientSync,
  processPremiumBonusPurchaseSync,
  processIikoMenuSync,
  processIikoStopListSync,
};

export async function retryFailedSyncs() {
  const [iikoOrders] = await db.query(
    `SELECT id FROM orders
     WHERE iiko_sync_status IN ('pending', 'error')
       AND iiko_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS]
  );

  const [pbUsers] = await db.query(
    `SELECT id FROM users
     WHERE pb_sync_status IN ('pending', 'error')
       AND pb_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS]
  );

  const [pbOrders] = await db.query(
    `SELECT id, status, pb_purchase_id FROM orders
     WHERE pb_sync_status IN ('pending', 'error')
       AND pb_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS]
  );

  for (const row of iikoOrders) {
    try {
      await processIikoOrderSync(row.id, "retry");
    } catch (error) {
      // Ошибка уже записана в логах синхронизации.
    }
  }

  for (const row of pbUsers) {
    try {
      await processPremiumBonusClientSync(row.id, "retry");
    } catch (error) {
      // Ошибка уже записана в логах синхронизации.
    }
  }

  for (const row of pbOrders) {
    try {
      const hasPurchaseId = String(row.pb_purchase_id || "").trim().length > 0;
      const action =
        row.status === "cancelled"
          ? hasPurchaseId
            ? "cancel"
            : "create"
          : hasPurchaseId
            ? "status"
            : "create";
      await processPremiumBonusPurchaseSync(row.id, action, "retry");
    } catch (error) {
      // Ошибка уже записана в логах синхронизации.
    }
  }

  return {
    iikoOrders: iikoOrders.length,
    pbUsers: pbUsers.length,
    pbOrders: pbOrders.length,
  };
}

function extractIikoOrderStatus(orderPayload) {
  if (!orderPayload || typeof orderPayload !== "object") return "";
  return String(
    orderPayload.status ||
      orderPayload.deliveryStatus ||
      orderPayload.orderStatus ||
      orderPayload?.order?.status ||
      orderPayload?.orderInfo?.status ||
      ""
  ).trim();
}

function extractIikoOrderId(orderPayload) {
  if (!orderPayload || typeof orderPayload !== "object") return "";
  return String(
    orderPayload.id ||
      orderPayload.orderId ||
      orderPayload?.order?.id ||
      orderPayload?.orderInfo?.id ||
      ""
  ).trim();
}

export async function reconcileIikoOrderStatuses({ limit = 100 } = {}) {
  const settings = await getIntegrationSettings();
  const ordersMode = String(settings?.integrationMode?.orders || "local")
    .trim()
    .toLowerCase();
  if (!settings.iikoEnabled || !settings.iikoAutoSyncEnabled || ordersMode !== "external") {
    return {
      checked: 0,
      updated: 0,
      skipped: true,
      reason: "Режим синхронизации статусов заказов iiko отключен",
    };
  }

  const client = await getIikoClientOrNull();
  if (!client) {
    return {
      checked: 0,
      updated: 0,
      skipped: true,
      reason: "Клиент iiko недоступен",
    };
  }

  const maxRows = Math.max(1, Math.min(Number(limit) || 100, 300));
  const [orders] = await db.query(
    `SELECT o.id,
            o.status,
            o.iiko_order_id,
            o.order_number,
            b.iiko_organization_id AS branch_iiko_organization_id
     FROM orders o
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.iiko_order_id IS NOT NULL
       AND o.iiko_order_id <> ''
       AND o.status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivering')
     ORDER BY o.id ASC
     LIMIT ?`,
    [maxRows]
  );

  if (!orders.length) {
    return {
      checked: 0,
      updated: 0,
      skipped: false,
    };
  }

  const fallbackOrganizationId = String(settings.iikoOrganizationId || "").trim();
  const groupedByOrganization = new Map();

  for (const order of orders) {
    const organizationId = String(
      order.branch_iiko_organization_id || fallbackOrganizationId || ""
    ).trim();
    if (!organizationId) continue;
    if (!groupedByOrganization.has(organizationId)) {
      groupedByOrganization.set(organizationId, []);
    }
    groupedByOrganization.get(organizationId).push(order);
  }

  let checked = 0;
  let updated = 0;

  for (const [organizationId, organizationOrders] of groupedByOrganization.entries()) {
    const orderIds = organizationOrders
      .map((row) => String(row.iiko_order_id || "").trim())
      .filter(Boolean);
    if (!orderIds.length) continue;

    let payload;
    try {
      payload = await client.getOrderStatus({
        organizationId,
        orderIds,
      });
    } catch (error) {
      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "reconcile_order_statuses",
        status: "failed",
        errorMessage: error?.message || "Ошибка запроса статусов заказов в iiko",
        requestData: {
          organizationId,
          orderIds,
        },
      });
      continue;
    }

    const externalOrders = Array.isArray(payload?.orders) ? payload.orders : [];
    const statusByIikoOrderId = new Map();
    for (const externalOrder of externalOrders) {
      const iikoOrderId = extractIikoOrderId(externalOrder);
      const iikoStatus = extractIikoOrderStatus(externalOrder);
      if (!iikoOrderId || !iikoStatus) continue;
      statusByIikoOrderId.set(iikoOrderId, iikoStatus);
    }

    for (const localOrder of organizationOrders) {
      checked += 1;
      const localIikoOrderId = String(localOrder.iiko_order_id || "").trim();
      if (!localIikoOrderId) continue;
      const iikoStatus = statusByIikoOrderId.get(localIikoOrderId);
      if (!iikoStatus) continue;

      const mappedStatus =
        IIKO_STATUS_MAP_TO_LOCAL[iikoStatus] ||
        IIKO_STATUS_MAP_TO_LOCAL[String(iikoStatus).toLowerCase()] ||
        null;
      if (!mappedStatus || mappedStatus === localOrder.status) continue;

      await db.query(
        "UPDATE orders SET status = ?, iiko_sync_status = ?, iiko_sync_error = NULL, iiko_last_sync_at = NOW() WHERE id = ?",
        [mappedStatus, SYNC_STATUS.SYNCED, localOrder.id]
      );
      await db.query(
        "UPDATE orders SET pb_sync_status = 'pending', pb_sync_error = NULL, pb_sync_attempts = 0, pb_last_sync_at = NOW() WHERE id = ?",
        [localOrder.id]
      );
      updated += 1;

      await logIntegrationEvent({
        integrationType: INTEGRATION_TYPE.IIKO,
        module: INTEGRATION_MODULE.ORDERS,
        action: "reconcile_order_statuses",
        status: "success",
        entityType: "order",
        entityId: localOrder.id,
        requestData: {
          iiko_order_id: localIikoOrderId,
          iiko_status: iikoStatus,
          local_status_before: localOrder.status,
        },
        responseData: {
          local_status_after: mappedStatus,
        },
      });
    }
  }

  return {
    checked,
    updated,
    skipped: false,
  };
}
