import db from "../../../config/database.js";
import { getSettingsList, getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";
import { getIikoClientOrNull, getIntegrationSettings, getPremiumBonusClientOrNull } from "./integrationConfigService.js";
import { getSyncLogs } from "../repositories/syncLogRepository.js";
import menuAdapter from "../adapters/menuAdapter.js";
import { retryFailedSyncs } from "./syncProcessors.js";
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

function extractIikoItemCategoryIds(item = {}) {
  const ids = new Set();
  const add = (value) => {
    const id = String(value || "").trim();
    if (id) ids.add(id);
  };

  add(item.parentGroup);
  add(item.parentGroupId);
  add(item.parent_group);
  add(item.groupId);
  add(item.group_id);
  add(item.categoryId);
  add(item.category_id);
  add(item.productCategoryId);
  add(item.product_category_id);
  add(item.productGroupId);
  add(item.product_group_id);

  if (Array.isArray(item.groups)) {
    for (const group of item.groups) {
      if (typeof group === "object") add(group.id || group.groupId || group.group_id);
      else add(group);
    }
  }

  return [...ids];
}

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

export async function getAdminIntegrationSettings() {
  const settings = await getSystemSettings();
  return {
    settings,
    items: getSettingsList(settings),
  };
}

export async function getIikoNomenclatureOverview(options = {}) {
  const externalMenuIdOverride = String(options.externalMenuId || "").trim();
  const settings = await getIntegrationSettings();
  const client = await getIikoClientOrNull();
  if (!client) {
    return {
      categories: [],
      externalMenus: [],
      warnings: {
        client: "Интеграция iiko выключена или не настроена",
      },
      selectedCategoryIds: settings.iikoSyncCategoryIds || [],
      selectedExternalMenuId: externalMenuIdOverride || settings.iikoExternalMenuId || "",
    };
  }

  const warnings = {};
  let externalMenusRaw = [];
  try {
    externalMenusRaw = await client.getExternalMenus({ useConfiguredOrganization: false });
  } catch (error) {
    externalMenusRaw = [];
    warnings.externalMenus = error?.message || "Не удалось получить список внешних меню iiko";
  }
  let nomenclature = {};
  try {
    nomenclature = await client.getNomenclature({ useConfiguredOrganization: false });
  } catch (error) {
    nomenclature = {};
    warnings.nomenclature = error?.message || "Не удалось получить номенклатуру iiko";
  }

  const categoriesRaw = Array.isArray(nomenclature?.groups) && nomenclature.groups.length > 0
    ? nomenclature.groups
    : Array.isArray(nomenclature?.categories) && nomenclature.categories.length > 0
      ? nomenclature.categories
      : Array.isArray(nomenclature?.productCategories)
        ? nomenclature.productCategories
        : [];
  const itemsRaw = Array.isArray(nomenclature?.items)
    ? nomenclature.items
    : Array.isArray(nomenclature?.products)
      ? nomenclature.products
      : [];

  const selectedExternalMenuId = externalMenuIdOverride || String(settings.iikoExternalMenuId || "").trim();

  let externalMenuItemIds = null;
  let externalMenuCategories = null;
  if (selectedExternalMenuId) {
    try {
      const menuById = await client.getMenuById({
        externalMenuId: selectedExternalMenuId,
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

  const countsByCategory = new Map();
  for (const item of itemsRaw) {
    if (externalMenuItemIds && externalMenuItemIds.size > 0) {
      const itemId = normalizeIikoId(item?.id || item?.item_id || item?.productId || item?.product_id);
      if (!itemId || !externalMenuItemIds.has(itemId)) continue;
    }
    if (externalMenuItemIds && externalMenuItemIds.size === 0) {
      continue;
    }
    const ids = extractIikoItemCategoryIds(item);
    for (const id of ids) {
      countsByCategory.set(id, (countsByCategory.get(id) || 0) + 1);
    }
  }

  const categoriesByName = new Map();
  for (const category of categoriesRaw) {
    const id = String(category?.id || category?.groupId || category?.category_id || "").trim();
    if (!id) continue;
    const productsCount = countsByCategory.get(id) || 0;
    const name = normalizeDisplayName(category?.name || category?.title || category?.caption, `Категория ${id}`);
    const key = name.toLocaleLowerCase("ru-RU");
    const next = {
      id,
      name,
      products_count: productsCount,
      selected: (settings.iikoSyncCategoryIds || []).includes(id),
    };

    const existing = categoriesByName.get(key);
    if (!existing) {
      categoriesByName.set(key, next);
      continue;
    }
    existing.products_count += next.products_count;
    existing.selected = existing.selected || next.selected;
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
  const selectedMenu = externalMenus.find((menu) => menu.id === selectedExternalMenuId) || null;

  if (selectedExternalMenuId && !selectedMenu && !warnings.externalMenus) {
    warnings.externalMenuSelection = "Выбранное внешнее меню не найдено в списке, доступном по API";
  }

  const categoriesView = selectedExternalMenuId
    ? (Array.isArray(externalMenuCategories) ? externalMenuCategories : [])
        .filter((category) => Number(category.products_count || 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    : [...categoriesByName.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return {
    categories: categoriesView,
    externalMenus,
    warnings,
    selectedCategoryIds: settings.iikoSyncCategoryIds || [],
    selectedExternalMenuId,
  };
}

export async function updateAdminIntegrationSettings(patch) {
  const { updated, errors } = await updateSystemSettings(patch);
  if (errors) {
    return { errors };
  }

  return {
    errors: null,
    updated,
    settings: await getSystemSettings(),
  };
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
      message =
        "401 Unauthorized от iiko. Проверьте iiko_api_url (без /api/1), iiko_api_token (apiLogin или Bearer) и доступы ключа.";
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
