import { getSystemSettings } from "../../../utils/settings.js";
import { createIikoClient } from "../clients/iikoClient.js";
import { createPremiumBonusClient } from "../clients/premiumBonusClient.js";

export async function getIntegrationSettings() {
  const settings = await getSystemSettings();
  const normalizeStringArray = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  };
  const normalizeOrderTypeMapping = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [localOrderType, rawMapping] of Object.entries(value)) {
      if (!rawMapping || typeof rawMapping !== "object" || Array.isArray(rawMapping)) continue;
      const orderTypeId = String(rawMapping.order_type_id || rawMapping.id || "").trim();
      const orderServiceType = String(rawMapping.order_service_type || rawMapping.orderServiceType || "").trim();
      const name = String(rawMapping.name || "").trim();
      result[String(localOrderType || "").trim()] = {
        orderTypeId,
        orderServiceType,
        name,
      };
    }
    return result;
  };
  const normalizePaymentTypeMapping = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [localPaymentMethod, rawMapping] of Object.entries(value)) {
      if (!rawMapping || typeof rawMapping !== "object" || Array.isArray(rawMapping)) continue;
      const paymentTypeId = String(rawMapping.payment_type_id || rawMapping.id || "").trim();
      const paymentTypeKind = String(rawMapping.payment_type_kind || rawMapping.paymentTypeKind || "").trim();
      const paymentProcessingType = String(rawMapping.payment_processing_type || rawMapping.paymentProcessingType || "").trim();
      const name = String(rawMapping.name || "").trim();
      const isProcessedExternally = rawMapping.is_processed_externally === true || rawMapping.isProcessedExternally === true;
      const terminalGroupIds = Array.isArray(rawMapping.terminal_group_ids)
        ? rawMapping.terminal_group_ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      result[String(localPaymentMethod || "").trim()] = {
        paymentTypeId,
        paymentTypeKind,
        paymentProcessingType,
        name,
        isProcessedExternally,
        terminalGroupIds,
      };
    }
    return result;
  };

  return {
    iikoEnabled: Boolean(settings.iiko_enabled),
    iikoAutoSyncEnabled: settings.iiko_auto_sync_enabled !== false,
    iikoApiUrl: settings.iiko_api_url || "",
    iikoApiKey: settings.iiko_api_key || "",
    iikoOrganizationId: settings.iiko_organization_id || "",
    iikoSyncCategoryIds: normalizeStringArray(settings.iiko_sync_category_ids),
    iikoExternalMenuId: settings.iiko_external_menu_id || "",
    iikoPriceCategoryId: settings.iiko_price_category_id || "",
    iikoDeliveryProductId: settings.iiko_delivery_product_id || "",
    iikoPreserveLocalNames: settings.iiko_preserve_local_names !== false,
    iikoOrderTypeMapping: normalizeOrderTypeMapping(settings.iiko_order_type_mapping),
    iikoPaymentTypeMapping: normalizePaymentTypeMapping(settings.iiko_payment_type_mapping),
    iikoWebhookSecret: settings.iiko_webhook_secret || "",
    premiumbonusEnabled: Boolean(settings.premiumbonus_enabled),
    premiumbonusAutoSyncEnabled: settings.premiumbonus_auto_sync_enabled !== false,
    premiumbonusApiUrl: settings.premiumbonus_api_url || "",
    premiumbonusApiToken: settings.premiumbonus_api_token || "",
    premiumbonusSalePointId: settings.premiumbonus_sale_point_id || "",
    integrationMode: settings.integration_mode || { menu: "local", orders: "local", loyalty: "local" },
  };
}

export async function getIikoClientOrNull() {
  const settings = await getIntegrationSettings();
  if (!settings.iikoEnabled) return null;
  const normalizedApiKey = String(settings.iikoApiKey || "").trim();
  if (!settings.iikoApiUrl || !normalizedApiKey) return null;

  return createIikoClient({
    apiUrl: settings.iikoApiUrl,
    apiLogin: normalizedApiKey,
    apiKey: normalizedApiKey,
    organizationId: settings.iikoOrganizationId,
  });
}

export async function getPremiumBonusClientOrNull() {
  const settings = await getIntegrationSettings();
  if (!settings.premiumbonusEnabled) return null;
  if (!settings.premiumbonusApiUrl || !settings.premiumbonusApiToken) return null;

  return createPremiumBonusClient({
    apiUrl: settings.premiumbonusApiUrl,
    apiToken: settings.premiumbonusApiToken,
    salePointId: settings.premiumbonusSalePointId,
  });
}
