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

  return {
    iikoEnabled: Boolean(settings.iiko_enabled),
    iikoApiUrl: settings.iiko_api_url || "",
    iikoApiKey: settings.iiko_api_key || "",
    iikoOrganizationId: settings.iiko_organization_id || "",
    iikoSyncCategoryIds: normalizeStringArray(settings.iiko_sync_category_ids),
    iikoExternalMenuId: settings.iiko_external_menu_id || "",
    iikoPriceCategoryId: settings.iiko_price_category_id || "",
    iikoPreserveLocalNames: settings.iiko_preserve_local_names !== false,
    iikoWebhookSecret: settings.iiko_webhook_secret || "",
    premiumbonusEnabled: Boolean(settings.premiumbonus_enabled),
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
