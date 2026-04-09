import { getIikoClientOrNull, getIntegrationSettings } from "../integrationConfigService.js";
import { INTEGRATION_MODULE, INTEGRATION_TYPE, SYNC_STATUS } from "../../constants.js";
import { logIntegrationEvent } from "../integrationLoggerService.js";
import { loadOrderWithItems, markOrderIikoSync, nextSyncState } from "./state.repository.js";
import {
  ensureIikoOrderVisible,
  isExistingIikoOrderVisible,
  resolveCommentWithCashChange,
  resolveCompleteBefore,
  resolveDeliveryPoint,
  resolveDiscountsInfoPayload,
  resolveOrderTypePayload,
  resolvePaymentPayload,
} from "./iiko-order.helpers.js";
import { getPriceCategoryMapping } from "../../utils/priceCategoryHelper.js";

export async function processIikoOrderSync(orderId, source = "queue") {
  void source;
  const startedAt = Date.now();
  const integrationSettings = await getIntegrationSettings();
  if (
    !integrationSettings.iikoEnabled ||
    integrationSettings?.integrationMode?.orders !== "external"
  ) {
    await markOrderIikoSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
    });
    return { skipped: true, reason: "Режим заказов local" };
  }

  const { order, items } = await loadOrderWithItems(orderId);

  const client = await getIikoClientOrNull();
  if (!client) {
    throw new Error("Клиент iiko недоступен");
  }

  const nextAttempts = (Number(order.iiko_sync_attempts) || 0) + 1;
  let createdIikoOrderId = String(order.iiko_order_id || "").trim() || null;

  try {
    const normalizePhone = (rawPhone) => {
      const trimmed = String(rawPhone || "").trim();
      if (!trimmed) return "";
      const digits = trimmed.replace(/[^\d]/g, "");
      if (!digits) return "";
      return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
    };

    const extractProductSizeId = (externalVariantId) => {
      const value = String(externalVariantId || "").trim();
      if (!value) return null;
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(value)) return value;
      const splitByUnderscore = value.split("_");
      const lastPart = splitByUnderscore[splitByUnderscore.length - 1];
      if (uuidRegex.test(lastPart)) return lastPart;
      return null;
    };

    const phone = normalizePhone(order.user_phone);
    if (!phone) {
      throw new Error(
        "Невозможно синхронизировать заказ в iiko: у пользователя отсутствует телефон"
      );
    }
    const resolvedOrganizationId = String(
      order.branch_iiko_organization_id || integrationSettings.iikoOrganizationId || ""
    ).trim();
    const resolvedTerminalGroupId = String(order.branch_iiko_terminal_group_id || "").trim();
    if (!resolvedOrganizationId) {
      throw new Error(
        "Невозможно синхронизировать заказ в iiko: для филиала не задан iiko_organization_id"
      );
    }
    if (!resolvedTerminalGroupId) {
      throw new Error(
        "Невозможно синхронизировать заказ в iiko: для филиала не задан iiko_terminal_group_id"
      );
    }

    if (createdIikoOrderId) {
      const existsInIiko = await isExistingIikoOrderVisible({
        client,
        organizationId: resolvedOrganizationId,
        iikoOrderId: createdIikoOrderId,
      });
      if (existsInIiko) {
        await markOrderIikoSync(orderId, {
          status: SYNC_STATUS.SYNCED,
          error: null,
          attempts: nextAttempts,
          iikoOrderId: createdIikoOrderId,
        });
        return { synced: true, iikoOrderId: createdIikoOrderId, reused: true };
      }
      throw new Error(
        "Заказ уже отправлен в iiko, но еще не подтвержден. Повторная отправка заблокирована до подтверждения"
      );
    }

    const iikoItems = items
      .map((item) => {
        const productId = String(item.iiko_item_id || "").trim();
        if (!productId) return null;

        const itemModifiers = Array.isArray(item.modifiers)
          ? item.modifiers
              .map((modifier) => {
                const modifierProductId = String(modifier?.iiko_modifier_id || "").trim();
                if (!modifierProductId) return null;
                const modifierAmount = Number(modifier?.amount) || 1;
                const modifierPriceRaw = Number(modifier?.modifier_price);
                const modifierPayload = {
                  productId: modifierProductId,
                  amount: modifierAmount,
                };

                if (Number.isFinite(modifierPriceRaw)) {
                  modifierPayload.price = modifierPriceRaw;
                }

                return modifierPayload;
              })
              .filter(Boolean)
          : [];

        const payloadItem = {
          type: "Product",
          productId,
          amount: Number(item.quantity) || 1,
          price: Number(item.item_price) || 0,
          comment: item.variant_name || null,
          ...(itemModifiers.length > 0 ? { modifiers: itemModifiers } : {}),
        };

        const productSizeId = extractProductSizeId(item.iiko_variant_id);
        if (productSizeId) {
          payloadItem.productSizeId = productSizeId;
        }

        return payloadItem;
      })
      .filter(Boolean);

    if (iikoItems.length === 0) {
      throw new Error(
        "Невозможно синхронизировать заказ в iiko: отсутствует маппинг iiko_item_id у позиций заказа"
      );
    }

    const isDeliveryOrder =
      String(order.order_type || "")
        .trim()
        .toLowerCase() === "delivery";
    const deliveryCost = Number(order.delivery_cost);
    if (isDeliveryOrder && Number.isFinite(deliveryCost) && deliveryCost > 0) {
      const deliveryProductId = String(integrationSettings.iikoDeliveryProductId || "").trim();
      if (!deliveryProductId) {
        throw new Error(
          "Невозможно синхронизировать заказ в iiko: для платной доставки не задан iiko_delivery_product_id (сервисная позиция доставки)"
        );
      }
      iikoItems.push({
        type: "Product",
        productId: deliveryProductId,
        amount: 1,
        price: deliveryCost,
        comment: "Платная доставка",
      });
    }

    const resolvedOrderTypePayload = resolveOrderTypePayload(order.order_type, integrationSettings);
    const resolvedPayments = resolvePaymentPayload(
      order,
      integrationSettings,
      resolvedTerminalGroupId
    );
    const resolvedDiscountsInfo = resolveDiscountsInfoPayload(order, integrationSettings);
    const deliveryPoint = resolveDeliveryPoint(order);
    if (
      String(order.order_type || "")
        .trim()
        .toLowerCase() === "delivery" &&
      !deliveryPoint
    ) {
      throw new Error(
        "Невозможно синхронизировать заказ в iiko: отсутствует корректный deliveryPoint для доставки"
      );
    }
    const completeBefore = resolveCompleteBefore(order);

    // Получить категорию цены для типа заказа
    const priceCategoryMapping = getPriceCategoryMapping(integrationSettings);
    const orderFulfillmentType = String(order.order_service_type || order.order_type || "delivery")
      .toLowerCase()
      .trim();
    const priceCategoryId = priceCategoryMapping?.[orderFulfillmentType] || null;

    const payload = {
      organizationId: resolvedOrganizationId,
      terminalGroupId: resolvedTerminalGroupId,
      order: {
        externalNumber: String(order.order_number || order.id),
        phone,
        ...resolvedOrderTypePayload,
        ...(completeBefore ? { completeBefore } : {}),
        ...(deliveryPoint ? { deliveryPoint } : {}),
        ...(priceCategoryId ? { priceCategoryId } : {}),
        comment: resolveCommentWithCashChange(order),
        sourceKey: "foodminiapp",
        items: iikoItems,
        ...(resolvedPayments ? { payments: resolvedPayments } : {}),
        ...(resolvedDiscountsInfo ? { discountsInfo: resolvedDiscountsInfo } : {}),
      },
    };

    const response = await client.createOrder(payload);
    const orderInfo =
      response?.orderInfo && typeof response.orderInfo === "object" ? response.orderInfo : null;
    const correlationId = String(response?.correlationId || "").trim();
    const creationStatus = String(
      orderInfo?.creationStatus || response?.creationStatus || "Success"
    )
      .trim()
      .toLowerCase();
    createdIikoOrderId =
      String(orderInfo?.id || response?.orderId || response?.id || "").trim() || null;

    if (!createdIikoOrderId) {
      throw new Error("iiko не вернул id заказа (orderInfo.id)");
    }

    if (creationStatus === "error") {
      const errorDetails =
        orderInfo?.errorInfo?.message ||
        orderInfo?.errorInfo?.code ||
        "Ошибка создания заказа в iiko";
      throw new Error(`iiko creationStatus=Error: ${String(errorDetails)}`);
    }

    if (creationStatus === "inprogress") {
      const visible = await ensureIikoOrderVisible({
        client,
        organizationId: resolvedOrganizationId,
        correlationId,
        iikoOrderId: createdIikoOrderId,
      });
      if (!visible) {
        throw new Error(
          "Создание заказа в iiko еще не завершено. Заказ сохранен с ожиданием подтверждения"
        );
      }
    }

    await markOrderIikoSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      iikoOrderId: createdIikoOrderId,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.ORDERS,
      action: "create_order",
      status: "success",
      entityType: "order",
      entityId: orderId,
      requestData: payload,
      responseData: response,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    return { synced: true, iikoOrderId: createdIikoOrderId };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markOrderIikoSync(orderId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
      iikoOrderId: createdIikoOrderId,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.ORDERS,
      action: "create_order",
      status: "failed",
      entityType: "order",
      entityId: orderId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}
