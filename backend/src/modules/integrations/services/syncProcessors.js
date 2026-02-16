import db from "../../../config/database.js";
import redis from "../../../config/redis.js";
import { getIikoClientOrNull, getIntegrationSettings, getPremiumBonusClientOrNull } from "./integrationConfigService.js";
import { INTEGRATION_MODULE, INTEGRATION_TYPE, MAX_SYNC_ATTEMPTS, SYNC_STATUS } from "../constants.js";
import { logIntegrationEvent } from "./integrationLoggerService.js";
import { getSystemSettings, updateSystemSettings } from "../../../utils/settings.js";

const nowIso = () => new Date().toISOString();

function nextSyncState(attempts) {
  if (attempts >= MAX_SYNC_ATTEMPTS) return SYNC_STATUS.FAILED;
  return SYNC_STATUS.ERROR;
}

export async function markOrderIikoSync(orderId, patch) {
  const { status, error = null, attempts = null, iikoOrderId = null } = patch;
  await db.query(
    `UPDATE orders
     SET iiko_sync_status = ?,
         iiko_sync_error = ?,
         iiko_sync_attempts = COALESCE(?, iiko_sync_attempts),
         iiko_order_id = COALESCE(?, iiko_order_id),
         iiko_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, iikoOrderId, orderId],
  );
}

export async function markOrderPbSync(orderId, patch) {
  const { status, error = null, attempts = null, purchaseId = null } = patch;
  await db.query(
    `UPDATE orders
     SET pb_sync_status = ?,
         pb_sync_error = ?,
         pb_sync_attempts = COALESCE(?, pb_sync_attempts),
         pb_purchase_id = COALESCE(?, pb_purchase_id),
         pb_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, purchaseId, orderId],
  );
}

export async function markUserPbSync(userId, patch) {
  const { status, error = null, attempts = null, pbClientId = null } = patch;
  await db.query(
    `UPDATE users
     SET pb_sync_status = ?,
         pb_sync_error = ?,
         pb_sync_attempts = COALESCE(?, pb_sync_attempts),
         pb_client_id = COALESCE(?, pb_client_id),
         pb_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, pbClientId, userId],
  );
}

async function loadOrderWithItems(orderId) {
  const [orders] = await db.query(
    `SELECT o.*,
            u.phone AS user_phone
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = ?`,
    [orderId],
  );
  if (orders.length === 0) throw new Error("Заказ не найден");

  const order = orders[0];
  const [items] = await db.query(
    `SELECT oi.*,
            mi.iiko_item_id,
            iv.iiko_variant_id
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.item_id
     LEFT JOIN item_variants iv ON iv.id = oi.variant_id
     WHERE oi.order_id = ?`,
    [orderId],
  );

  return { order, items };
}

export async function processIikoOrderSync(orderId, source = "queue") {
  const startedAt = Date.now();
  const integrationSettings = await getIntegrationSettings();
  if (!integrationSettings.iikoEnabled || integrationSettings?.integrationMode?.orders !== "external") {
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
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(value)) return value;
      const splitByUnderscore = value.split("_");
      const lastPart = splitByUnderscore[splitByUnderscore.length - 1];
      if (uuidRegex.test(lastPart)) return lastPart;
      return null;
    };

    const phone = normalizePhone(order.user_phone);
    if (!phone) {
      throw new Error("Невозможно синхронизировать заказ в iiko: у пользователя отсутствует телефон");
    }

    const iikoItems = items
      .map((item) => {
        const productId = String(item.iiko_item_id || "").trim();
        if (!productId) return null;

        const payloadItem = {
          type: "Product",
          productId,
          amount: Number(item.quantity) || 1,
          price: Number(item.item_price) || 0,
          comment: item.variant_name || null,
        };

        const productSizeId = extractProductSizeId(item.iiko_variant_id);
        if (productSizeId) {
          payloadItem.productSizeId = productSizeId;
        }

        return payloadItem;
      })
      .filter(Boolean);

    if (iikoItems.length === 0) {
      throw new Error("Невозможно синхронизировать заказ в iiko: отсутствует маппинг iiko_item_id у позиций заказа");
    }

    const payload = {
      order: {
        externalNumber: String(order.order_number || order.id),
        phone,
        orderServiceType: order.order_type === "pickup" ? "DeliveryByClient" : "DeliveryByCourier",
        comment: order.comment || null,
        sourceKey: "foodminiapp",
        items: iikoItems,
      },
    };

    const response = await client.createOrder(payload);
    const iikoOrderId = response?.orderId || response?.id || null;

    await markOrderIikoSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      iikoOrderId,
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

    return { synced: true, iikoOrderId };
  } catch (error) {
    const failedStatus = nextSyncState(nextAttempts);

    await markOrderIikoSync(orderId, {
      status: failedStatus,
      error: error.message,
      attempts: nextAttempts,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.IIKO,
      module: INTEGRATION_MODULE.ORDERS,
      action: "create_order",
      status: "error",
      entityType: "order",
      entityId: orderId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

export async function processPremiumBonusClientSync(userId, source = "queue") {
  const startedAt = Date.now();
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
  if (users.length === 0) throw new Error("Пользователь не найден");

  const user = users[0];
  const nextAttempts = (Number(user.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    const info = await client.buyerInfo({ identificator: user.pb_client_id || user.phone });
    let pbClientId = info?.client_id || user.pb_client_id || null;
    let responsePayload = info;

    if (!info?.is_registered) {
      const registrationPayload = {
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        birth_date: user.date_of_birth,
        external_id: user.pb_external_id || `foodminiapp_user_${user.id}`,
      };
      const registration = await client.registerBuyer(registrationPayload);
      pbClientId = registration?.client_id || pbClientId;
      responsePayload = registration;
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
      status: "error",
      entityType: "user",
      entityId: userId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

export async function processPremiumBonusPurchaseSync(orderId, action = "create", source = "queue") {
  const startedAt = Date.now();
  const { order, items } = await loadOrderWithItems(orderId);
  const [users] = await db.query("SELECT id, phone, pb_client_id FROM users WHERE id = ?", [order.user_id]);
  if (users.length === 0) throw new Error("Пользователь заказа не найден");

  const user = users[0];
  const nextAttempts = (Number(order.pb_sync_attempts) || 0) + 1;
  const client = await getPremiumBonusClientOrNull();

  if (!client) {
    throw new Error("Клиент PremiumBonus недоступен");
  }

  try {
    const customerIdentificator = user.pb_client_id || user.phone;
    let response;
    const payloadBase = {
      order_id: String(order.id),
      identificator: customerIdentificator,
      total: Number(order.total),
      bonus_spent: Number(order.bonus_spent || 0),
      items: items.map((item) => ({
        id: item.item_id,
        name: item.item_name,
        quantity: Number(item.quantity),
        price: Number(item.item_price),
      })),
    };

    if (action === "create") {
      response = await client.createPurchase(payloadBase);
    } else if (action === "status") {
      response = await client.changePurchaseStatus({
        purchase_id: order.pb_purchase_id,
        status: order.status,
      });
    } else if (action === "cancel") {
      response = await client.cancelPurchase({
        purchase_id: order.pb_purchase_id,
      });
    } else {
      throw new Error("Неизвестное действие синхронизации покупки");
    }

    await markOrderPbSync(orderId, {
      status: SYNC_STATUS.SYNCED,
      error: null,
      attempts: nextAttempts,
      purchaseId: response?.purchase_id || response?.id || order.pb_purchase_id,
    });

    await logIntegrationEvent({
      integrationType: INTEGRATION_TYPE.PREMIUMBONUS,
      module: INTEGRATION_MODULE.PURCHASES,
      action: `purchase_${action}`,
      status: "success",
      entityType: "order",
      entityId: orderId,
      requestData: payloadBase,
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
      status: "error",
      entityType: "order",
      entityId: orderId,
      errorMessage: error.message,
      attempts: nextAttempts,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  if (typeof value === "object") {
    const nested = Number(
      value.currentPrice ??
        value.current_price ??
        value.price ??
        value.value ??
        value.amount ??
        value.valueWithoutVat ??
        value.value_without_vat ??
        NaN,
    );
    if (Number.isFinite(nested)) return nested;
  }

  return null;
}

function normalizeWeightUnit(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  if (raw === "g" || raw === "гр" || raw === "г") return "g";
  if (raw === "kg" || raw === "кг") return "kg";
  if (raw === "ml" || raw === "мл") return "ml";
  if (raw === "l" || raw === "л") return "l";
  if (raw === "pcs" || raw === "шт" || raw === "шт.") return "pcs";

  return null;
}

function resolveImageUrl(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return first ? first.trim() : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object") {
    if (typeof value.href === "string" && value.href.trim()) return value.href.trim();
    if (typeof value.url === "string" && value.url.trim()) return value.url.trim();
  }
  return null;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
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

async function invalidatePublicMenuCache() {
  try {
    const keys = await redis.keys("menu:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    // Не критично для завершения sync: данные уже записаны в БД.
  }
}

function extractIikoItemCategoryIds(item = {}) {
  const ids = new Set();
  const add = (value) => {
    const normalized = normalizeIikoId(value);
    if (normalized) ids.add(normalized);
  };

  add(item.parentGroup);
  add(item.parentGroupId);
  add(item.parent_group);
  add(item.groupId);
  add(item.group_id);
  add(item.categoryId);
  add(item.category_id);
  add(item.productGroupId);
  add(item.product_group_id);

  if (Array.isArray(item.groups)) {
    for (const group of item.groups) {
      if (typeof group === "object") {
        add(group.id || group.groupId || group.group_id);
      } else {
        add(group);
      }
    }
  }

  if (Array.isArray(item.groupIds)) {
    for (const groupId of item.groupIds) add(groupId);
  }

  if (Array.isArray(item.parentGroups)) {
    for (const parentGroup of item.parentGroups) {
      if (typeof parentGroup === "object") {
        add(parentGroup.id || parentGroup.groupId || parentGroup.group_id);
      } else {
        add(parentGroup);
      }
    }
  }

  return [...ids];
}

export async function processIikoMenuSync(reason = "manual", cityId = null) {
  const client = await getIikoClientOrNull();
  if (!client) throw new Error("Клиент iiko недоступен");
  const integrationSettings = await getIntegrationSettings();
  const selectedCategoryIds = new Set((integrationSettings.iikoSyncCategoryIds || []).map((id) => String(id).trim()).filter(Boolean));
  const useCategoryFilter = selectedCategoryIds.size > 0;
  const externalMenuId = String(integrationSettings.iikoExternalMenuId || "").trim();
  const useExternalMenuFilter = Boolean(externalMenuId);

  // Загружаем последние revision из настроек
  const systemSettings = await getSystemSettings();
  const lastRevisions = systemSettings.iiko_last_revisions || {};

  const startedAt = Date.now();
  const data = await client.getNomenclature({ useConfiguredOrganization: false, lastRevisions });
  let externalMenuPayload = null;
  let externalMenuItemIds = new Set();
  const externalMenuCategoryIdsByItemId = new Map();
  let externalCategoriesRaw = [];

  if (useExternalMenuFilter) {
    externalMenuPayload = await client.getMenuById({
      externalMenuId,
      useConfiguredOrganization: false,
    });

    const menuCategories = Array.isArray(externalMenuPayload?.itemCategories) ? externalMenuPayload.itemCategories : [];
    externalCategoriesRaw = menuCategories.map((category, index) => ({
      id: normalizeIikoId(category?.id || category?.itemCategoryId || category?.iikoGroupId),
      name: firstNonEmptyString(category?.name, category?.title, category?.caption) || `Категория ${index + 1}`,
      sort_order: index,
      is_active: category?.isHidden ? 0 : 1,
      image_url: category?.buttonImageUrl || category?.headerImageUrl || null,
    }));

    const scopedItemIds = new Set();
    for (const category of menuCategories) {
      const externalCategoryId = normalizeIikoId(category?.id || category?.itemCategoryId || category?.iikoGroupId);
      const categoryItems = Array.isArray(category?.items) ? category.items : [];
      for (const menuItem of categoryItems) {
        const itemId = normalizeIikoId(menuItem?.itemId || menuItem?.id || menuItem?.productId);
        if (!itemId) continue;
        if (useCategoryFilter && externalCategoryId && !selectedCategoryIds.has(externalCategoryId)) {
          continue;
        }
        scopedItemIds.add(itemId);
        if (externalCategoryId) {
          if (!externalMenuCategoryIdsByItemId.has(itemId)) {
            externalMenuCategoryIdsByItemId.set(itemId, new Set());
          }
          externalMenuCategoryIdsByItemId.get(itemId).add(externalCategoryId);
        }
      }
    }
    externalMenuItemIds = scopedItemIds;

    if (externalMenuItemIds.size === 0) {
      throw new Error("Во внешнем меню iiko не найдено позиций для синхронизации");
    }
  }

  const categoriesRaw = useExternalMenuFilter
    ? externalCategoriesRaw
    : Array.isArray(data?.groups) && data.groups.length > 0
      ? data.groups
      : Array.isArray(data?.categories) && data.categories.length > 0
        ? data.categories
        : Array.isArray(data?.productCategories)
          ? data.productCategories
          : [];
  const itemsRaw = Array.isArray(data?.items) ? data.items : Array.isArray(data?.products) ? data.products : [];
  const items = useExternalMenuFilter
    ? itemsRaw.filter((item) => {
        const iikoItemId = normalizeIikoId(item?.id || item?.item_id || item?.productId || item?.product_id);
        return iikoItemId && externalMenuItemIds.has(iikoItemId);
      })
    : itemsRaw;
  const allowedCategoryIds = new Set();
  for (const item of items) {
    const itemCategoryIds = extractIikoItemCategoryIds(item);
    for (const itemCategoryId of itemCategoryIds) {
      const normalizedCategoryId = normalizeIikoId(itemCategoryId);
      if (normalizedCategoryId) allowedCategoryIds.add(normalizedCategoryId);
    }
  }
  const categories = categoriesRaw.filter((category) => {
    const iikoCategoryId = normalizeIikoId(category?.id || category?.category_id || category?.groupId || category?.group_id);
    if (!iikoCategoryId) return false;
    if (useExternalMenuFilter && !allowedCategoryIds.has(iikoCategoryId)) return false;
    return true;
  });
  const sizes = Array.isArray(data?.sizes) ? data.sizes : [];
  const modifierGroups = Array.isArray(data?.modifier_groups) ? data.modifier_groups : [];
  const modifiers = Array.isArray(data?.modifiers) ? data.modifiers : [];

  const connection = await db.getConnection();
  let stats = { categories: 0, items: 0, variants: 0, modifierGroups: 0, modifiers: 0 };

  try {
    await connection.beginTransaction();

    const [citiesRows] = await connection.query("SELECT id FROM cities ORDER BY id");
    const allCityIds = citiesRows.map((row) => Number(row.id)).filter(Number.isFinite);
    const requestedCityId = Number(cityId);
    const targetCityIds = Number.isFinite(requestedCityId) && requestedCityId > 0 ? [requestedCityId] : allCityIds;

    const sizeNameById = new Map();
    for (const size of sizes) {
      const sizeId = normalizeIikoId(size.id || size.sizeId || size.size_id);
      if (!sizeId) continue;
      const sizeName = size.name || size.fullName || size.shortName || size.code || null;
      if (!sizeName) continue;
      sizeNameById.set(toLookupKey(sizeId), String(sizeName));
    }

    const localCategoryIdByIikoId = new Map();
    const processedCategoryIds = new Set();
    const syncedCategoryExternalIds = new Set();
    const syncedItemExternalIds = new Set();

    for (const category of categories) {
      const iikoId = normalizeIikoId(category.id || category.category_id || category.groupId || category.group_id);
      if (!iikoId) continue;
      if (processedCategoryIds.has(iikoId)) continue;
      processedCategoryIds.add(iikoId);
      if (useCategoryFilter && !selectedCategoryIds.has(iikoId)) continue;

      const name = normalizeDisplayName(category.name || category.title || category.caption, `Категория ${iikoId}`);
      const sortOrder = Number(category.sort_order || category.order || 0);
      const isActive = category.is_active === false || category.isDeleted === true ? 0 : 1;
      const imageUrl = category.image_url || category.image || category.imageLinks?.[0]?.href || null;

      const [existing] = await connection.query("SELECT id FROM menu_categories WHERE iiko_category_id = ? LIMIT 1", [iikoId]);
      let localCategoryId = null;
      if (existing.length > 0) {
        localCategoryId = existing[0].id;
        await connection.query(
          `UPDATE menu_categories
           SET name = ?, image_url = COALESCE(?, image_url), sort_order = ?, is_active = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [name, imageUrl, sortOrder, isActive, localCategoryId],
        );
      } else {
        const [inserted] = await connection.query(
          `INSERT INTO menu_categories (name, image_url, sort_order, is_active, iiko_category_id, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [name, imageUrl, sortOrder, isActive, iikoId],
        );
        localCategoryId = inserted.insertId;
      }

      localCategoryIdByIikoId.set(iikoId, localCategoryId);
      syncedCategoryExternalIds.add(iikoId);

      for (const targetCityId of targetCityIds) {
        await connection.query(
          `INSERT INTO menu_category_cities (category_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [localCategoryId, targetCityId, isActive ? 1 : 0],
        );
      }

      stats.categories += 1;
    }

    for (const item of items) {
      const iikoItemId = normalizeIikoId(item.id || item.item_id || item.productId || item.product_id);
      if (!iikoItemId) continue;
      if (String(item.orderItemType || "").toLowerCase() === "modifier") continue;
      if (String(item.type || "").toLowerCase() === "modifier") continue;
      const iikoCategoryIds = useExternalMenuFilter
        ? [...(externalMenuCategoryIdsByItemId.get(iikoItemId) || [])]
        : extractIikoItemCategoryIds(item);
      if (useCategoryFilter && !useExternalMenuFilter) {
        const inSelectedCategory = iikoCategoryIds.some((categoryId) => selectedCategoryIds.has(categoryId));
        if (!inSelectedCategory) continue;
      }

      const name = normalizeDisplayName(item.name || item.title, `Позиция ${iikoItemId}`);
      const composition = firstNonEmptyString(item.composition, item.additionalInfo, item.description, item.comment);
      const description = null;
      const imageUrl =
        resolveImageUrl(item.image_url) ||
        resolveImageUrl(item.image) ||
        resolveImageUrl(item.imageLinks) ||
        resolveImageUrl(item.images) ||
        resolveImageUrl(item?.imageLinks?.large) ||
        resolveImageUrl(item?.imageLinks?.medium) ||
        resolveImageUrl(item?.imageLinks?.small) ||
        null;
      const sizePricesRaw = Array.isArray(item.sizePrices) ? item.sizePrices : Array.isArray(item.size_prices) ? item.size_prices : [];
      const hasIncludedSize = sizePricesRaw.some((sizePrice) => sizePrice?.price?.isIncludedInMenu !== false);
      const isIncludedInMenu = typeof item.isIncludedInMenu === "boolean" ? item.isIncludedInMenu : sizePricesRaw.length > 0 ? hasIncludedSize : true;
      const isActive = item.is_active === false || item.isDeleted === true || isIncludedInMenu === false ? 0 : 1;
      const directPrice = toNumberOrNull(item.price ?? item.base_price);
      const fallbackSizePrice = sizePricesRaw.length > 0 ? toNumberOrNull(sizePricesRaw[0]?.price ?? sizePricesRaw[0]?.priceValue) : null;
      const basePrice = directPrice ?? fallbackSizePrice ?? 0;
      const sortOrder = Number(item.sort_order || item.order || 0);
      const nutrition = item.nutritionalValues || item.nutritional_values || item.nutrition || {};
      const nutritionPer100 = nutrition.per100g || nutrition.per100 || nutrition.valuesPer100g || {};
      const nutritionPerServing = nutrition.perServing || nutrition.serving || nutrition.full || {};
      const weightValue = toNumberOrNull(
        item.weight ?? item.amount ?? item.measureUnitWeight ?? item.measure_unit_weight ?? item.portionWeight ?? nutrition.weight,
      );
      const weightUnit = normalizeWeightUnit(item.weight_unit || item.measureUnit || item.weightUnit || item.unit) || "pcs";
      const caloriesPer100g = toNumberOrNull(item.energyAmount ?? nutritionPer100.energy ?? nutritionPer100.calories);
      const proteinsPer100g = toNumberOrNull(item.proteinsAmount ?? nutritionPer100.proteins);
      const fatsPer100g = toNumberOrNull(item.fatAmount ?? nutritionPer100.fats ?? nutritionPer100.fat);
      const carbsPer100g = toNumberOrNull(item.carbohydratesAmount ?? nutritionPer100.carbohydrates ?? nutritionPer100.carbs);
      const caloriesPerServing = toNumberOrNull(item.energyFullAmount ?? nutritionPerServing.energy ?? nutritionPerServing.calories);
      const proteinsPerServing = toNumberOrNull(item.proteinsFullAmount ?? nutritionPerServing.proteins);
      const fatsPerServing = toNumberOrNull(item.fatFullAmount ?? nutritionPerServing.fats ?? nutritionPerServing.fat);
      const carbsPerServing = toNumberOrNull(item.carbohydratesFullAmount ?? nutritionPerServing.carbohydrates ?? nutritionPerServing.carbs);

      const [existing] = await connection.query("SELECT id FROM menu_items WHERE iiko_item_id = ? LIMIT 1", [iikoItemId]);
      let localItemId = null;
      if (existing.length > 0) {
        localItemId = existing[0].id;
        await connection.query(
          `UPDATE menu_items
           SET name = ?, description = ?, composition = ?, image_url = COALESCE(?, image_url), price = ?, sort_order = ?, is_active = ?,
               weight_value = ?, weight_unit = ?, calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
               calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [
            name,
            description,
            composition,
            imageUrl,
            basePrice,
            sortOrder,
            isActive,
            weightValue,
            weightUnit,
            caloriesPer100g,
            proteinsPer100g,
            fatsPer100g,
            carbsPer100g,
            caloriesPerServing,
            proteinsPerServing,
            fatsPerServing,
            carbsPerServing,
            localItemId,
          ],
        );
      } else {
        const [inserted] = await connection.query(
          `INSERT INTO menu_items
           (name, description, composition, price, image_url, sort_order, is_active, iiko_item_id,
            weight_value, weight_unit, calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
            calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            name,
            description,
            composition,
            basePrice,
            imageUrl,
            sortOrder,
            isActive,
            iikoItemId,
            weightValue,
            weightUnit,
            caloriesPer100g,
            proteinsPer100g,
            fatsPer100g,
            carbsPer100g,
            caloriesPerServing,
            proteinsPerServing,
            fatsPerServing,
            carbsPerServing,
          ],
        );
        localItemId = inserted.insertId;
      }

      const localCategoryIds = iikoCategoryIds
        .map((iikoCategoryId) => localCategoryIdByIikoId.get(iikoCategoryId))
        .filter((value) => Number.isFinite(Number(value)));

      if (localCategoryIds.length > 0) {
        await connection.query("DELETE FROM menu_item_categories WHERE item_id = ?", [localItemId]);
        for (const localCategoryId of localCategoryIds) {
          await connection.query(
            `INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order)
             VALUES (?, ?, 0)`,
            [localItemId, localCategoryId],
          );
        }
      }

      for (const targetCityId of targetCityIds) {
        await connection.query(
          `INSERT INTO menu_item_cities (item_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [localItemId, targetCityId, isActive ? 1 : 0],
        );
      }
      syncedItemExternalIds.add(iikoItemId);

      stats.items += 1;

      const itemVariants =
        sizePricesRaw.length > 0
          ? sizePricesRaw.map((sizePrice, index) => {
              const sizeObject = sizePrice.size || sizePrice.productSize || sizePrice.price?.size || null;
              const sizeId = normalizeIikoId(
                sizePrice.sizeId || sizePrice.size_id || sizePrice.productSizeId || sizePrice.product_size_id || sizePrice.id || sizeObject?.id,
              );
              const variantName =
                firstNonEmptyString(
                  sizePrice.sizeName,
                  sizePrice.name,
                  sizePrice.caption,
                  sizePrice.productSizeName,
                  sizeObject?.name,
                  sizeObject?.fullName,
                ) ||
                (sizeId ? sizeNameById.get(toLookupKey(sizeId)) : null) ||
                (sizePricesRaw.length > 1 ? `Вариант ${index + 1}` : "Стандарт");
              const variantPrice = toNumberOrNull(sizePrice.price ?? sizePrice.priceValue);
              const variantIncluded = sizePrice?.price?.isIncludedInMenu !== false;
              return {
                id: sizeId ? `${iikoItemId}_${sizeId}` : `${iikoItemId}_size_${index + 1}`,
                name: variantName,
                price: variantPrice ?? basePrice,
                sort_order: index,
                is_active: isActive === 1 && variantIncluded,
                image_url: imageUrl,
              };
            })
          : Array.isArray(item.variants)
            ? item.variants
            : [];

      const syncedVariantIds = [];
      for (const variant of itemVariants) {
        const iikoVariantId = normalizeIikoId(variant.id || variant.variant_id || variant.sizeId || variant.size_id);
        if (!iikoVariantId) continue;
        syncedVariantIds.push(iikoVariantId);

        const variantName = normalizeDisplayName(variant.name, `Вариант ${iikoVariantId}`);
        const variantPrice = toNumberOrNull(variant.price) ?? basePrice ?? 0;
        const variantImage = variant.image_url || variant.image || null;
        const variantSortOrder = Number(variant.sort_order || 0);
        const variantActive = variant.is_active === false ? 0 : 1;

        const [existingVariant] = await connection.query("SELECT id FROM item_variants WHERE iiko_variant_id = ? LIMIT 1", [iikoVariantId]);
        if (existingVariant.length > 0) {
          await connection.query(
            `UPDATE item_variants
             SET item_id = ?, name = ?, price = ?, image_url = COALESCE(?, image_url), sort_order = ?, is_active = ?, iiko_synced_at = NOW()
             WHERE id = ?`,
            [localItemId, variantName, variantPrice, variantImage, variantSortOrder, variantActive, existingVariant[0].id],
          );
        } else {
          await connection.query(
            `INSERT INTO item_variants (item_id, name, price, image_url, sort_order, is_active, iiko_variant_id, iiko_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [localItemId, variantName, variantPrice, variantImage, variantSortOrder, variantActive, iikoVariantId],
          );
        }
        stats.variants += 1;
      }

      // Деактивируем устаревшие iiko-варианты товара, которых больше нет в актуальном ответе.
      if (syncedVariantIds.length > 0) {
        await connection.query(
          `UPDATE item_variants
           SET is_active = 0, iiko_synced_at = NOW()
           WHERE item_id = ?
             AND iiko_variant_id IS NOT NULL
             AND iiko_variant_id NOT IN (${syncedVariantIds.map(() => "?").join(",")})`,
          [localItemId, ...syncedVariantIds],
        );
      }
    }

    for (const group of modifierGroups) {
      const iikoGroupId = String(group.id || group.group_id || "");
      if (!iikoGroupId) continue;
      const name = normalizeDisplayName(group.name, `Группа ${iikoGroupId}`);
      const type = group.type === "multiple" ? "multiple" : "single";
      const isRequired = group.is_required ? 1 : 0;
      const [existingGroup] = await connection.query("SELECT id FROM modifier_groups WHERE iiko_modifier_group_id = ? LIMIT 1", [iikoGroupId]);

      if (existingGroup.length > 0) {
        await connection.query(
          `UPDATE modifier_groups
           SET name = ?, type = ?, is_required = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [name, type, isRequired, existingGroup[0].id],
        );
      } else {
        await connection.query(
          `INSERT INTO modifier_groups (name, type, is_required, iiko_modifier_group_id, iiko_synced_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [name, type, isRequired, iikoGroupId],
        );
      }
      stats.modifierGroups += 1;
    }

    for (const modifier of modifiers) {
      const iikoModifierId = String(modifier.id || modifier.modifier_id || "");
      if (!iikoModifierId) continue;
      const groupIikoId = String(modifier.group_id || modifier.modifier_group_id || "");
      if (!groupIikoId) continue;

      const [groupRows] = await connection.query("SELECT id FROM modifier_groups WHERE iiko_modifier_group_id = ? LIMIT 1", [groupIikoId]);
      if (groupRows.length === 0) continue;

      const groupId = groupRows[0].id;
      const name = normalizeDisplayName(modifier.name, `Модификатор ${iikoModifierId}`);
      const price = Number(modifier.price || 0);
      const imageUrl = modifier.image_url || modifier.image || null;
      const isActive = modifier.is_active === false ? 0 : 1;
      const sortOrder = Number(modifier.sort_order || 0);

      const [existingModifier] = await connection.query("SELECT id FROM modifiers WHERE iiko_modifier_id = ? LIMIT 1", [iikoModifierId]);
      if (existingModifier.length > 0) {
        await connection.query(
          `UPDATE modifiers
           SET group_id = ?, name = ?, price = ?, image_url = COALESCE(?, image_url), is_active = ?, sort_order = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
          [groupId, name, price, imageUrl, isActive, sortOrder, existingModifier[0].id],
        );
      } else {
        await connection.query(
          `INSERT INTO modifiers (group_id, name, price, image_url, is_active, sort_order, iiko_modifier_id, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [groupId, name, price, imageUrl, isActive, sortOrder, iikoModifierId],
        );
      }
      stats.modifiers += 1;
    }

    // Удаляем iiko-данные, которые больше не входят в текущий scope синхронизации:
    // - блюдо удалено в iiko;
    // - категория исключена из выбранных категорий синхронизации.
    if (syncedItemExternalIds.size > 0) {
      const syncedIds = [...syncedItemExternalIds];
      await connection.query(
        `DELETE FROM menu_items
         WHERE iiko_item_id IS NOT NULL
           AND iiko_item_id NOT IN (${syncedIds.map(() => "?").join(",")})`,
        syncedIds,
      );
    } else {
      await connection.query("DELETE FROM menu_items WHERE iiko_item_id IS NOT NULL");
    }

    if (syncedCategoryExternalIds.size > 0) {
      const syncedCategoryIds = [...syncedCategoryExternalIds];
      await connection.query(
        `DELETE FROM menu_categories
         WHERE iiko_category_id IS NOT NULL
           AND iiko_category_id NOT IN (${syncedCategoryIds.map(() => "?").join(",")})`,
        syncedCategoryIds,
      );
    } else {
      await connection.query("DELETE FROM menu_categories WHERE iiko_category_id IS NOT NULL");
    }

    await connection.commit();

    // Сохраняем новые revision для инкрементальных обновлений
    if (data?.organizationStats && Array.isArray(data.organizationStats)) {
      const newRevisions = { ...lastRevisions };
      for (const orgStat of data.organizationStats) {
        if (orgStat.organizationId && orgStat.revision !== null && orgStat.revision !== undefined) {
          newRevisions[orgStat.organizationId] = orgStat.revision;
        }
      }
      // Обновляем настройку в БД
      await updateSystemSettings({ iiko_last_revisions: newRevisions });
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await invalidatePublicMenuCache();

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.MENU,
    action: "sync_menu",
    status: "success",
    requestData: { reason, cityId },
    responseData: {
      hasData: Boolean(data),
      keys: data ? Object.keys(data).slice(0, 20) : [],
      organizationStats: Array.isArray(data?.organizationStats) ? data.organizationStats : [],
      selectedCategoryIds: [...selectedCategoryIds],
      externalMenuId: useExternalMenuFilter ? externalMenuId : null,
      externalMenuItemCount: useExternalMenuFilter ? externalMenuItemIds.size : null,
      synced: stats,
      revisions:
        data?.organizationStats?.reduce((acc, stat) => {
          if (stat.organizationId && stat.revision) acc[stat.organizationId] = stat.revision;
          return acc;
        }, {}) || {},
    },
    durationMs: Date.now() - startedAt,
  });

  return data;
}

export async function processIikoStopListSync(reason = "manual", branchId = null) {
  const client = await getIikoClientOrNull();
  if (!client) throw new Error("Клиент iiko недоступен");

  const startedAt = Date.now();
  const data = await client.getStopList({});
  let updatedCount = 0;

  if (branchId) {
    const rawEntities = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.stop_list)
          ? data.stop_list
          : [];

    for (const entity of rawEntities) {
      const externalId = String(entity.id || entity.item_id || entity.variant_id || "");
      if (!externalId) continue;

      let localType = "item";
      let localId = null;

      const [itemRows] = await db.query("SELECT id FROM menu_items WHERE iiko_item_id = ? LIMIT 1", [externalId]);
      if (itemRows.length > 0) {
        localType = "item";
        localId = itemRows[0].id;
      } else {
        const [variantRows] = await db.query("SELECT id FROM item_variants WHERE iiko_variant_id = ? LIMIT 1", [externalId]);
        if (variantRows.length > 0) {
          localType = "variant";
          localId = variantRows[0].id;
        }
      }

      if (!localId) continue;

      await db.query(
        `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, reason, created_by)\n         VALUES (?, ?, ?, ?, NULL)\n         ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
        [branchId, localType, localId, "Синхронизация стоп-листа из iiko"],
      );
      updatedCount += 1;
    }
  }

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.STOPLIST,
    action: "sync_stoplist",
    status: "success",
    requestData: { reason, branchId },
    responseData: {
      hasData: Boolean(data),
      keys: data ? Object.keys(data).slice(0, 20) : [],
      updatedCount,
    },
    durationMs: Date.now() - startedAt,
  });

  return data;
}

export async function processIikoDeliveryZonesSync() {
  const settings = await getIntegrationSettings();
  if (!settings.iikoEnabled) return null;
  const client = await getIikoClientOrNull();
  if (!client) return null;

  const startedAt = Date.now();
  const response = await client.getDeliveryZones({ organizationId: settings.iikoOrganizationId });

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.DELIVERY_ZONES,
    action: "sync_delivery_zones",
    status: "success",
    responseData: { hasData: Boolean(response), keys: response ? Object.keys(response).slice(0, 20) : [] },
    durationMs: Date.now() - startedAt,
  });

  return response;
}

export async function retryFailedSyncs() {
  const [iikoOrders] = await db.query(
    `SELECT id FROM orders
     WHERE iiko_sync_status IN ('pending', 'error')
       AND iiko_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS],
  );

  const [pbUsers] = await db.query(
    `SELECT id FROM users
     WHERE pb_sync_status IN ('pending', 'error')
       AND pb_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS],
  );

  const [pbOrders] = await db.query(
    `SELECT id FROM orders
     WHERE pb_sync_status IN ('pending', 'error')
       AND pb_sync_attempts < ?
     ORDER BY id ASC
     LIMIT 100`,
    [MAX_SYNC_ATTEMPTS],
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
      await processPremiumBonusPurchaseSync(row.id, "create", "retry");
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
