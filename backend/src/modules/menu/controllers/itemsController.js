import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";
import { getIntegrationSettings } from "../../integrations/services/integrationConfigService.js";

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

async function invalidateMenuCacheByCity(cityId) {
  if (!cityId) return;
  try {
    const redis = (await import("../../../config/redis.js")).default;
    const keys = await redis.keys(`menu:city:${cityId}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    logger.error("Failed to invalidate menu cache", { error });
  }
}

async function seedModifierVariantPricesForNewVariant(connection, itemId, variantId, variantName) {
  if (!itemId || !variantId || !variantName) return;

  const [modifiers] = await connection.query(
    `SELECT DISTINCT m.id
     FROM item_modifier_groups img
     JOIN modifier_groups mg ON mg.id = img.modifier_group_id
     JOIN modifiers m ON m.group_id = mg.id
     WHERE img.item_id = ?
       AND mg.is_active = TRUE
       AND m.is_active = TRUE`,
    [itemId],
  );
  if (!Array.isArray(modifiers) || modifiers.length === 0) return;

  for (const modifier of modifiers) {
    const modifierId = Number(modifier?.id);
    if (!Number.isFinite(modifierId)) continue;

    const [templateRows] = await connection.query(
      `SELECT mvp.price, mvp.weight, mvp.weight_unit
       FROM menu_modifier_variant_prices mvp
       JOIN item_variants iv ON iv.id = mvp.variant_id
       WHERE mvp.modifier_id = ?
         AND LOWER(TRIM(iv.name)) = LOWER(TRIM(?))
       ORDER BY mvp.updated_at DESC, mvp.id DESC
       LIMIT 1`,
      [modifierId, variantName],
    );
    if (!Array.isArray(templateRows) || templateRows.length === 0) continue;

    const template = templateRows[0];
    await connection.query(
      `INSERT INTO menu_modifier_variant_prices (modifier_id, variant_id, price, weight, weight_unit)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), weight = VALUES(weight), weight_unit = VALUES(weight_unit)`,
      [modifierId, variantId, template.price, template.weight ?? null, template.weight_unit ?? null],
    );
  }
}

async function seedModifierVariantPricesForItem(connection, itemId) {
  if (!itemId) return;

  const [itemVariants] = await connection.query(
    `SELECT id, name
     FROM item_variants
     WHERE item_id = ?`,
    [itemId],
  );
  if (!Array.isArray(itemVariants) || itemVariants.length === 0) return;

  for (const variant of itemVariants) {
    await seedModifierVariantPricesForNewVariant(connection, itemId, variant.id, variant.name);
  }
}

// POST /admin/items - Создание товара
export const createItem = async (req, res, next) => {
  try {
    const {
      name,
      description,
      composition,
      price,
      image_url,
      weight_value,
      weight_unit,
      calories_per_100g,
      proteins_per_100g,
      fats_per_100g,
      carbs_per_100g,
      calories_per_serving,
      proteins_per_serving,
      fats_per_serving,
      carbs_per_serving,
      sort_order,
      is_active,
      category_ids,
      tag_ids,
      city_ids,
      prices,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "name is required",
      });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Создание товара
      const [result] = await connection.query(
        `INSERT INTO menu_items 
         (name, description, composition, price, image_url, weight_value, weight_unit, 
          calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
          calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
          sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description || null,
          composition || null,
          price !== undefined ? price : 0,
          image_url || null,
          weight_value || null,
          weight_unit || "g",
          calories_per_100g || null,
          proteins_per_100g || null,
          fats_per_100g || null,
          carbs_per_100g || null,
          calories_per_serving || null,
          proteins_per_serving || null,
          fats_per_serving || null,
          carbs_per_serving || null,
          sort_order || 0,
          is_active !== undefined ? is_active : true,
        ],
      );

      const itemId = result.insertId;

      // Привязка к категориям
      if (Array.isArray(category_ids)) {
        for (const categoryId of category_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order) VALUES (?, ?, 0)", [itemId, categoryId]);
        }
      }

      // Привязка к тегам
      if (Array.isArray(tag_ids)) {
        for (const tagId of tag_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_tags (item_id, tag_id) VALUES (?, ?)", [itemId, tagId]);
        }
      }

      // Привязка к городам
      if (Array.isArray(city_ids)) {
        for (const cityId of city_ids) {
          await connection.query(
            `INSERT INTO menu_item_cities (item_id, city_id, is_active)
             VALUES (?, ?, TRUE)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [itemId, cityId],
          );
        }
      }

      // Добавление цен
      if (Array.isArray(prices)) {
        for (const priceItem of prices) {
          if (!priceItem.fulfillment_type || priceItem.price === undefined || priceItem.city_id === undefined || priceItem.city_id === null) continue;
          await connection.query(
            `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [itemId, priceItem.city_id, priceItem.fulfillment_type, priceItem.price],
          );
        }
      }

      const [newItem] = await connection.query(
        `SELECT id, name, description, composition, image_url, 
                price,
                weight_value, weight_unit, 
                calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
                calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
                sort_order, is_active, 
                created_at, updated_at
         FROM menu_items WHERE id = ?`,
        [itemId],
      );

      await connection.commit();
      await invalidateAllMenuCache();

      res.status(201).json({ item: newItem[0] });
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

// GET /admin/items - Получение всех товаров
export const getAdminItems = async (req, res, next) => {
  try {
    const integration = await getIntegrationSettings();
    const onlyIiko = integration.iikoEnabled;

    let query = `
      SELECT 
        mi.id, 
        mi.name, 
        mi.description, 
        mi.composition,
        mi.image_url, 
        mi.price as legacy_price,
        mi.weight_value, 
        mi.weight_unit,
        mi.calories_per_100g,
        mi.proteins_per_100g,
        mi.fats_per_100g,
        mi.carbs_per_100g,
        mi.calories_per_serving,
        mi.proteins_per_serving,
        mi.fats_per_serving,
        mi.carbs_per_serving,
        mi.sort_order, 
        mi.is_active,
        mi.created_at, 
        mi.updated_at
      FROM menu_items mi
      ${onlyIiko ? "WHERE mi.iiko_item_id IS NOT NULL" : ""}
      ORDER BY mi.sort_order, mi.name
    `;

    const [items] = await db.query(query);

    // Получение категорий и базовых цен для каждого товара
    for (const item of items) {
      const [categories] = await db.query(
        `SELECT mc.id, mc.name
         FROM menu_categories mc
         JOIN menu_item_categories mic ON mc.id = mic.category_id
         WHERE mic.item_id = ?
         ORDER BY mic.sort_order`,
        [item.id],
      );
      item.categories = categories;

      // Показываем минимальную доступную цену позиции среди всех источников.
      const [minPriceRows] = await db.query(
        `SELECT MIN(src.price) AS min_price
         FROM (
           SELECT mvp.price
           FROM item_variants iv
           JOIN menu_variant_prices mvp ON mvp.variant_id = iv.id
           WHERE iv.item_id = ?

           UNION ALL

           SELECT iv.price
           FROM item_variants iv
           WHERE iv.item_id = ?

           UNION ALL

           SELECT mip.price
           FROM menu_item_prices mip
           WHERE mip.item_id = ?

           UNION ALL

           SELECT mi.price
           FROM menu_items mi
           WHERE mi.id = ?
         ) src`,
        [item.id, item.id, item.id, item.id],
      );

      item.base_price = minPriceRows[0]?.min_price ?? item.legacy_price ?? null;
      delete item.legacy_price;
    }

    res.json({ items });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:id - Получение одного товара (админ)
export const getAdminItemById = async (req, res, next) => {
  try {
    const itemId = req.params.id;

    const [items] = await db.query(
      `SELECT 
        mi.id, 
        mi.name, 
        mi.description, 
        mi.composition,
        mi.price,
        mi.image_url, 
        mi.weight_value, 
        mi.weight_unit,
        mi.calories_per_100g,
        mi.proteins_per_100g,
        mi.fats_per_100g,
        mi.carbs_per_100g,
        mi.calories_per_serving,
        mi.proteins_per_serving,
        mi.fats_per_serving,
        mi.carbs_per_serving,
        mi.sort_order, 
        mi.is_active,
        mi.created_at, 
        mi.updated_at
      FROM menu_items mi
      WHERE mi.id = ?`,
      [itemId],
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ item: items[0] });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/items/:id - Обновление товара
export const updateItem = async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const {
      name,
      description,
      composition,
      price,
      image_url,
      weight_value,
      weight_unit,
      calories_per_100g,
      proteins_per_100g,
      fats_per_100g,
      carbs_per_100g,
      calories_per_serving,
      proteins_per_serving,
      fats_per_serving,
      carbs_per_serving,
      sort_order,
      is_active,
      category_ids,
      tag_ids,
      city_ids,
      prices,
    } = req.body;

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (composition !== undefined) {
      updates.push("composition = ?");
      values.push(composition);
    }
    if (price !== undefined) {
      updates.push("price = ?");
      values.push(price);
    }
    if (image_url !== undefined) {
      updates.push("image_url = ?");
      values.push(image_url);
    }
    if (weight_value !== undefined) {
      updates.push("weight_value = ?");
      values.push(weight_value);
    }
    if (weight_unit !== undefined) {
      updates.push("weight_unit = ?");
      values.push(weight_unit);
    }
    if (calories_per_100g !== undefined) {
      updates.push("calories_per_100g = ?");
      values.push(calories_per_100g);
    }
    if (proteins_per_100g !== undefined) {
      updates.push("proteins_per_100g = ?");
      values.push(proteins_per_100g);
    }
    if (fats_per_100g !== undefined) {
      updates.push("fats_per_100g = ?");
      values.push(fats_per_100g);
    }
    if (carbs_per_100g !== undefined) {
      updates.push("carbs_per_100g = ?");
      values.push(carbs_per_100g);
    }
    if (calories_per_serving !== undefined) {
      updates.push("calories_per_serving = ?");
      values.push(calories_per_serving);
    }
    if (proteins_per_serving !== undefined) {
      updates.push("proteins_per_serving = ?");
      values.push(proteins_per_serving);
    }
    if (fats_per_serving !== undefined) {
      updates.push("fats_per_serving = ?");
      values.push(fats_per_serving);
    }
    if (carbs_per_serving !== undefined) {
      updates.push("carbs_per_serving = ?");
      values.push(carbs_per_serving);
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

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      values.push(itemId);
      await connection.query(`UPDATE menu_items SET ${updates.join(", ")} WHERE id = ?`, values);

      // Обновление категорий
      if (Array.isArray(category_ids)) {
        await connection.query("DELETE FROM menu_item_categories WHERE item_id = ?", [itemId]);
        for (const categoryId of category_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order) VALUES (?, ?, 0)", [itemId, categoryId]);
        }
      }

      // Обновление тегов
      if (Array.isArray(tag_ids)) {
        await connection.query("DELETE FROM menu_item_tags WHERE item_id = ?", [itemId]);
        for (const tagId of tag_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_tags (item_id, tag_id) VALUES (?, ?)", [itemId, tagId]);
        }
      }

      // Обновление городов
      if (Array.isArray(city_ids)) {
        await connection.query("DELETE FROM menu_item_cities WHERE item_id = ?", [itemId]);
        for (const cityId of city_ids) {
          await connection.query(
            `INSERT INTO menu_item_cities (item_id, city_id, is_active)
             VALUES (?, ?, TRUE)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [itemId, cityId],
          );
        }
      }

      // Обновление цен
      if (Array.isArray(prices)) {
        for (const priceItem of prices) {
          if (!priceItem.fulfillment_type || priceItem.price === undefined || priceItem.city_id === undefined || priceItem.city_id === null) continue;
          await connection.query(
            `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [itemId, priceItem.city_id, priceItem.fulfillment_type, priceItem.price],
          );
        }
      }

      const [updatedItem] = await connection.query(
        `SELECT id, name, description, composition, image_url, 
                price,
                weight_value, weight_unit, 
                calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
                calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
                sort_order, is_active, 
                created_at, updated_at
         FROM menu_items WHERE id = ?`,
        [itemId],
      );

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ item: updatedItem[0] });
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

// DELETE /admin/items/:id - Удаление товара
export const deleteItem = async (req, res, next) => {
  try {
    const itemId = req.params.id;

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({
        error: "You do not have access to this item",
      });
    }

    await db.query("DELETE FROM menu_items WHERE id = ?", [itemId]);
    await invalidateAllMenuCache();

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/modifiers - Получение групп модификаторов товара
export const getItemModifierGroups = async (req, res, next) => {
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

    const [rows] = await db.query(
      `SELECT modifier_group_id
       FROM item_modifier_groups
       WHERE item_id = ?`,
      [itemId],
    );

    const modifierGroupIds = rows.map((row) => row.modifier_group_id);

    res.json({ modifier_group_ids: modifierGroupIds });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/items/:itemId/modifiers - Обновление групп модификаторов товара
export const updateItemModifierGroups = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { modifier_group_ids } = req.body;

    if (!Array.isArray(modifier_group_ids)) {
      return res.status(400).json({ error: "modifier_group_ids must be an array" });
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

      await connection.query("DELETE FROM item_modifier_groups WHERE item_id = ?", [itemId]);

      for (const groupId of modifier_group_ids) {
        await connection.query("INSERT IGNORE INTO item_modifier_groups (item_id, modifier_group_id) VALUES (?, ?)", [itemId, groupId]);
      }

      // Восстанавливаем недостающие цены модификаторов по вариантам
      // по шаблону одинаковых имен вариантов из уже настроенных блюд.
      await seedModifierVariantPricesForItem(connection, itemId);

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ message: "Modifier groups updated successfully" });
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

// GET /admin/items/:itemId/variants - Получение вариантов товара (админ)
export const getAdminItemVariants = async (req, res, next) => {
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

    const [variants] = await db.query(
      `SELECT id, item_id, name, price, weight_value, weight_unit,
              calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
              calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
              image_url, sort_order, is_active, created_at, updated_at
       FROM item_variants
       WHERE item_id = ?
       ORDER BY sort_order, name`,
      [itemId],
    );

    res.json({ variants });
  } catch (error) {
    next(error);
  }
};

// POST /admin/items/:itemId/variants - Создание варианта товара
export const createItemVariant = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const {
      name,
      price,
      weight_value,
      weight_unit,
      calories_per_100g,
      proteins_per_100g,
      fats_per_100g,
      carbs_per_100g,
      calories_per_serving,
      proteins_per_serving,
      fats_per_serving,
      carbs_per_serving,
      image_url,
      sort_order,
      prices,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        error: "name and price are required",
      });
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

      const [result] = await connection.query(
        `INSERT INTO item_variants (
           item_id, name, price, weight_value, weight_unit,
           calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
           calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
           image_url, sort_order
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          name,
          price,
          weight_value || null,
          weight_unit || null,
          calories_per_100g || null,
          proteins_per_100g || null,
          fats_per_100g || null,
          carbs_per_100g || null,
          calories_per_serving || null,
          proteins_per_serving || null,
          fats_per_serving || null,
          carbs_per_serving || null,
          image_url || null,
          sort_order || 0,
        ],
      );

      await seedModifierVariantPricesForNewVariant(connection, itemId, result.insertId, name);

      // Добавление цен варианта
      if (Array.isArray(prices) && prices.length > 0) {
        for (const priceItem of prices) {
          if (!priceItem.fulfillment_type || priceItem.price === undefined || priceItem.city_id === undefined || priceItem.city_id === null) continue;
          await connection.query(
            `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [result.insertId, priceItem.city_id, priceItem.fulfillment_type, priceItem.price],
          );
        }
      }

      const [newVariant] = await connection.query(
        `SELECT id, item_id, name, price, weight_value, weight_unit,
                calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
                calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
                image_url, sort_order, is_active, created_at, updated_at
         FROM item_variants WHERE id = ?`,
        [result.insertId],
      );

      await connection.commit();
      await invalidateAllMenuCache();

      res.status(201).json({ variant: newVariant[0] });
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

// PUT /admin/items/:itemId/variants - Массовое обновление вариантов товара
export const updateItemVariants = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { variants } = req.body;

    if (!Array.isArray(variants)) {
      return res.status(400).json({ error: "variants must be an array" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemCityIds = await getItemCityIds(itemId);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }

    const [existingRows] = await db.query("SELECT id FROM item_variants WHERE item_id = ?", [itemId]);
    const existingIds = new Set(existingRows.map((row) => row.id));
    const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id));

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const variant of variants) {
        const payload = {
          name: variant.name,
          price: variant.price,
          weight_value: variant.weight_value || null,
          weight_unit: variant.weight_unit || null,
          calories_per_100g: variant.calories_per_100g || null,
          proteins_per_100g: variant.proteins_per_100g || null,
          fats_per_100g: variant.fats_per_100g || null,
          carbs_per_100g: variant.carbs_per_100g || null,
          calories_per_serving: variant.calories_per_serving || null,
          proteins_per_serving: variant.proteins_per_serving || null,
          fats_per_serving: variant.fats_per_serving || null,
          carbs_per_serving: variant.carbs_per_serving || null,
          image_url: variant.image_url || null,
          sort_order: variant.sort_order || 0,
          is_active: variant.is_active !== undefined ? variant.is_active : true,
        };

        if (variant.id && existingIds.has(variant.id)) {
          // Обновление существующего варианта
          await connection.query(
            `UPDATE item_variants
             SET name = ?, price = ?, weight_value = ?, weight_unit = ?,
                 calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
                 calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?,
                 image_url = ?, sort_order = ?, is_active = ?
             WHERE id = ? AND item_id = ?`,
            [
              payload.name,
              payload.price,
              payload.weight_value,
              payload.weight_unit,
              payload.calories_per_100g,
              payload.proteins_per_100g,
              payload.fats_per_100g,
              payload.carbs_per_100g,
              payload.calories_per_serving,
              payload.proteins_per_serving,
              payload.fats_per_serving,
              payload.carbs_per_serving,
              payload.image_url,
              payload.sort_order,
              payload.is_active,
              variant.id,
              itemId,
            ],
          );
        } else {
          // Создание нового варианта
          const [insertResult] = await connection.query(
            `INSERT INTO item_variants (
               item_id, name, price, weight_value, weight_unit,
               calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
               calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
               image_url, sort_order, is_active
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              itemId,
              payload.name,
              payload.price,
              payload.weight_value,
              payload.weight_unit,
              payload.calories_per_100g,
              payload.proteins_per_100g,
              payload.fats_per_100g,
              payload.carbs_per_100g,
              payload.calories_per_serving,
              payload.proteins_per_serving,
              payload.fats_per_serving,
              payload.carbs_per_serving,
              payload.image_url,
              payload.sort_order,
              payload.is_active,
            ],
          );
          variant.id = insertResult.insertId;
          await seedModifierVariantPricesForNewVariant(connection, itemId, variant.id, payload.name);
        }

        // Обновление цен варианта
        if (Array.isArray(variant.prices) && variant.prices.length > 0) {
          for (const priceItem of variant.prices) {
            if (!priceItem.fulfillment_type || priceItem.price === undefined || priceItem.city_id === undefined || priceItem.city_id === null) continue;
            await connection.query(
              `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE price = VALUES(price)`,
              [variant.id, priceItem.city_id, priceItem.fulfillment_type, priceItem.price],
            );
          }
        }
      }

      // Удаление вариантов, которых нет в запросе
      for (const existingId of existingIds) {
        if (!incomingIds.has(existingId)) {
          await connection.query("DELETE FROM item_variants WHERE id = ? AND item_id = ?", [existingId, itemId]);
        }
      }

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ message: "Variants updated successfully" });
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

// POST /admin/items/:itemId/cities - Добавление города к товару
export const addItemCity = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { city_id, is_active } = req.body;

    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }

    if (req.user.role === "manager" && !req.user.cities.includes(parseInt(city_id))) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }

    await db.query(
      `INSERT INTO menu_item_cities (item_id, city_id, is_active)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
      [itemId, city_id, is_active !== undefined ? is_active : true],
    );

    await invalidateMenuCacheByCity(city_id);

    res.json({ message: "Item city availability updated successfully" });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/items/:itemId/cities/:cityId - Обновление доступности товара в городе
export const updateItemCity = async (req, res, next) => {
  try {
    const { itemId, cityId } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      return res.status(400).json({ error: "is_active is required" });
    }

    await db.query(
      `UPDATE menu_item_cities 
       SET is_active = ?
       WHERE item_id = ? AND city_id = ?`,
      [is_active, itemId, cityId],
    );

    await invalidateMenuCacheByCity(cityId);

    res.json({ message: "Item availability updated successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/cities - Получение городов товара
export const getItemCities = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [cities] = await db.query(
      `SELECT mic.id, mic.city_id, c.name as city_name, mic.is_active, mic.created_at, mic.updated_at
       FROM menu_item_cities mic
       JOIN cities c ON c.id = mic.city_id
       WHERE mic.item_id = ?
       ORDER BY c.name`,
      [itemId],
    );

    res.json({ cities, city_ids: cities.filter((city) => city.is_active).map((city) => city.city_id) });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/items/:itemId/cities - Массовое обновление городов товара
export const updateItemCities = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { city_ids } = req.body;

    if (!Array.isArray(city_ids)) {
      return res.status(400).json({ error: "city_ids must be an array" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!managerHasCityAccess(req.user, city_ids)) {
      return res.status(403).json({ error: "You do not have access to these cities" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Помечаем все города как неактивные
      await connection.query("UPDATE menu_item_cities SET is_active = FALSE WHERE item_id = ?", [itemId]);

      // Активируем нужные города
      for (const cityId of city_ids) {
        await connection.query(
          `INSERT INTO menu_item_cities (item_id, city_id, is_active)
           VALUES (?, ?, TRUE)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [itemId, cityId],
        );
      }

      await connection.commit();
      await invalidateAllMenuCache();

      res.json({ message: "Item cities updated successfully" });
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
