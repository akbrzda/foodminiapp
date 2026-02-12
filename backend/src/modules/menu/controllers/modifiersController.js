import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";

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
  } catch (error) {
    logger.error("Failed to invalidate all menu cache", { error });
  }
}

// GET /admin/modifier-groups - Получение всех групп модификаторов (админ)
export const getAdminModifierGroups = async (req, res, next) => {
  try {
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections, sort_order,
              is_active, created_at, updated_at
       FROM modifier_groups
       ORDER BY sort_order, name`,
      [],
    );

    for (const group of groups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active
         FROM modifiers
         WHERE group_id = ?
         ORDER BY sort_order, name`,
        [group.id],
      );
      group.modifiers = modifiers;
    }

    res.json({ modifier_groups: groups });
  } catch (error) {
    next(error);
  }
};

// POST /admin/modifier-groups - Создание группы модификаторов
export const createModifierGroup = async (req, res, next) => {
  try {
    const { name, type, is_required, is_global, min_selections, max_selections, sort_order, modifiers } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        error: "name and type are required",
      });
    }

    if (!["single", "multiple"].includes(type)) {
      return res.status(400).json({
        error: "type must be 'single' or 'multiple'",
      });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Создание группы модификаторов
      const [groupResult] = await connection.query(
        `INSERT INTO modifier_groups (name, type, is_required, is_global, min_selections, max_selections, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          type,
          is_required || false,
          is_global || false,
          min_selections !== undefined ? min_selections : is_required ? 1 : 0,
          max_selections !== undefined ? max_selections : type === "multiple" ? 10 : 1,
          Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
        ],
      );

      const groupId = groupResult.insertId;

      // Добавление модификаторов в группу
      if (modifiers && Array.isArray(modifiers) && modifiers.length > 0) {
        for (const modifier of modifiers) {
          await connection.query(
            `INSERT INTO modifiers (group_id, name, price, weight, weight_unit, image_url, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              groupId,
              modifier.name,
              modifier.price || 0,
              modifier.weight || null,
              modifier.weight_unit || null,
              modifier.image_url || null,
              modifier.sort_order || 0,
            ],
          );
        }
      }

      await connection.commit();

      const [newGroup] = await connection.query(
        `SELECT id, name, type, is_required, is_global, min_selections, max_selections, sort_order,
                is_active, created_at, updated_at
         FROM modifier_groups WHERE id = ?`,
        [groupId],
      );

      const [groupModifiers] = await connection.query(
        `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active
         FROM modifiers WHERE group_id = ?`,
        [groupId],
      );

      newGroup[0].modifiers = groupModifiers;

      await invalidateAllMenuCache();

      res.status(201).json({ modifier_group: newGroup[0] });
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

// PUT /admin/modifier-groups/:id - Обновление группы модификаторов
export const updateModifierGroup = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { name, type, is_required, is_global, min_selections, max_selections, sort_order, is_active } = req.body;

    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);
    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (type !== undefined) {
      if (!["single", "multiple"].includes(type)) {
        return res.status(400).json({ error: "type must be 'single' or 'multiple'" });
      }
      updates.push("type = ?");
      values.push(type);
    }
    if (is_required !== undefined) {
      updates.push("is_required = ?");
      values.push(is_required);
    }
    if (is_global !== undefined) {
      updates.push("is_global = ?");
      values.push(is_global);
    }
    if (min_selections !== undefined) {
      updates.push("min_selections = ?");
      values.push(min_selections);
    }
    if (max_selections !== undefined) {
      updates.push("max_selections = ?");
      values.push(max_selections);
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      values.push(Number(sort_order) || 0);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(groupId);
    await db.query(`UPDATE modifier_groups SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedGroup] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections, sort_order,
              is_active, created_at, updated_at
       FROM modifier_groups WHERE id = ?`,
      [groupId],
    );

    await invalidateAllMenuCache();

    res.json({ modifier_group: updatedGroup[0] });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/modifier-groups/:id - Удаление группы модификаторов
export const deleteModifierGroup = async (req, res, next) => {
  try {
    const groupId = req.params.id;

    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);
    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    // Проверка использования группы в товарах
    const [items] = await db.query("SELECT COUNT(*) as count FROM item_modifier_groups WHERE modifier_group_id = ?", [groupId]);
    if (items[0].count > 0) {
      return res.status(400).json({
        error: "Cannot delete modifier group that is used in menu items. Remove associations first.",
      });
    }

    await db.query("DELETE FROM modifier_groups WHERE id = ?", [groupId]);
    await invalidateAllMenuCache();

    res.json({ message: "Modifier group deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// POST /admin/items/:itemId/modifier-groups - Привязка группы модификаторов к товару
export const addModifierGroupToItem = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { modifier_group_id } = req.body;

    if (!modifier_group_id) {
      return res.status(400).json({ error: "modifier_group_id is required" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }

    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [modifier_group_id]);
    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    const [existing] = await db.query("SELECT id FROM item_modifier_groups WHERE item_id = ? AND modifier_group_id = ?", [itemId, modifier_group_id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Modifier group is already associated with this item" });
    }

    await db.query("INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES (?, ?)", [itemId, modifier_group_id]);
    await invalidateAllMenuCache();

    res.status(201).json({ message: "Modifier group associated with item successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/modifier-groups - Получение групп модификаторов товара
export const getItemAdminModifierGroups = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }

    const [groups] = await db.query(
      `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_global, mg.min_selections, mg.max_selections, mg.sort_order
       FROM modifier_groups mg
       JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
       WHERE img.item_id = ?
       ORDER BY mg.sort_order, mg.name`,
      [itemId],
    );

    res.json({ modifier_groups: groups });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/items/:itemId/modifier-groups/:groupId - Удаление группы модификаторов от товара
export const removeModifierGroupFromItem = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const groupId = req.params.groupId;

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }

    await db.query("DELETE FROM item_modifier_groups WHERE item_id = ? AND modifier_group_id = ?", [itemId, groupId]);
    await invalidateAllMenuCache();

    res.json({ message: "Modifier group unassociated from item successfully" });
  } catch (error) {
    next(error);
  }
};

// POST /admin/modifier-groups/:groupId/modifiers - Создание модификатора в группе
export const createModifier = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const { name, price, weight, weight_unit, image_url, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "name is required",
      });
    }

    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);
    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    const [result] = await db.query(
      `INSERT INTO modifiers (group_id, name, price, weight, weight_unit, image_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [groupId, name, price || 0, weight || null, weight_unit || null, image_url || null, sort_order || 0],
    );

    const [newModifier] = await db.query(
      `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active, created_at, updated_at
       FROM modifiers WHERE id = ?`,
      [result.insertId],
    );

    await invalidateAllMenuCache();

    res.status(201).json({ modifier: newModifier[0] });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/modifiers/:id - Обновление модификатора
export const updateModifier = async (req, res, next) => {
  try {
    const modifierId = req.params.id;
    const { name, price, weight, weight_unit, image_url, sort_order, is_active } = req.body;

    const normalizedWeightUnit = weight_unit === "" ? null : weight_unit;
    const normalizedImageUrl = image_url === "" ? null : image_url;

    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifierId]);
    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (price !== undefined) {
      updates.push("price = ?");
      values.push(price);
    }
    if (weight !== undefined) {
      updates.push("weight = ?");
      values.push(weight);
    }
    if (weight_unit !== undefined) {
      updates.push("weight_unit = ?");
      values.push(normalizedWeightUnit);
    }
    if (image_url !== undefined) {
      updates.push("image_url = ?");
      values.push(normalizedImageUrl);
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

    values.push(modifierId);
    await db.query(`UPDATE modifiers SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedModifier] = await db.query(
      `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active, created_at, updated_at
       FROM modifiers WHERE id = ?`,
      [modifierId],
    );

    await invalidateAllMenuCache();

    res.json({ modifier: updatedModifier[0] });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/modifiers/:id - Удаление модификатора
export const deleteModifier = async (req, res, next) => {
  try {
    const modifierId = req.params.id;

    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifierId]);
    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    await db.query("DELETE FROM modifiers WHERE id = ?", [modifierId]);
    await invalidateAllMenuCache();

    res.json({ message: "Modifier deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/modifiers - Получение всех модификаторов (с фильтрацией по городам менеджера)
export const getAdminModifiers = async (req, res, next) => {
  try {
    const params = [];
    let whereClause = "";

    if (req.user.role === "manager" && Array.isArray(req.user.cities) && req.user.cities.length > 0) {
      whereClause = "WHERE mic.city_id IN (?)";
      params.push(req.user.cities);
    }

    const [modifiers] = await db.query(
      `SELECT DISTINCT m.id, m.name
       FROM modifiers m
       JOIN modifier_groups mg ON mg.id = m.group_id
       LEFT JOIN item_modifier_groups img ON img.modifier_group_id = mg.id
       LEFT JOIN menu_items mi ON mi.id = img.item_id
       LEFT JOIN menu_item_cities mic ON mic.item_id = mi.id
       ${whereClause}
       ORDER BY m.name`,
      params,
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
};

// GET /admin/modifiers/:modifierId/prices - Получение цен модификатора по городам
export const getModifierPrices = async (req, res, next) => {
  try {
    const modifierId = req.params.modifierId;

    const [prices] = await db.query(
      `SELECT mmp.id, mmp.city_id, c.name as city_name, mmp.price, mmp.is_active, mmp.created_at, mmp.updated_at
       FROM menu_modifier_prices mmp
       LEFT JOIN cities c ON c.id = mmp.city_id
       WHERE mmp.modifier_id = ?
       ORDER BY c.name`,
      [modifierId],
    );

    res.json({ prices });
  } catch (error) {
    next(error);
  }
};

// POST /admin/modifiers/:modifierId/prices - Добавление/обновление цены модификатора для города
export const createModifierPrice = async (req, res, next) => {
  try {
    const modifierId = req.params.modifierId;
    const { city_id, price, is_active } = req.body;

    if (!city_id || price === undefined) {
      return res.status(400).json({ error: "city_id and price are required" });
    }

    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifierId]);
    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }

    if (req.user.role === "manager" && !req.user.cities.includes(parseInt(city_id))) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }

    await db.query(
      `INSERT INTO menu_modifier_prices (modifier_id, city_id, price, is_active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), is_active = VALUES(is_active)`,
      [modifierId, city_id, price, is_active !== undefined ? is_active : true],
    );

    await invalidateAllMenuCache();

    res.json({ message: "Modifier price saved successfully" });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/modifiers/:modifierId/cities - Массовое обновление городов модификатора
export const updateModifierCities = async (req, res, next) => {
  try {
    const modifierId = req.params.modifierId;
    const { city_ids } = req.body;

    if (!Array.isArray(city_ids)) {
      return res.status(400).json({ error: "city_ids must be an array" });
    }

    const [modifiers] = await db.query("SELECT id, price FROM modifiers WHERE id = ?", [modifierId]);
    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    if (!managerHasCityAccess(req.user, city_ids)) {
      return res.status(403).json({ error: "You do not have access to these cities" });
    }

    const basePrice = modifiers[0].price ?? 0;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Деактивируем все города
      await connection.query("UPDATE menu_modifier_prices SET is_active = FALSE WHERE modifier_id = ?", [modifierId]);

      // Активируем нужные города
      for (const cityId of city_ids) {
        await connection.query(
          `INSERT INTO menu_modifier_prices (modifier_id, city_id, price, is_active)
           VALUES (?, ?, ?, TRUE)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [modifierId, cityId, basePrice],
        );
      }

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ message: "Modifier cities updated successfully" });
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
