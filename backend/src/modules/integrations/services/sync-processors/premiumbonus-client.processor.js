import db from "../../../../config/database.js";
import { decryptEmail } from "../../../../utils/encryption.js";
import {
  getIntegrationSettings,
  getPremiumBonusClientOrNull,
} from "../integrationConfigService.js";
import { INTEGRATION_MODULE, INTEGRATION_TYPE, SYNC_STATUS } from "../../constants.js";
import { logIntegrationEvent } from "../integrationLoggerService.js";
import { markUserPbSync, nextSyncState } from "./state.repository.js";
import {
  assertPremiumBonusProfileSuccess,
  assertPremiumBonusSuccess,
  extractPremiumBonusClientId,
  isBuyerNotFoundError,
  isPhoneAndExternalIdConflictError,
  isPremiumBonusBuyerFound,
  normalizePhoneForPremiumBonus,
  parseGroupPercent,
  parsePbBalance,
  resolveLocalLevelByPremiumBonusGroup,
} from "./premiumbonus.helpers.js";

export async function processPremiumBonusClientSync(userId, source = "queue") {
  const startedAt = Date.now();
  const integrationSettings = await getIntegrationSettings();
  const isExternalLoyaltyMode =
    String(integrationSettings?.integrationMode?.loyalty || "local")
      .trim()
      .toLowerCase() === "external";
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
  if (users.length === 0) throw new Error("Пользователь не найден");

  const user = users[0];
  const nextAttempts = (Number(user.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    if (!user.phone) {
      throw new Error("У пользователя отсутствует телефон для синхронизации с PremiumBonus");
    }

    const normalizedExternalId =
      String(user.pb_external_id || "").trim() || `foodminiapp_user_${user.id}`;
    if (!String(user.pb_external_id || "").trim()) {
      await db.query("UPDATE users SET pb_external_id = ? WHERE id = ?", [
        normalizedExternalId,
        userId,
      ]);
    }

    const normalizedPhone = normalizePhoneForPremiumBonus(user.phone);
    if (!normalizedPhone || normalizedPhone.length < 11) {
      throw new Error(
        "У пользователя отсутствует корректный телефон для синхронизации с PremiumBonus"
      );
    }
    const normalizedStoredPbClientId = String(user.pb_client_id || "").trim() || null;
    const isProfileSource = source === "profile-update" || source === "profile-get";
    if (!normalizedStoredPbClientId && isProfileSource) {
      throw new Error(
        "Автопривязка PremiumBonus по телефону запрещена для обновления/просмотра профиля"
      );
    }

    const email = user.email ? decryptEmail(user.email) : null;
    const baseProfilePayload = {
      phone: normalizedPhone,
      external_id: normalizedExternalId,
      name: user.first_name || undefined,
      surname: user.last_name || undefined,
      birth_date: user.date_of_birth || undefined,
      email: email || undefined,
    };

    const sendProfilePayload = async (mode) => {
      const method = mode === "edit" ? "editBuyer" : "registerBuyer";
      const fallbackMessage =
        mode === "edit"
          ? "PremiumBonus вернул ошибку при синхронизации покупателя"
          : "PremiumBonus вернул ошибку при регистрации покупателя";

      try {
        const response = await client[method](baseProfilePayload);
        assertPremiumBonusProfileSuccess(response, fallbackMessage);
        return response;
      } catch (error) {
        if (!isPhoneAndExternalIdConflictError(error)) {
          throw error;
        }

        const retryPayload = {
          ...baseProfilePayload,
        };
        delete retryPayload.external_id;
        const retryResponse = await client[method](retryPayload);
        assertPremiumBonusProfileSuccess(retryResponse, fallbackMessage);
        return retryResponse;
      }
    };

    let info = null;
    try {
      info = await client.buyerInfo({
        identificator: normalizedPhone || normalizedStoredPbClientId,
      });
    } catch (error) {
      if (!isBuyerNotFoundError(error)) {
        throw error;
      }
    }

    let pbClientId = normalizedStoredPbClientId || extractPremiumBonusClientId(info) || null;
    let responsePayload = info;
    const buyerFound = isPremiumBonusBuyerFound(info);

    if (buyerFound) {
      responsePayload = await sendProfilePayload("edit");
      pbClientId = pbClientId || extractPremiumBonusClientId(responsePayload);
    } else {
      const registration = await sendProfilePayload("register");
      pbClientId = pbClientId || extractPremiumBonusClientId(registration);
      responsePayload = registration;
    }

    let effectiveInfo = null;
    try {
      effectiveInfo = await client.buyerInfo({ identificator: normalizedPhone || pbClientId });
      assertPremiumBonusSuccess(
        effectiveInfo,
        "PremiumBonus вернул ошибку при обновлении профиля покупателя"
      );
    } catch (refreshError) {
      effectiveInfo = info;
    }

    assertPremiumBonusSuccess(
      effectiveInfo,
      "PremiumBonus не вернул актуальный профиль покупателя после синхронизации"
    );

    const pbBalance = parsePbBalance(effectiveInfo);
    const localBalance = Number(user.loyalty_balance || 0);
    const pbLevelPercent = parseGroupPercent(effectiveInfo?.group_name);

    if (isExternalLoyaltyMode) {
      if (Number.isFinite(pbBalance) && pbBalance !== localBalance) {
        await db.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [pbBalance, userId]);
      }

      if (Number.isFinite(pbLevelPercent) || effectiveInfo?.group_id || effectiveInfo?.group_name) {
        const targetLocalLevel = await resolveLocalLevelByPremiumBonusGroup({
          groupId: effectiveInfo?.group_id,
          groupName: effectiveInfo?.group_name,
        });
        if (
          targetLocalLevel?.id &&
          Number(targetLocalLevel.id) !== Number(user.current_loyalty_level_id || 0)
        ) {
          await db.query("UPDATE users SET current_loyalty_level_id = ? WHERE id = ?", [
            targetLocalLevel.id,
            userId,
          ]);
        }
      }
    }

    await markUserPbSync(userId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      pbClientId,
    });

    await db.query("UPDATE users SET loyalty_mode = 'premiumbonus' WHERE id = ?", [userId]);

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.CLIENTS,
      action: "sync_client",
      status: "success",
      entityType: "user",
      entityId: userId,
      responseData: responsePayload,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    return { synced: true, pbClientId };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markUserPbSync(userId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.CLIENTS,
      action: "sync_client",
      status: "failed",
      entityType: "user",
      entityId: userId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}
