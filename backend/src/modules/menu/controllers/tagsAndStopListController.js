import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";

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
    const keys = await redis.keys("menu:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
    notifyMenuUpdated({ source: "admin", scope: "all" });
  } catch (error) {
    logger.error("Failed to invalidate all menu cache", { error });
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

    await db.query(
      `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch_id,
        entity_type,
        entity_id,
        normalizedFulfillment && normalizedFulfillment.length > 0 ? JSON.stringify(normalizedFulfillment) : null,
        reason || null,
        autoRemove,
        parsedRemoveAt,
        req.user.id,
      ],
    );

    await invalidateAllMenuCache();

    res.status(201).json({ message: "Added to stop list successfully" });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/stop-list/:id - Удаление из стоп-листа
export const removeFromStopList = async (req, res, next) => {
  try {
    const stopListId = req.params.id;

    await db.query("DELETE FROM menu_stop_list WHERE id = ?", [stopListId]);
    await invalidateAllMenuCache();

    res.json({ message: "Removed from stop list successfully" });
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
