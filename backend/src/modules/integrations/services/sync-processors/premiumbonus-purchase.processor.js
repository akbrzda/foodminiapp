import db from "../../../../config/database.js";
import {
  getIntegrationSettings,
  getPremiumBonusClientOrNull,
} from "../integrationConfigService.js";
import {
  INTEGRATION_MODULE,
  INTEGRATION_TYPE,
  SYNC_STATUS,
} from "../../constants.js";
import { logIntegrationEvent } from "../integrationLoggerService.js";
import {
  loadOrderWithItems,
  markOrderPbSync,
  nextSyncState,
} from "./state.repository.js";
import {
  assertPremiumBonusSuccess,
  mapOrderItemsToPremiumBonusPurchaseItems,
  mapOrderStatusToPremiumBonusStatus,
  normalizeBonusAmount,
  normalizePhoneForPremiumBonus,
  parseGroupPercent,
  parsePbBalance,
  resolveLocalLevelByPremiumBonusGroup,
} from "./premiumbonus.helpers.js";

export async function processPremiumBonusPurchaseSync(
  orderId,
  action = "create",
  source = "queue"
) {
  void source;
  const startedAt = Date.now();
  const { order, items } = await loadOrderWithItems(orderId);
  const integrationSettings = await getIntegrationSettings();
  const isExternalLoyaltyMode =
    String(integrationSettings?.integrationMode?.loyalty || "local")
      .trim()
      .toLowerCase() === "external";
  const [users] = await db.query(
    "SELECT id, phone, pb_client_id, loyalty_balance, current_loyalty_level_id FROM users WHERE id = ?",
    [order.user_id]
  );
  if (users.length === 0) throw new Error("Пользователь заказа не найден");

  const user = users[0];
  const nextAttempts = (Number(order.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    const normalizedPhone = normalizePhoneForPremiumBonus(user.phone);
    const customerIdentificator = normalizedPhone || user.pb_client_id;
    if (!customerIdentificator) {
      throw new Error("У пользователя заказа отсутствует идентификатор для PremiumBonus");
    }
    let response;
    const payloadBase = {
      external_purchase_id: String(order.id),
      identificator: customerIdentificator,
      phone: normalizedPhone || undefined,
      write_off_bonus: normalizeBonusAmount(order.bonus_spent),
      items: mapOrderItemsToPremiumBonusPurchaseItems(items, {
        deliveryCost: Number(order.delivery_cost || 0),
      }),
      purchase_status: mapOrderStatusToPremiumBonusStatus(order.status),
    };
    if (payloadBase.items.length === 0) {
      throw new Error("Невозможно синхронизировать покупку PremiumBonus: пустой состав заказа");
    }
    let requestPayload = payloadBase;

    if (action === "create") {
      response = await client.createPurchase(payloadBase);
      assertPremiumBonusSuccess(response, "PremiumBonus вернул ошибку при создании покупки");
    } else if (action === "status") {
      requestPayload = {
        purchase_id: order.pb_purchase_id || undefined,
        external_purchase_id: String(order.id),
        purchase_status: mapOrderStatusToPremiumBonusStatus(order.status),
      };
      try {
        response = await client.changePurchaseStatus(requestPayload);
        assertPremiumBonusSuccess(
          response,
          "PremiumBonus вернул ошибку при обновлении статуса покупки"
        );
      } catch (statusError) {
        response = await client.createPurchase(payloadBase);
        assertPremiumBonusSuccess(
          response,
          "PremiumBonus вернул ошибку при fallback-создании покупки"
        );
        requestPayload = payloadBase;
      }
    } else if (action === "cancel") {
      requestPayload = {
        purchase_id: order.pb_purchase_id || undefined,
        external_purchase_id: String(order.id),
      };
      response = await client.cancelPurchase(requestPayload);
      assertPremiumBonusSuccess(response, "PremiumBonus вернул ошибку при отмене покупки");
    } else {
      throw new Error("Неизвестное действие синхронизации покупки");
    }

    if (isExternalLoyaltyMode) {
      try {
        const refreshedInfo = await client.buyerInfo({
          identificator: normalizedPhone || customerIdentificator,
        });
        const refreshedBalance = parsePbBalance(refreshedInfo);
        const refreshedGroupPercent = parseGroupPercent(refreshedInfo?.group_name);

        if (
          Number.isFinite(refreshedBalance) &&
          refreshedBalance !== Number(user.loyalty_balance || 0)
        ) {
          await db.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [
            refreshedBalance,
            user.id,
          ]);
        }

        if (
          Number.isFinite(refreshedGroupPercent) ||
          refreshedInfo?.group_id ||
          refreshedInfo?.group_name
        ) {
          const targetLocalLevel = await resolveLocalLevelByPremiumBonusGroup({
            groupId: refreshedInfo?.group_id,
            groupName: refreshedInfo?.group_name,
          });
          if (
            targetLocalLevel?.id &&
            Number(targetLocalLevel.id) !== Number(user.current_loyalty_level_id || 0)
          ) {
            await db.query("UPDATE users SET current_loyalty_level_id = ? WHERE id = ?", [
              targetLocalLevel.id,
              user.id,
            ]);
          }
        }
      } catch (refreshError) {
        // Не блокируем sync покупки, если не удалось сразу обновить локальное зеркало баланса/уровня.
      }
    }

    await markOrderPbSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      purchaseId: response?.purchase_id || response?.id || order.pb_purchase_id || null,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.PURCHASES,
      action: `purchase_${action}`,
      status: "success",
      entityType: "order",
      entityId: orderId,
      requestData: requestPayload,
      responseData: response,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    return { synced: true };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markOrderPbSync(orderId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.PURCHASES,
      action: `purchase_${action}`,
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
