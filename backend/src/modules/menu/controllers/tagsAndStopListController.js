import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";
import { getIikoClientOrNull, getIntegrationSettings } from "../../integrations/services/integrationConfigService.js";

const AUTO_NO_PRICE_REASON = "Не задана цена";
const IIKO_STOPLIST_SYNC_REASON = "Синхронизация стоп-листа из iiko";

// Вспомогательные функции
async function getItemCityIds(itemId) {
  const [rows] = await db.query("SELECT city_id FROM menu_item_cities WHERE item_id = ?", [itemId]);
  return rows.map((row) => row.city_id);
}

function managerHasCityAccess(user, cityIds) {
  if (user.role !== "manager") return true;
  if (!Array.isArray(user.cities) || user.cities.length === 0) return false;
  if (!Array.isArray(cityIds) || cityIds.length === 0) return true;
  return cityIds.some((cityId) => user.cities.includes(cityId));
}

async function invalidateAllMenuCache() {
  try {
    const redis = (await import("../../../config/redis.js")).default;
    const keys = await redis.keys("menu:*:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
    notifyMenuUpdated({ source: "admin", scope: "all" });
  } catch (error) {
    logger.error("Failed to invalidate all menu cache", { error });
  }
}

function normalizeFulfillmentTypes(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .sort();
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeFulfillmentTypes(parsed);
    } catch (error) {
      return [];
    }
  }
  return [];
}

function resolveNoPriceFulfillmentTypes(row) {
  const hasVariants = Number(row.has_variants) === 1;
  const deliveryPositive = hasVariants ? Number(row.variant_delivery_positive) === 1 : Number(row.item_delivery_positive) === 1;
  const pickupPositive = hasVariants ? Number(row.variant_pickup_positive) === 1 : Number(row.item_pickup_positive) === 1;

  const missing = [];
  if (!deliveryPositive) missing.push("delivery");
  if (!pickupPositive) missing.push("pickup");
  return missing;
}

function extractProductSizeId(externalVariantId) {
  const value = String(externalVariantId || "").trim();
  if (!value) return "";
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(value)) return value;
  const splitByUnderscore = value.split("_");
  const lastPart = splitByUnderscore[splitByUnderscore.length - 1];
  if (uuidRegex.test(lastPart)) return lastPart;
  return "";
}

async function resolveIikoStopListChangeContext({ branchId, entityType, entityId, createdBy = undefined, reason = undefined }) {
  const settings = await getIntegrationSettings();
  const menuMode = String(settings?.integrationMode?.menu || "local").trim().toLowerCase();
  const isIikoExternalMode = settings.iikoEnabled && menuMode === "external";
  if (!isIikoExternalMode) {
    return { shouldSync: false, skipReason: "Режим iiko для меню не активен" };
  }

  if (createdBy === null && String(reason || "").trim() === AUTO_NO_PRICE_REASON) {
    return { shouldSync: false, skipReason: "Автоматический локальный стоп-лист по нулевой цене" };
  }

  if (createdBy === null && String(reason || "").trim() === IIKO_STOPLIST_SYNC_REASON) {
    return { shouldSync: false, skipReason: "Запись синхронизирована из iiko, обратная отправка не требуется" };
  }

  const [branchRows] = await db.query(
    `SELECT id, iiko_terminal_group_id, iiko_organization_id
     FROM branches
     WHERE id = ?
     LIMIT 1`,
    [branchId],
  );
  if (!Array.isArray(branchRows) || branchRows.length === 0) {
    throw new Error("Филиал не найден");
  }
  const branch = branchRows[0];
  const organizationId = String(branch.iiko_organization_id || settings.iikoOrganizationId || "").trim();
  const terminalGroupId = String(branch.iiko_terminal_group_id || "").trim();
  if (!organizationId) {
    throw new Error("Для филиала не задан iiko_organization_id");
  }
  if (!terminalGroupId) {
    throw new Error("Для филиала не задан iiko_terminal_group_id");
  }

  let itemPayload = null;
  if (entityType === "item") {
    const [rows] = await db.query(
      `SELECT iiko_item_id
       FROM menu_items
       WHERE id = ?
       LIMIT 1`,
      [entityId],
    );
    const productId = String(rows?.[0]?.iiko_item_id || "").trim();
    if (!productId) {
      throw new Error("У блюда не задан iiko_item_id");
    }
    itemPayload = { productId };
  } else if (entityType === "variant") {
    const [rows] = await db.query(
      `SELECT iv.iiko_variant_id, mi.iiko_item_id
       FROM item_variants iv
       LEFT JOIN menu_items mi ON mi.id = iv.item_id
       WHERE iv.id = ?
       LIMIT 1`,
      [entityId],
    );
    const productId = String(rows?.[0]?.iiko_item_id || "").trim();
    const sizeId = extractProductSizeId(rows?.[0]?.iiko_variant_id);
    if (!productId) {
      throw new Error("Для варианта не найден iiko_item_id базового блюда");
    }
    if (!sizeId) {
      throw new Error("У варианта не задан корректный iiko_variant_id (sizeId)");
    }
    itemPayload = { productId, sizeId };
  } else if (entityType === "modifier") {
    const [rows] = await db.query(
      `SELECT iiko_modifier_id
       FROM modifiers
       WHERE id = ?
       LIMIT 1`,
      [entityId],
    );
    const productId = String(rows?.[0]?.iiko_modifier_id || "").trim();
    if (!productId) {
      throw new Error("У модификатора не задан iiko_modifier_id");
    }
    itemPayload = { productId };
  } else {
    throw new Error("Неподдерживаемый entity_type для синхронизации с iiko");
  }

  const client = await getIikoClientOrNull();
  if (!client) {
    throw new Error("Клиент iiko недоступен");
  }

  return {
    shouldSync: true,
    client,
    payload: {
      organizationId,
      terminalGroupId,
      item: itemPayload,
    },
  };
}

async function syncStopListChangeToIiko({ operation, branchId, entityType, entityId, createdBy = undefined, reason = undefined }) {
  const context = await resolveIikoStopListChangeContext({
    branchId,
    entityType,
    entityId,
    createdBy,
    reason,
  });
  if (!context.shouldSync) return context;

  const { client, payload } = context;
  const basePayload = {
    organizationId: payload.organizationId,
    terminalGroupId: payload.terminalGroupId,
  };
  if (operation === "add") {
    await client.addProductsToStopList({
      ...basePayload,
      items: [{ ...payload.item, balance: 0 }],
    });
  } else if (operation === "remove") {
    await client.removeProductsFromStopList({
      ...basePayload,
      items: [payload.item],
    });
  } else {
    throw new Error("Неподдерживаемая операция синхронизации стоп-листа");
  }

  return {
    shouldSync: true,
    synced: true,
  };
}

async function syncAutoNoPriceStopList(branchId = null) {
  const normalizedBranchId = Number(branchId);
  const branchFilter = Number.isInteger(normalizedBranchId) && normalizedBranchId > 0 ? normalizedBranchId : null;
  const branchWhere = branchFilter ? "WHERE id = ?" : "";
  const branchParams = branchFilter ? [branchFilter] : [];

  const [branches] = await db.query(
    `SELECT id, city_id
     FROM branches
     ${branchWhere}`,
    branchParams,
  );
  if (!Array.isArray(branches) || branches.length === 0) return;

  const branchIds = branches.map((row) => Number(row.id)).filter(Number.isInteger);
  const cityIds = [...new Set(branches.map((row) => Number(row.city_id)).filter(Number.isInteger))];
  if (branchIds.length === 0 || cityIds.length === 0) return;

  const [rows] = await db.query(
    `SELECT
       mi.id AS item_id,
       mic.city_id,
       COALESCE(vs.has_variants, 0) AS has_variants,
       COALESCE(ip.delivery_positive, 0) AS item_delivery_positive,
       COALESCE(ip.pickup_positive, 0) AS item_pickup_positive,
       COALESCE(vp.delivery_positive, 0) AS variant_delivery_positive,
       COALESCE(vp.pickup_positive, 0) AS variant_pickup_positive
     FROM menu_items mi
     JOIN menu_item_cities mic ON mic.item_id = mi.id AND mic.is_active = TRUE
     LEFT JOIN (
       SELECT item_id, 1 AS has_variants
       FROM item_variants
       WHERE is_active = TRUE
       GROUP BY item_id
     ) vs ON vs.item_id = mi.id
     LEFT JOIN (
       SELECT
         item_id,
         city_id,
         MAX(CASE WHEN fulfillment_type = 'delivery' AND price > 0 THEN 1 ELSE 0 END) AS delivery_positive,
         MAX(CASE WHEN fulfillment_type = 'pickup' AND price > 0 THEN 1 ELSE 0 END) AS pickup_positive
       FROM menu_item_prices
       WHERE city_id IN (${cityIds.map(() => "?").join(", ")})
       GROUP BY item_id, city_id
     ) ip ON ip.item_id = mi.id AND ip.city_id = mic.city_id
     LEFT JOIN (
       SELECT
         iv.item_id,
         mvp.city_id,
         MAX(CASE WHEN mvp.fulfillment_type = 'delivery' AND mvp.price > 0 THEN 1 ELSE 0 END) AS delivery_positive,
         MAX(CASE WHEN mvp.fulfillment_type = 'pickup' AND mvp.price > 0 THEN 1 ELSE 0 END) AS pickup_positive
       FROM item_variants iv
       JOIN menu_variant_prices mvp ON mvp.variant_id = iv.id
       WHERE iv.is_active = TRUE
         AND mvp.city_id IN (${cityIds.map(() => "?").join(", ")})
       GROUP BY iv.item_id, mvp.city_id
     ) vp ON vp.item_id = mi.id AND vp.city_id = mic.city_id
     WHERE mi.is_active = TRUE
       AND mic.city_id IN (${cityIds.map(() => "?").join(", ")})`,
    [...cityIds, ...cityIds, ...cityIds],
  );

  const noPriceByCity = new Map();
  for (const row of rows) {
    const cityId = Number(row.city_id);
    const itemId = Number(row.item_id);
    if (!Number.isInteger(cityId) || !Number.isInteger(itemId)) continue;
    const missingFulfillment = resolveNoPriceFulfillmentTypes(row);
    if (missingFulfillment.length === 0) continue;
    if (!noPriceByCity.has(cityId)) {
      noPriceByCity.set(cityId, new Map());
    }
    noPriceByCity.get(cityId).set(itemId, missingFulfillment);
  }

  const [existingRows] = await db.query(
    `SELECT id, branch_id, entity_id, reason, created_by, fulfillment_types
     FROM menu_stop_list
     WHERE entity_type = 'item'
       AND branch_id IN (${branchIds.map(() => "?").join(", ")})`,
    branchIds,
  );

  const existingByKey = new Map();
  for (const row of existingRows) {
    const key = `${row.branch_id}:${row.entity_id}`;
    existingByKey.set(key, row);
  }

  const desiredByKey = new Map();
  for (const branch of branches) {
    const branchIdValue = Number(branch.id);
    const branchCityId = Number(branch.city_id);
    if (!Number.isInteger(branchIdValue) || !Number.isInteger(branchCityId)) continue;
    const cityItems = noPriceByCity.get(branchCityId);
    if (!cityItems) continue;
    for (const [itemId, missingFulfillment] of cityItems.entries()) {
      const key = `${branchIdValue}:${itemId}`;
      const existing = existingByKey.get(key);
      if (existing && !(existing.created_by === null && String(existing.reason || "") === AUTO_NO_PRICE_REASON)) {
        continue;
      }
      desiredByKey.set(key, {
        branchId: branchIdValue,
        itemId,
        fulfillmentTypes: missingFulfillment,
      });
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (const row of existingRows) {
      const isAutoNoPrice = row.created_by === null && String(row.reason || "") === AUTO_NO_PRICE_REASON;
      if (!isAutoNoPrice) continue;
      const key = `${row.branch_id}:${row.entity_id}`;
      if (!desiredByKey.has(key)) {
        await connection.query("DELETE FROM menu_stop_list WHERE id = ?", [row.id]);
        continue;
      }

      const desired = desiredByKey.get(key);
      const currentFulfillment = normalizeFulfillmentTypes(row.fulfillment_types);
      const nextFulfillment = normalizeFulfillmentTypes(desired.fulfillmentTypes);
      if (JSON.stringify(currentFulfillment) === JSON.stringify(nextFulfillment)) {
        continue;
      }
      await connection.query(
        `UPDATE menu_stop_list
         SET fulfillment_types = ?
         WHERE id = ?`,
        [JSON.stringify(nextFulfillment), row.id],
      );
    }

    for (const [key, desired] of desiredByKey.entries()) {
      if (existingByKey.has(key)) continue;
      await connection.query(
        `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_by)
         VALUES (?, 'item', ?, ?, ?, 0, NULL, NULL)`,
        [desired.branchId, desired.itemId, JSON.stringify(desired.fulfillmentTypes), AUTO_NO_PRICE_REASON],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// GET /admin/tags - Получение всех тегов
export const getTags = async (req, res, next) => {
  try {
    const [tags] = await db.query(
      `SELECT id, name, icon, color, created_at, updated_at
       FROM tags
       ORDER BY name`,
    );

    res.json({ tags });
  } catch (error) {
    next(error);
  }
};

// POST /admin/tags - Создание тега
export const createTag = async (req, res, next) => {
  try {
    const { name, icon, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const [existing] = await db.query("SELECT id FROM tags WHERE name = ?", [name]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Tag with this name already exists" });
    }

    const [result] = await db.query(`INSERT INTO tags (name, icon, color) VALUES (?, ?, ?)`, [name, icon || null, color || null]);

    const [tag] = await db.query(
      `SELECT id, name, icon, color, created_at, updated_at
       FROM tags WHERE id = ?`,
      [result.insertId],
    );

    await invalidateAllMenuCache();

    res.status(201).json({ tag: tag[0] });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/tags/:id - Обновление тега
export const updateTag = async (req, res, next) => {
  try {
    const tagId = req.params.id;
    const { name, icon, color } = req.body;

    const [existing] = await db.query("SELECT id FROM tags WHERE id = ?", [tagId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Tag not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      const [duplicate] = await db.query("SELECT id FROM tags WHERE name = ? AND id != ?", [name, tagId]);
      if (duplicate.length > 0) {
        return res.status(400).json({ error: "Tag with this name already exists" });
      }
      updates.push("name = ?");
      values.push(name);
    }
    if (icon !== undefined) {
      updates.push("icon = ?");
      values.push(icon);
    }
    if (color !== undefined) {
      updates.push("color = ?");
      values.push(color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(tagId);
    await db.query(`UPDATE tags SET ${updates.join(", ")} WHERE id = ?`, values);

    const [tag] = await db.query(
      `SELECT id, name, icon, color, created_at, updated_at
       FROM tags WHERE id = ?`,
      [tagId],
    );

    await invalidateAllMenuCache();

    res.json({ tag: tag[0] });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/tags/:id - Удаление тега
export const deleteTag = async (req, res, next) => {
  try {
    const tagId = req.params.id;

    const [existing] = await db.query("SELECT id FROM tags WHERE id = ?", [tagId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Tag not found" });
    }

    await db.query("DELETE FROM tags WHERE id = ?", [tagId]);
    await invalidateAllMenuCache();

    res.json({ message: "Tag deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// POST /admin/items/:itemId/tags - Привязка тега к товару
export const addTagToItem = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { tag_id } = req.body;

    if (!tag_id) {
      return res.status(400).json({ error: "tag_id is required" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [tags] = await db.query("SELECT id FROM tags WHERE id = ?", [tag_id]);
    if (tags.length === 0) {
      return res.status(404).json({ error: "Tag not found" });
    }

    await db.query("INSERT IGNORE INTO menu_item_tags (item_id, tag_id) VALUES (?, ?)", [itemId, tag_id]);
    await invalidateAllMenuCache();

    res.status(201).json({ message: "Tag added to item successfully" });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/items/:itemId/tags/:tagId - Удаление тега от товара
export const removeTagFromItem = async (req, res, next) => {
  try {
    const { itemId, tagId } = req.params;

    await db.query("DELETE FROM menu_item_tags WHERE item_id = ? AND tag_id = ?", [itemId, tagId]);
    await invalidateAllMenuCache();

    res.json({ message: "Tag removed from item successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/tags - Получение тегов товара
export const getItemTags = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [tags] = await db.query(
      `SELECT t.id, t.name, t.icon, t.color
       FROM tags t
       JOIN menu_item_tags mit ON mit.tag_id = t.id
       WHERE mit.item_id = ?
       ORDER BY t.name`,
      [itemId],
    );

    res.json({ tags, tag_ids: tags.map((tag) => tag.id) });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/items/:itemId/tags - Массовое обновление тегов товара
export const updateItemTags = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { tag_ids } = req.body;

    if (!Array.isArray(tag_ids)) {
      return res.status(400).json({ error: "tag_ids must be an array" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query("DELETE FROM menu_item_tags WHERE item_id = ?", [itemId]);

      for (const tagId of tag_ids) {
        await connection.query("INSERT IGNORE INTO menu_item_tags (item_id, tag_id) VALUES (?, ?)", [itemId, tagId]);
      }

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ message: "Tags updated successfully" });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
};

// POST /admin/items/:itemId/categories - Привязка товара к категории
export const addItemToCategory = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { category_id, sort_order } = req.body;

    if (!category_id) {
      return res.status(400).json({ error: "category_id is required" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [categories] = await db.query("SELECT id FROM menu_categories WHERE id = ?", [category_id]);
    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    await db.query("INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order) VALUES (?, ?, ?)", [
      itemId,
      category_id,
      sort_order || 0,
    ]);

    await invalidateAllMenuCache();

    res.status(201).json({ message: "Item added to category successfully" });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/items/:itemId/categories/:categoryId - Удаление товара из категории
export const removeItemFromCategory = async (req, res, next) => {
  try {
    const { itemId, categoryId } = req.params;

    await db.query("DELETE FROM menu_item_categories WHERE item_id = ? AND category_id = ?", [itemId, categoryId]);
    await invalidateAllMenuCache();

    res.json({ message: "Item removed from category successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/categories - Получение категорий товара
export const getItemCategories = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [categories] = await db.query(
      `SELECT c.id, c.name, mic.sort_order
       FROM menu_categories c
       JOIN menu_item_categories mic ON mic.category_id = c.id
       WHERE mic.item_id = ?
       ORDER BY c.name`,
      [itemId],
    );

    res.json({ categories, category_ids: categories.map((category) => category.id) });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/items/:itemId/categories - Массовое обновление категорий товара
export const updateItemCategories = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { category_ids } = req.body;

    if (!Array.isArray(category_ids)) {
      return res.status(400).json({ error: "category_ids must be an array" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query("DELETE FROM menu_item_categories WHERE item_id = ?", [itemId]);

      for (const categoryId of category_ids) {
        await connection.query("INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order) VALUES (?, ?, 0)", [itemId, categoryId]);
      }

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ message: "Categories updated successfully" });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
};

// GET /admin/stop-list - Получение стоп-листа
export const getStopList = async (req, res, next) => {
  try {
    const { branch_id } = req.query;
    await syncAutoNoPriceStopList(branch_id);

    const params = [];
    const whereBranch = branch_id ? "WHERE msl.branch_id = ?" : "";
    if (branch_id) {
      params.push(branch_id);
    }

    const [stopList] = await db.query(
      `SELECT msl.id, msl.branch_id, msl.entity_type, msl.entity_id, msl.fulfillment_types,
              msl.reason, msl.auto_remove, msl.remove_at, msl.created_at, msl.created_by,
              COALESCE(NULLIF(CONCAT(au.first_name, ' ', au.last_name), ' '), au.email) as created_by_username,
              CASE 
                WHEN msl.entity_type = 'item' THEN mi.name
                WHEN msl.entity_type = 'variant' THEN CONCAT(mi2.name, ' - ', iv.name)
                WHEN msl.entity_type = 'modifier' THEN m.name
              END as entity_name
       FROM menu_stop_list msl
       LEFT JOIN admin_users au ON au.id = msl.created_by
       LEFT JOIN menu_items mi ON msl.entity_type = 'item' AND msl.entity_id = mi.id
       LEFT JOIN item_variants iv ON msl.entity_type = 'variant' AND msl.entity_id = iv.id
       LEFT JOIN menu_items mi2 ON iv.item_id = mi2.id
       LEFT JOIN modifiers m ON msl.entity_type = 'modifier' AND msl.entity_id = m.id
       ${whereBranch}
       ORDER BY msl.created_at DESC`,
      params,
    );

    res.json({ items: stopList });
  } catch (error) {
    next(error);
  }
};

// GET /admin/stop-list-reasons - Получение причин стоп-листа
export const getStopListReasons = async (req, res, next) => {
  try {
    const [reasons] = await db.query(
      `SELECT id, name, sort_order, is_active, created_at, updated_at
       FROM menu_stop_list_reasons
       ORDER BY sort_order, name`,
    );

    res.json({ reasons });
  } catch (error) {
    next(error);
  }
};

// POST /admin/stop-list-reasons - Создание причины стоп-листа
export const createStopListReason = async (req, res, next) => {
  try {
    const { name, sort_order, is_active } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const [result] = await db.query(
      `INSERT INTO menu_stop_list_reasons (name, sort_order, is_active)
       VALUES (?, ?, ?)`,
      [name, sort_order || 0, is_active !== undefined ? is_active : true],
    );

    const [newReason] = await db.query(
      `SELECT id, name, sort_order, is_active, created_at, updated_at
       FROM menu_stop_list_reasons WHERE id = ?`,
      [result.insertId],
    );

    res.status(201).json({ reason: newReason[0] });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/stop-list-reasons/:id - Обновление причины стоп-листа
export const updateStopListReason = async (req, res, next) => {
  try {
    const reasonId = req.params.id;
    const { name, sort_order, is_active } = req.body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      values.push(sort_order);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(reasonId);
    await db.query(`UPDATE menu_stop_list_reasons SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updated] = await db.query(
      `SELECT id, name, sort_order, is_active, created_at, updated_at
       FROM menu_stop_list_reasons WHERE id = ?`,
      [reasonId],
    );

    res.json({ reason: updated[0] });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/stop-list-reasons/:id - Удаление причины стоп-листа
export const deleteStopListReason = async (req, res, next) => {
  try {
    const reasonId = req.params.id;

    await db.query("DELETE FROM menu_stop_list_reasons WHERE id = ?", [reasonId]);

    res.json({ message: "Reason deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// POST /admin/stop-list - Добавление в стоп-лист
export const addToStopList = async (req, res, next) => {
  try {
    const { branch_id, entity_type, entity_id, reason, fulfillment_types, auto_remove, remove_at } = req.body;

    if (!branch_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: "branch_id, entity_type, and entity_id are required" });
    }

    if (!["item", "variant", "modifier"].includes(entity_type)) {
      return res.status(400).json({ error: "Invalid entity_type" });
    }

    const allowedFulfillment = ["delivery", "pickup"];
    const normalizedFulfillment = Array.isArray(fulfillment_types)
      ? Array.from(new Set(fulfillment_types.filter((type) => allowedFulfillment.includes(type))))
      : null;
    const isAllFulfillmentSelected =
      Array.isArray(normalizedFulfillment) &&
      normalizedFulfillment.length === allowedFulfillment.length &&
      allowedFulfillment.every((type) => normalizedFulfillment.includes(type));
    const stopListFulfillmentValue =
      normalizedFulfillment && normalizedFulfillment.length > 0 && !isAllFulfillmentSelected
        ? JSON.stringify(normalizedFulfillment)
        : null;

    const autoRemove = Boolean(auto_remove);
    const removeAtValue = autoRemove ? remove_at : null;
    const parsedRemoveAt = removeAtValue ? new Date(removeAtValue) : null;

    if (autoRemove && (!parsedRemoveAt || Number.isNaN(parsedRemoveAt.getTime()))) {
      return res.status(400).json({ error: "remove_at is required for auto_remove" });
    }

    const [branches] = await db.query("SELECT id FROM branches WHERE id = ?", [branch_id]);
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }

    // Валидация entity через whitelist
    const entityTableMap = {
      item: "menu_items",
      variant: "item_variants",
      modifier: "modifiers",
    };

    const entityTable = entityTableMap[entity_type];
    if (!entityTable) {
      return res.status(400).json({ error: "Invalid entity_type" });
    }

    const [entities] = await db.query(`SELECT id FROM ${entityTable} WHERE id = ?`, [entity_id]);
    if (entities.length === 0) {
      return res.status(404).json({ error: `${entity_type} not found` });
    }

    const [existingStop] = await db.query(
      `SELECT id
       FROM menu_stop_list
       WHERE branch_id = ?
         AND entity_type = ?
         AND entity_id = ?
       LIMIT 1`,
      [branch_id, entity_type, entity_id],
    );
    if (existingStop.length > 0) {
      return res.status(409).json({
        error: "Позиция уже находится в стоп-листе для выбранного филиала",
      });
    }

    const [insertResult] = await db.query(
      `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch_id,
        entity_type,
        entity_id,
        stopListFulfillmentValue,
        reason || null,
        autoRemove,
        parsedRemoveAt,
        req.user.id,
      ],
    );

    let iikoSyncMeta = { shouldSync: false, skipReason: "Режим iiko для меню не активен" };
    try {
      iikoSyncMeta = await syncStopListChangeToIiko({
        operation: "add",
        branchId: branch_id,
        entityType: entity_type,
        entityId: entity_id,
        createdBy: req.user.id,
        reason: reason || null,
      });
    } catch (syncError) {
      if (Number.isFinite(Number(insertResult?.insertId))) {
        await db.query("DELETE FROM menu_stop_list WHERE id = ?", [Number(insertResult.insertId)]);
      }
      return res.status(502).json({
        error: "Позиция добавлена локально, но не отправлена в стоп-лист iiko. Изменение отменено.",
        details: syncError?.message || "Не удалось синхронизировать стоп-лист с iiko",
      });
    }

    await invalidateAllMenuCache();

    res.status(201).json({
      message: "Added to stop list successfully",
      iiko: iikoSyncMeta,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/stop-list/:id - Удаление из стоп-листа
export const removeFromStopList = async (req, res, next) => {
  try {
    const stopListId = req.params.id;

    const [rows] = await db.query(
      `SELECT id, branch_id, entity_type, entity_id, created_by, reason
       FROM menu_stop_list
       WHERE id = ?
       LIMIT 1`,
      [stopListId],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: "Позиция стоп-листа не найдена" });
    }
    const row = rows[0];

    let iikoSyncMeta = { shouldSync: false, skipReason: "Режим iiko для меню не активен" };
    try {
      iikoSyncMeta = await syncStopListChangeToIiko({
        operation: "remove",
        branchId: row.branch_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdBy: row.created_by,
        reason: row.reason,
      });
    } catch (syncError) {
      return res.status(502).json({
        error: "Не удалось удалить позицию из стоп-листа iiko. Локальное удаление отменено.",
        details: syncError?.message || "Не удалось синхронизировать стоп-лист с iiko",
      });
    }

    await db.query("DELETE FROM menu_stop_list WHERE id = ?", [stopListId]);
    await invalidateAllMenuCache();

    res.json({
      message: "Removed from stop list successfully",
      iiko: iikoSyncMeta,
    });
  } catch (error) {
    next(error);
  }
};

// POST /admin/items/:itemId/disabled-modifiers - Отключение модификатора для товара
export const disableModifierForItem = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { modifier_id } = req.body;

    if (!modifier_id) {
      return res.status(400).json({ error: "modifier_id is required" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifier_id]);
    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    await db.query("INSERT IGNORE INTO menu_item_disabled_modifiers (item_id, modifier_id) VALUES (?, ?)", [itemId, modifier_id]);
    await invalidateAllMenuCache();

    res.status(201).json({ message: "Modifier disabled for item successfully" });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/items/:itemId/disabled-modifiers/:modifierId - Включение модификатора для товара
export const enableModifierForItem = async (req, res, next) => {
  try {
    const { itemId, modifierId } = req.params;

    await db.query("DELETE FROM menu_item_disabled_modifiers WHERE item_id = ? AND modifier_id = ?", [itemId, modifierId]);
    await invalidateAllMenuCache();

    res.json({ message: "Modifier enabled for item successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/disabled-modifiers - Получение отключенных модификаторов товара
export const getItemDisabledModifiers = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [modifiers] = await db.query(
      `SELECT m.id, m.name, m.price, mg.name as group_name
       FROM modifiers m
       JOIN menu_item_disabled_modifiers midm ON midm.modifier_id = m.id
       JOIN modifier_groups mg ON mg.id = m.group_id
       WHERE midm.item_id = ?
       ORDER BY mg.name, m.name`,
      [itemId],
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
};
