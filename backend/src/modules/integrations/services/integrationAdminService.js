import db from "../../../config/database.js";
import { getSettingsList, getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";
import { getIikoClientOrNull, getIntegrationSettings, getPremiumBonusClientOrNull } from "./integrationConfigService.js";
import { getSyncLogs } from "../repositories/syncLogRepository.js";
import menuAdapter from "../adapters/menuAdapter.js";
import { processIikoDeliveryZonesSync, retryFailedSyncs } from "./syncProcessors.js";
import {
  ensureIikoReadinessSeed,
  executeIikoOnboardingAction,
  listManualMappingTargets,
  listMappingCandidates,
  listReadiness,
  refreshIikoReadiness,
  refreshMenuReadiness,
  resolveMappingCandidate,
} from "./integrationReadinessService.js";
import {
  enqueueIikoOrderSync,
  enqueuePremiumBonusClientSync,
  enqueuePremiumBonusPurchaseSync,
  getQueueStats,
  iikoMenuSyncQueue,
  iikoOrdersSyncQueue,
  iikoStopListSyncQueue,
  premiumBonusClientsSyncQueue,
  premiumBonusPurchasesSyncQueue,
} from "../../../queues/config.js";

function normalizeDisplayName(value, fallback = "") {
  const source = String(value || fallback || "").trim();
  if (!source) return "";
  const lowered = source.toLocaleLowerCase("ru-RU");
  return `${lowered.charAt(0).toLocaleUpperCase("ru-RU")}${lowered.slice(1)}`;
}

function normalizeIikoId(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function getRemovedCategoryIds(previousIds = [], nextIds = []) {
  const nextSet = new Set(normalizeStringArray(nextIds));
  return normalizeStringArray(previousIds).filter((id) => !nextSet.has(id));
}

async function deactivateRemovedIikoCategories(categoryIds = []) {
  const normalizedCategoryIds = normalizeStringArray(categoryIds);
  if (normalizedCategoryIds.length === 0) return 0;

  const placeholders = normalizedCategoryIds.map(() => "?").join(", ");
  const [updateResult] = await db.query(
    `UPDATE menu_categories
     SET is_active = 0, iiko_synced_at = NOW()
     WHERE iiko_category_id IN (${placeholders})
       AND is_active = 1`,
    normalizedCategoryIds,
  );

  await db.query(
    `UPDATE menu_category_cities mcc
     JOIN menu_categories mc ON mc.id = mcc.category_id
     SET mcc.is_active = 0
     WHERE mc.iiko_category_id IN (${placeholders})
       AND mcc.is_active = 1`,
    normalizedCategoryIds,
  );

  return Number(updateResult?.affectedRows || 0);
}

export async function getAdminIntegrationSettings() {
  await ensureIikoReadinessSeed();
  const settings = await getSystemSettings();
  return {
    settings,
    items: getSettingsList(settings),
  };
}

export async function getIikoNomenclatureOverview(options = {}) {
  const externalMenuIdOverride = String(options.externalMenuId || "").trim();
  const priceCategoryIdOverride = String(options.priceCategoryId || "").trim();
  const settings = await getIntegrationSettings();
  const client = await getIikoClientOrNull();
  if (!client) {
    return {
      categories: [],
      externalMenus: [],
      priceCategories: [],
      warnings: {
        client: "Интеграция iiko выключена или не настроена",
      },
      selectedCategoryIds: settings.iikoSyncCategoryIds || [],
      selectedExternalMenuId: externalMenuIdOverride || settings.iikoExternalMenuId || "",
      selectedPriceCategoryId: priceCategoryIdOverride || settings.iikoPriceCategoryId || "",
    };
  }

  const warnings = {};
  let externalMenusRaw = [];
  let priceCategoriesRaw = [];
  try {
    const menusPayload = await client.getExternalMenus({ useConfiguredOrganization: false });
    externalMenusRaw = Array.isArray(menusPayload?.externalMenus) ? menusPayload.externalMenus : [];
    priceCategoriesRaw = Array.isArray(menusPayload?.priceCategories) ? menusPayload.priceCategories : [];
  } catch (error) {
    externalMenusRaw = [];
    priceCategoriesRaw = [];
    warnings.externalMenus = error?.message || "Не удалось получить список внешних меню iiko";
  }
  const selectedExternalMenuId = externalMenuIdOverride || String(settings.iikoExternalMenuId || "").trim();
  const selectedPriceCategoryId = priceCategoryIdOverride || String(settings.iikoPriceCategoryId || "").trim();

  let externalMenuItemIds = null;
  let externalMenuCategories = null;
  if (selectedExternalMenuId) {
    try {
      const menuById = await client.getMenuById({
        externalMenuId: selectedExternalMenuId,
        priceCategoryId: selectedPriceCategoryId || undefined,
        useConfiguredOrganization: false,
      });

      const itemIds = new Set();
      const categories = [];
      const itemCategories = Array.isArray(menuById?.itemCategories) ? menuById.itemCategories : [];
      for (const itemCategory of itemCategories) {
        const categoryId = normalizeIikoId(itemCategory?.id || itemCategory?.itemCategoryId || itemCategory?.iikoGroupId);
        const categoryName = normalizeDisplayName(itemCategory?.name || itemCategory?.title, "Категория");
        const categoryItems = Array.isArray(itemCategory?.items) ? itemCategory.items : [];
        let categoryProductsCount = 0;
        for (const categoryItem of categoryItems) {
          const itemId = normalizeIikoId(categoryItem?.itemId || categoryItem?.id || categoryItem?.productId);
          if (!itemId) continue;
          itemIds.add(itemId);
          categoryProductsCount += 1;
        }
        if (categoryId && categoryName) {
          categories.push({
            id: categoryId,
            name: categoryName,
            products_count: categoryProductsCount,
            selected: (settings.iikoSyncCategoryIds || []).includes(categoryId),
          });
        }
      }

      externalMenuItemIds = itemIds;
      externalMenuCategories = categories;
    } catch (error) {
      warnings.externalMenuById = error?.message || "Не удалось получить состав выбранного внешнего меню";
      externalMenuItemIds = new Set();
      externalMenuCategories = [];
    }
  }

  const externalMenus = (Array.isArray(externalMenusRaw) ? externalMenusRaw : [])
    .map((menu) => ({
      id: String(menu?.id || menu?.externalMenuId || menu?.menuId || "").trim(),
      name: normalizeDisplayName(menu?.name || menu?.caption || menu?.title, "Внешнее меню"),
      revision: Number.isFinite(Number(menu?.revision)) ? Number(menu?.revision) : null,
      active: menu?.isActive !== false && menu?.disabled !== true,
    }))
    .filter((menu) => Boolean(menu.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const priceCategories = (Array.isArray(priceCategoriesRaw) ? priceCategoriesRaw : [])
    .map((category) => ({
      id: String(category?.id || category?.priceCategoryId || category?.price_category_id || "").trim(),
      name: normalizeDisplayName(category?.name || category?.caption || category?.title, "Категория цен"),
    }))
    .filter((category) => Boolean(category.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const selectedMenu = externalMenus.find((menu) => menu.id === selectedExternalMenuId) || null;

  if (selectedExternalMenuId && !selectedMenu && !warnings.externalMenus) {
    warnings.externalMenuSelection = "Выбранное внешнее меню не найдено в списке, доступном по API";
  }

  if (!selectedExternalMenuId) {
    warnings.externalMenuSelection = "Для списка категорий выберите внешнее меню iiko";
  }

  const categoriesView = selectedExternalMenuId
    ? (Array.isArray(externalMenuCategories) ? externalMenuCategories : [])
        .filter((category) => Number(category.products_count || 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    : [];

  return {
    categories: categoriesView,
    externalMenus,
    priceCategories,
    warnings,
    selectedCategoryIds: settings.iikoSyncCategoryIds || [],
    selectedExternalMenuId,
    selectedPriceCategoryId,
  };
}

export async function updateAdminIntegrationSettings(patch) {
  const previousSettings = await getSystemSettings();
  const nextPatch = { ...(patch || {}) };

  const hasIikoEnabledPatch = Object.prototype.hasOwnProperty.call(nextPatch, "iiko_enabled");
  const normalizedIikoEnabled =
    nextPatch.iiko_enabled === true ||
    nextPatch.iiko_enabled === 1 ||
    String(nextPatch.iiko_enabled || "").trim().toLowerCase() === "true";

  if (hasIikoEnabledPatch && normalizedIikoEnabled) {
    const previousIntegrationMode =
      previousSettings?.integration_mode && typeof previousSettings.integration_mode === "object"
        ? previousSettings.integration_mode
        : { menu: "local", orders: "local", loyalty: "local" };
    const incomingIntegrationMode =
      nextPatch?.integration_mode && typeof nextPatch.integration_mode === "object"
        ? nextPatch.integration_mode
        : previousIntegrationMode;

    nextPatch.integration_mode = {
      ...previousIntegrationMode,
      ...incomingIntegrationMode,
      menu: "external",
    };
  }

  const { updated, errors } = await updateSystemSettings(nextPatch);
  if (errors) {
    return { errors };
  }

  if (hasIikoEnabledPatch && normalizedIikoEnabled) {
    await ensureIikoReadinessSeed();
    await refreshMenuReadiness({ preserveNotConfigured: true });
  }

  let deactivatedCategoriesCount = 0;
  if (Object.prototype.hasOwnProperty.call(updated, "iiko_sync_category_ids")) {
    const removedCategoryIds = getRemovedCategoryIds(previousSettings.iiko_sync_category_ids, updated.iiko_sync_category_ids);
    deactivatedCategoriesCount = await deactivateRemovedIikoCategories(removedCategoryIds);
  }

  return {
    errors: null,
    updated,
    meta: {
      deactivatedCategoriesCount,
    },
    settings: await getSystemSettings(),
  };
}

export async function getIikoReadiness() {
  await ensureIikoReadinessSeed();
  await refreshIikoReadiness({ preserveNotConfigured: true });
  const rows = await listReadiness("iiko");
  const byModule = rows.reduce((acc, row) => {
    acc[row.module] = row;
    return acc;
  }, {});

  return {
    provider: "iiko",
    modules: byModule,
    rows,
  };
}

export async function refreshIikoReadinessNow() {
  return refreshIikoReadiness();
}

export async function listIikoMappingCandidates(query = {}) {
  return listMappingCandidates({
    provider: "iiko",
    module: query.module || "menu",
    state: query.state || "",
    page: query.page,
    limit: query.limit,
  });
}

export async function resolveIikoMappingCandidate(payload = {}) {
  return resolveMappingCandidate({
    candidateId: payload.candidate_id,
    action: payload.action,
    resolvedBy: payload.resolved_by || null,
    targetLocalId: payload.target_local_id || null,
  });
}

export async function listIikoManualMappingTargets(query = {}) {
  return listManualMappingTargets({
    entityType: query.entity_type,
    query: query.q,
    limit: query.limit,
  });
}

export async function runIikoOnboarding(payload = {}) {
  return executeIikoOnboardingAction({
    action: payload.action,
    adminUserId: payload.admin_user_id || null,
  });
}

export async function testIikoConnection() {
  const client = await getIikoClientOrNull();
  if (!client) {
    return { ok: false, error: "Интеграция iiko выключена или не настроена" };
  }

  try {
    const payload = await client.ping();
    return { ok: true, payload };
  } catch (error) {
    const status = error?.status || null;
    let message = error?.message || "Ошибка подключения к iiko";
    const normalizedMessage = String(message).toLowerCase();

    if (status === 401) {
      message = "401 Unauthorized от iiko. Проверьте iiko_api_url (без /api/1), iiko_api_key и доступы ключа.";
    }
    if (normalizedMessage.includes("apilogin has been blocked")) {
      message = "ApiLogin iiko заблокирован. Разблокируйте или перевыпустите ключ в iiko и сохраните новый токен.";
    }

    return {
      ok: false,
      error: message,
      status,
      details: error?.response || null,
    };
  }
}

export async function testPremiumBonusConnection() {
  const client = await getPremiumBonusClientOrNull();
  if (!client) {
    return { ok: false, error: "Интеграция PremiumBonus выключена или не настроена" };
  }

  try {
    const payload = await client.ping();
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Ошибка подключения к PremiumBonus",
      status: error?.status || null,
      details: error?.response || null,
    };
  }
}

export async function syncIikoMenuNow({ cityId = null } = {}) {
  return menuAdapter.triggerFullSync({ reason: "manual", cityId });
}

export async function syncIikoStopListNow({ branchId = null } = {}) {
  return menuAdapter.triggerStopListSync({ reason: "manual", branchId });
}

export async function syncIikoDeliveryZonesNow() {
  const settings = await getIntegrationSettings();
  if (!settings.iikoEnabled) {
    return { accepted: false, reason: "Интеграция iiko выключена или не настроена" };
  }

  const result = await processIikoDeliveryZonesSync("manual");
  return {
    accepted: true,
    stats: result?.stats || null,
  };
}

export async function getIntegrationSyncStatus() {
  const settings = await getIntegrationSettings();

  const [iikoOrderRows] = await db.query(
    `SELECT
      SUM(CASE WHEN iiko_sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
      SUM(CASE WHEN iiko_sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN iiko_sync_status = 'error' THEN 1 ELSE 0 END) as error,
      SUM(CASE WHEN iiko_sync_status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM orders`,
  );

  const [pbClientRows] = await db.query(
    `SELECT
      SUM(CASE WHEN pb_sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
      SUM(CASE WHEN pb_sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN pb_sync_status = 'error' THEN 1 ELSE 0 END) as error,
      SUM(CASE WHEN pb_sync_status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM users`,
  );

  const [pbOrderRows] = await db.query(
    `SELECT
      SUM(CASE WHEN pb_sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
      SUM(CASE WHEN pb_sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN pb_sync_status = 'error' THEN 1 ELSE 0 END) as error,
      SUM(CASE WHEN pb_sync_status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM orders`,
  );

  return {
    enabled: {
      iiko: settings.iikoEnabled,
      premiumbonus: settings.premiumbonusEnabled,
    },
    iikoOrders: iikoOrderRows[0],
    premiumbonusClients: pbClientRows[0],
    premiumbonusPurchases: pbOrderRows[0],
  };
}

export async function listIntegrationSyncLogs(query) {
  return getSyncLogs(query);
}

export async function getIntegrationQueuesStatus() {
  const queueMap = [
    { key: "sync-iiko-menu", queue: iikoMenuSyncQueue },
    { key: "sync-iiko-stoplist", queue: iikoStopListSyncQueue },
    { key: "sync-iiko-orders", queue: iikoOrdersSyncQueue },
    { key: "sync-premiumbonus-clients", queue: premiumBonusClientsSyncQueue },
    { key: "sync-premiumbonus-purchases", queue: premiumBonusPurchasesSyncQueue },
  ];

  const entries = await Promise.all(
    queueMap.map(async ({ key, queue }) => {
      const stats = await getQueueStats(queue);
      return {
        key,
        stats: stats || {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          total: 0,
        },
      };
    }),
  );

  return {
    queues: entries,
  };
}

export async function retryAllFailed() {
  return retryFailedSyncs();
}

export async function retrySingleEntity({ type, id }) {
  if (type === "iiko_order") {
    const job = await enqueueIikoOrderSync({ orderId: id, source: "manual-retry" });
    return { ok: true, jobId: job.id };
  }
  if (type === "pb_client") {
    const job = await enqueuePremiumBonusClientSync({ userId: id, source: "manual-retry" });
    return { ok: true, jobId: job.id };
  }
  if (type === "pb_purchase") {
    const job = await enqueuePremiumBonusPurchaseSync({ orderId: id, source: "manual-retry" });
    return { ok: true, jobId: job.id };
  }

  return { ok: false, error: "Неизвестный тип сущности для повтора" };
}
