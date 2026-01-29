import express from "express";
import db from "../config/database.js";
import redis from "../config/redis.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";
const router = express.Router();
const MENU_CACHE_TTL = 300;
async function getMenuCache(cacheKey) {
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error("Failed to read menu cache:", error);
    return null;
  }
}
async function setMenuCache(cacheKey, payload) {
  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", MENU_CACHE_TTL);
  } catch (error) {
    console.error("Failed to write menu cache:", error);
  }
}
async function invalidateMenuCacheByCity(cityId) {
  if (!cityId) return;
  try {
    const keys = await redis.keys(`menu:city:${cityId}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error("Failed to invalidate menu cache:", error);
  }
}
async function invalidateAllMenuCache() {
  try {
    const keys = await redis.keys("menu:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error("Failed to invalidate all menu cache:", error);
  }
}
async function getItemCityIds(itemId) {
  const [rows] = await db.query("SELECT city_id FROM menu_item_cities WHERE item_id = ?", [itemId]);
  return rows.map((row) => row.city_id);
}
async function getCategoryCityIds(categoryId) {
  const [rows] = await db.query("SELECT city_id FROM menu_category_cities WHERE category_id = ?", [categoryId]);
  return rows.map((row) => row.city_id);
}
function managerHasCityAccess(user, cityIds) {
  if (user.role !== "manager") return true;
  if (!Array.isArray(user.cities) || user.cities.length === 0) return false;
  if (!Array.isArray(cityIds) || cityIds.length === 0) return true;
  return cityIds.some((cityId) => user.cities.includes(cityId));
}
router.get("/", async (req, res, next) => {
  try {
    const { city_id, branch_id, fulfillment_type } = req.query;
    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }
    const cacheKey =
      branch_id && fulfillment_type ? `menu:city:${city_id}:branch:${branch_id}:fulfillment:${fulfillment_type}` : `menu:city:${city_id}`;
    const cachedMenu = await getMenuCache(cacheKey);
    if (cachedMenu) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cachedMenu);
    }
    const [categories] = await db.query(
      `SELECT DISTINCT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order, mc.is_active
       FROM menu_categories mc
       JOIN menu_category_cities mcc ON mcc.category_id = mc.id
       WHERE mcc.city_id = ? 
         AND mc.is_active = TRUE 
         AND mcc.is_active = TRUE
       ORDER BY mc.sort_order, mc.name`,
      [city_id],
    );
    const filteredCategories = [];
    for (const category of categories) {
      const [items] = await db.query(
        `SELECT DISTINCT mi.id, mi.name, mi.description, mi.composition, mi.image_url, 
                mi.weight_value, mi.weight_unit, mi.calories, mi.sort_order, mi.is_active,
                mic.sort_order AS category_sort_order,
                mi.calories_per_100g, mi.proteins_per_100g, mi.fats_per_100g, mi.carbs_per_100g,
                mi.calories_per_serving, mi.proteins_per_serving, mi.fats_per_serving, mi.carbs_per_serving,
                mi.created_at, mi.updated_at
         FROM menu_items mi
         JOIN menu_item_categories mic ON mic.item_id = mi.id
         JOIN menu_item_cities micities ON micities.item_id = mi.id
         WHERE mic.category_id = ? 
           AND mi.is_active = TRUE
           AND micities.city_id = ?
           AND micities.is_active = TRUE
         ORDER BY mic.sort_order, mi.sort_order, mi.name`,
        [category.id, city_id],
      );
      const availableItems = [];
      for (const item of items) {
        const [tags] = await db.query(
          `SELECT t.id, t.name, t.icon, t.color
           FROM tags t
           JOIN menu_item_tags mit ON mit.tag_id = t.id
           WHERE mit.item_id = ?
           ORDER BY t.name`,
          [item.id],
        );
        item.tags = tags;
        if (fulfillment_type) {
          const [prices] = await db.query(
            `SELECT price FROM menu_item_prices
             WHERE item_id = ?
               AND (city_id = ? OR city_id IS NULL)
               AND fulfillment_type = ?
             ORDER BY city_id DESC
             LIMIT 1`,
            [item.id, city_id, fulfillment_type],
          );
          item.price = prices.length > 0 ? prices[0].price : null;
        } else {
          const [prices] = await db.query(
            `SELECT price FROM menu_item_prices
             WHERE item_id = ?
               AND (city_id = ? OR city_id IS NULL)
               AND fulfillment_type = 'delivery'
             ORDER BY city_id DESC
             LIMIT 1`,
            [item.id, city_id],
          );
          item.price = prices.length > 0 ? prices[0].price : null;
        }
        if (branch_id) {
          const stopListQuery = fulfillment_type
            ? `SELECT id FROM menu_stop_list
               WHERE branch_id = ?
                 AND entity_type = 'item'
                 AND entity_id = ?
                 AND (remove_at IS NULL OR remove_at > NOW())
                 AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))`
            : `SELECT id FROM menu_stop_list
               WHERE branch_id = ?
                 AND entity_type = 'item'
                 AND entity_id = ?
                 AND (remove_at IS NULL OR remove_at > NOW())`;
          const params = fulfillment_type ? [branch_id, item.id, fulfillment_type] : [branch_id, item.id];
          const [stopList] = await db.query(stopListQuery, params);
          item.in_stop_list = stopList.length > 0;
        } else {
          item.in_stop_list = false;
        }
        const [variants] = await db.query(
          `SELECT iv.id, iv.item_id, iv.name, iv.weight_value, iv.weight_unit, 
                  iv.sort_order, iv.is_active,
                  iv.calories_per_100g, iv.proteins_per_100g, iv.fats_per_100g, iv.carbs_per_100g,
                  iv.calories_per_serving, iv.proteins_per_serving, iv.fats_per_serving, iv.carbs_per_serving
           FROM item_variants iv
           WHERE iv.item_id = ? AND iv.is_active = TRUE
           ORDER BY iv.sort_order, iv.name`,
          [item.id],
        );
        for (const variant of variants) {
          if (fulfillment_type) {
            const [variantPrices] = await db.query(
              `SELECT price FROM menu_variant_prices
               WHERE variant_id = ?
                 AND (city_id = ? OR city_id IS NULL)
                 AND fulfillment_type = ?
               ORDER BY city_id DESC
               LIMIT 1`,
              [variant.id, city_id, fulfillment_type],
            );
            variant.price = variantPrices.length > 0 ? variantPrices[0].price : null;
          } else {
            const [variantPrices] = await db.query(
              `SELECT price FROM menu_variant_prices
               WHERE variant_id = ?
                 AND (city_id = ? OR city_id IS NULL)
                 AND fulfillment_type = 'delivery'
               ORDER BY city_id DESC
               LIMIT 1`,
              [variant.id, city_id],
            );
            variant.price = variantPrices.length > 0 ? variantPrices[0].price : null;
          }
          if (branch_id) {
            const stopListQuery = fulfillment_type
              ? `SELECT id FROM menu_stop_list
                 WHERE branch_id = ?
                   AND entity_type = 'variant'
                   AND entity_id = ?
                   AND (remove_at IS NULL OR remove_at > NOW())
                   AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))`
              : `SELECT id FROM menu_stop_list
                 WHERE branch_id = ?
                   AND entity_type = 'variant'
                   AND entity_id = ?
                   AND (remove_at IS NULL OR remove_at > NOW())`;
            const params = fulfillment_type ? [branch_id, variant.id, fulfillment_type] : [branch_id, variant.id];
            const [stopList] = await db.query(stopListQuery, params);
            variant.in_stop_list = stopList.length > 0;
          } else {
            variant.in_stop_list = false;
          }
        }
        item.variants = variants;
        const [modifierGroups] = await db.query(
          `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_global, 
                  mg.min_selections, mg.max_selections, mg.is_active
           FROM modifier_groups mg
           JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
           WHERE img.item_id = ? AND mg.is_active = TRUE
           ORDER BY mg.is_required DESC, mg.name`,
          [item.id],
        );
        const [disabledModifiers] = await db.query(`SELECT modifier_id FROM menu_item_disabled_modifiers WHERE item_id = ?`, [item.id]);
        const disabledIds = disabledModifiers.map((dm) => dm.modifier_id);
        for (const group of modifierGroups) {
          const [modifiers] = await db.query(
            `SELECT m.id, m.group_id, m.name, m.price, m.weight, m.weight_unit, m.image_url, m.sort_order, m.is_active
             FROM modifiers m
             WHERE m.group_id = ? AND m.is_active = TRUE
             ORDER BY m.sort_order, m.name`,
            [group.id],
          );
          const activeModifiers = modifiers.filter((mod) => !disabledIds.includes(mod.id));
          for (const modifier of activeModifiers) {
            if (variants.length > 0) {
              const [variantPrices] = await db.query(
                `SELECT variant_id, price, weight, weight_unit
                 FROM menu_modifier_variant_prices
                 WHERE modifier_id = ?`,
                [modifier.id],
              );
              modifier.variant_prices = variantPrices;
            }
            if (branch_id) {
              const stopListQuery = fulfillment_type
                ? `SELECT id FROM menu_stop_list
                   WHERE branch_id = ?
                     AND entity_type = 'modifier'
                     AND entity_id = ?
                     AND (remove_at IS NULL OR remove_at > NOW())
                     AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))`
                : `SELECT id FROM menu_stop_list
                   WHERE branch_id = ?
                     AND entity_type = 'modifier'
                     AND entity_id = ?
                     AND (remove_at IS NULL OR remove_at > NOW())`;
              const params = fulfillment_type ? [branch_id, modifier.id, fulfillment_type] : [branch_id, modifier.id];
              const [stopList] = await db.query(stopListQuery, params);
              modifier.in_stop_list = stopList.length > 0;
            } else {
              modifier.in_stop_list = false;
            }
          }
          group.modifiers = activeModifiers;
        }
        item.modifier_groups = modifierGroups;
        const [oldModifiers] = await db.query(
          `SELECT id, item_id, name, price, is_required, is_active
           FROM menu_modifiers
           WHERE item_id = ? AND is_active = TRUE
           ORDER BY name`,
          [item.id],
        );
        item.modifiers = oldModifiers;
        if (fulfillment_type) {
          if (item.variants.length > 0) {
            item.variants = item.variants.filter((variant) => variant.price !== null && variant.price !== undefined);
            if (item.variants.length === 0) {
              continue;
            }
          } else if (item.price === null || item.price === undefined) {
            continue;
          }
        }
        availableItems.push(item);
      }
      if (availableItems.length > 0) {
        category.items = availableItems;
        filteredCategories.push(category);
      }
    }
    const payload = { categories: filteredCategories };
    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", MENU_CACHE_TTL);
    } catch (error) {
      console.error("Failed to cache menu:", error);
    }
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
router.get("/categories", async (req, res, next) => {
  try {
    const { city_id } = req.query;
    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }
    const [categories] = await db.query(
      `SELECT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order,
              (mc.is_active AND mcc.is_active) AS is_active,
              mc.created_at, mc.updated_at
       FROM menu_categories mc
       JOIN menu_category_cities mcc ON mcc.category_id = mc.id
       WHERE mcc.city_id = ?
         AND mc.is_active = TRUE
         AND mcc.is_active = TRUE
       ORDER BY mc.sort_order, mc.name`,
      [city_id],
    );
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});
router.get("/categories/:id", async (req, res, next) => {
  try {
    const categoryId = req.params.id;
    const [categories] = await db.query(
      `SELECT id, name, description, image_url, sort_order, 
              is_active, created_at, updated_at
       FROM menu_categories
       WHERE id = ? AND is_active = TRUE`,
      [categoryId],
    );
    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json({ category: categories[0] });
  } catch (error) {
    next(error);
  }
});
router.get("/categories/:categoryId/items", async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId;
    const [items] = await db.query(
      `SELECT mi.id, mi.name, mi.description, mi.price, mi.image_url, 
              mi.weight, mi.weight_value, mi.weight_unit, mi.calories, mi.sort_order, mi.is_active, mi.created_at, mi.updated_at
       FROM menu_items mi
       JOIN menu_item_categories mic ON mic.item_id = mi.id
       WHERE mic.category_id = ? AND mi.is_active = TRUE
       ORDER BY mic.sort_order, mi.sort_order, mi.name`,
      [categoryId],
    );
    for (const item of items) {
      const [variants] = await db.query(
        `SELECT id, item_id, name, price, weight_value, weight_unit, sort_order, is_active
         FROM item_variants
         WHERE item_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [item.id],
      );
      item.variants = variants;
      const [modifierGroups] = await db.query(
        `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_active
         FROM modifier_groups mg
         JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
         WHERE img.item_id = ? AND mg.is_active = TRUE
         ORDER BY mg.name`,
        [item.id],
      );
      for (const group of modifierGroups) {
        const [modifiers] = await db.query(
          `SELECT id, group_id, name, price, sort_order, is_active
           FROM modifiers
           WHERE group_id = ? AND is_active = TRUE
           ORDER BY sort_order, name`,
          [group.id],
        );
        group.modifiers = modifiers;
      }
      item.modifier_groups = modifierGroups;
    }
    res.json({ items });
  } catch (error) {
    next(error);
  }
});
router.get("/items/:id", async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const [items] = await db.query(
      `SELECT id, category_id, name, description, price, image_url, 
              weight, weight_value, weight_unit, calories, sort_order, is_active, created_at, updated_at
       FROM menu_items
       WHERE id = ? AND is_active = TRUE`,
      [itemId],
    );
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    const item = items[0];
    const [variants] = await db.query(
      `SELECT id, item_id, name, price, weight_value, weight_unit, sort_order, is_active
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId],
    );
    const [modifierGroups] = await db.query(
      `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_active
       FROM modifier_groups mg
       JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
       WHERE img.item_id = ? AND mg.is_active = TRUE
       ORDER BY mg.name`,
      [itemId],
    );
    for (const group of modifierGroups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, sort_order, is_active
         FROM modifiers
         WHERE group_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [group.id],
      );
      group.modifiers = modifiers;
    }
    const [oldModifiers] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active
       FROM menu_modifiers
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY name`,
      [itemId],
    );
    res.json({
      item: {
        ...item,
        variants: variants,
        modifier_groups: modifierGroups,
        modifiers: oldModifiers,
      },
    });
  } catch (error) {
    next(error);
  }
});
router.get("/items/:itemId/modifiers", async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const [modifiers] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active, created_at, updated_at
       FROM menu_modifiers
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY name`,
      [itemId],
    );
    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
});
router.get("/items/:itemId/variants", async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const [variants] = await db.query(
      `SELECT id, item_id, name, price, weight_value, weight_unit, sort_order, is_active, created_at, updated_at
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId],
    );
    res.json({ variants });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/all-categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const [categories] = await db.query(
      `SELECT id, name, description, image_url, sort_order, 
              is_active, created_at, updated_at
       FROM menu_categories
       ORDER BY sort_order, name`,
    );
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_id } = req.query;
    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }
    const cityId = parseInt(city_id);
    if (req.user.role === "manager" && !req.user.cities.includes(cityId)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    const [categories] = await db.query(
      `SELECT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order,
              (mc.is_active AND mcc.is_active) AS is_active,
              mc.is_active AS global_is_active,
              mcc.is_active AS city_is_active,
              mc.created_at, mc.updated_at
       FROM menu_categories mc
       JOIN menu_category_cities mcc ON mcc.category_id = mc.id
       WHERE mcc.city_id = ?
       ORDER BY mc.sort_order, mc.name`,
      [cityId],
    );
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_ids, name, description, image_url, sort_order, is_active } = req.body;
    if (!name) {
      return res.status(400).json({
        error: "name is required",
      });
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO menu_categories (name, description, image_url, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [name, description || null, image_url || null, sort_order || 0, is_active !== undefined ? is_active : true],
      );
      const [cities] = await connection.query(`SELECT id FROM cities`);
      const allCityIds = cities.map((city) => city.id);
      const allowedCityIds = req.user.role === "manager" ? (Array.isArray(req.user.cities) ? req.user.cities : []) : allCityIds;
      const requestedCityIds = Array.isArray(city_ids) ? city_ids.map((id) => parseInt(id)) : allowedCityIds;
      if (req.user.role === "manager" && requestedCityIds.some((cityId) => !allowedCityIds.includes(cityId))) {
        return res.status(403).json({ error: "You do not have access to one or more cities" });
      }
      for (const cityId of allowedCityIds) {
        const isActive = requestedCityIds.includes(cityId);
        await connection.query(
          `INSERT INTO menu_category_cities (category_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [result.insertId, cityId, isActive],
        );
      }
      await connection.commit();
      const [newCategory] = await connection.query(
        `SELECT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order,
                mc.is_active, mc.created_at, mc.updated_at
         FROM menu_categories mc
         WHERE mc.id = ?`,
        [result.insertId],
      );
      await invalidateAllMenuCache();
      res.status(201).json({ category: newCategory[0] });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
});
router.put("/admin/categories/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.id;
    const { name, description, image_url, sort_order, is_active, city_ids } = req.body;
    const [categories] = await db.query("SELECT id FROM menu_categories WHERE id = ?", [categoryId]);
    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
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
    if (image_url !== undefined) {
      updates.push("image_url = ?");
      values.push(image_url);
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      values.push(sort_order);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    if (updates.length === 0 && !Array.isArray(city_ids)) {
      return res.status(400).json({ error: "No fields to update" });
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (updates.length > 0) {
        values.push(categoryId);
        await connection.query(`UPDATE menu_categories SET ${updates.join(", ")} WHERE id = ?`, values);
      }
      if (Array.isArray(city_ids)) {
        const [cities] = await connection.query(`SELECT id FROM cities`);
        const allCityIds = cities.map((city) => city.id);
        const allowedCityIds = req.user.role === "manager" ? (Array.isArray(req.user.cities) ? req.user.cities : []) : allCityIds;
        const requestedCityIds = city_ids.map((id) => parseInt(id));
        if (req.user.role === "manager" && requestedCityIds.some((cityId) => !allowedCityIds.includes(cityId))) {
          return res.status(403).json({ error: "You do not have access to one or more cities" });
        }
        for (const cityId of allowedCityIds) {
          const isActive = requestedCityIds.includes(cityId);
          await connection.query(
            `INSERT INTO menu_category_cities (category_id, city_id, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [categoryId, cityId, isActive],
          );
        }
      }
      await connection.commit();
      const [updatedCategory] = await connection.query(
        `SELECT id, name, description, image_url, sort_order, 
                is_active, created_at, updated_at
         FROM menu_categories WHERE id = ?`,
        [categoryId],
      );
      await invalidateAllMenuCache();
      res.json({ category: updatedCategory[0] });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/categories/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.id;
    const [categories] = await db.query("SELECT id FROM menu_categories WHERE id = ?", [categoryId]);
    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    const categoryCityIds = await getCategoryCityIds(categoryId);
    if (!managerHasCityAccess(req.user, categoryCityIds)) {
      return res.status(403).json({
        error: "You do not have access to this category",
      });
    }
    const [items] = await db.query("SELECT COUNT(*) as count FROM menu_item_categories WHERE category_id = ?", [categoryId]);
    if (items[0].count > 0) {
      return res.status(400).json({
        error: "Cannot delete category with items. Delete items first.",
      });
    }
    await db.query("DELETE FROM menu_categories WHERE id = ?", [categoryId]);
    await invalidateAllMenuCache();
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/categories/:categoryId/items", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId;
    const [categories] = await db.query("SELECT id FROM menu_categories WHERE id = ?", [categoryId]);
    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    const categoryCityIds = await getCategoryCityIds(categoryId);
    if (!managerHasCityAccess(req.user, categoryCityIds)) {
      return res.status(403).json({
        error: "You do not have access to this category",
      });
    }
    const [items] = await db.query(
      `SELECT mi.id, mi.name, mi.description, mi.image_url, 
              mi.weight, mi.weight_value, mi.weight_unit, mi.calories, mi.sort_order, mi.is_active, 
              mi.created_at, mi.updated_at
       FROM menu_items mi
       JOIN menu_item_categories mic ON mic.item_id = mi.id
       WHERE mic.category_id = ?
       ORDER BY mic.sort_order, mi.sort_order, mi.name`,
      [categoryId],
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/items", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const {
      name,
      description,
      composition,
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
      const [result] = await connection.query(
        `INSERT INTO menu_items 
         (name, description, composition, image_url, weight_value, weight_unit, 
          calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
          calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
          sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description || null,
          composition || null,
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
      if (Array.isArray(category_ids)) {
        for (const categoryId of category_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order) VALUES (?, ?, 0)", [itemId, categoryId]);
        }
      }
      if (Array.isArray(tag_ids)) {
        for (const tagId of tag_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_tags (item_id, tag_id) VALUES (?, ?)", [itemId, tagId]);
        }
      }
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
      if (Array.isArray(prices)) {
        for (const priceItem of prices) {
          if (!priceItem.fulfillment_type || priceItem.price === undefined) continue;
          await connection.query(
            `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [itemId, priceItem.city_id || null, priceItem.fulfillment_type, priceItem.price],
          );
        }
      }
      const [newItem] = await connection.query(
        `SELECT id, name, description, composition, image_url, 
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
});
router.get("/admin/items", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
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
      ORDER BY mi.sort_order, mi.name
    `;
    const [items] = await db.query(query);
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
      let basePrice = null;
      const [variantPrice] = await db.query(
        `SELECT mvp.price
         FROM item_variants iv
         LEFT JOIN menu_variant_prices mvp
           ON mvp.variant_id = iv.id
          AND mvp.city_id IS NULL
          AND mvp.fulfillment_type = 'delivery'
         WHERE iv.item_id = ?
         ORDER BY iv.sort_order, iv.name
         LIMIT 1`,
        [item.id],
      );
      if (variantPrice.length > 0) {
        basePrice = variantPrice[0].price;
      }
      if (basePrice === null || basePrice === undefined) {
        const [variantFallback] = await db.query(
          `SELECT price FROM item_variants
           WHERE item_id = ?
           ORDER BY sort_order, name
           LIMIT 1`,
          [item.id],
        );
        basePrice = variantFallback[0]?.price ?? null;
      }
      if (basePrice === null || basePrice === undefined) {
        const [itemPrice] = await db.query(
          `SELECT price FROM menu_item_prices
           WHERE item_id = ?
             AND city_id IS NULL
             AND fulfillment_type = 'delivery'
           LIMIT 1`,
          [item.id],
        );
        basePrice = itemPrice[0]?.price ?? null;
      }
      if (basePrice === null || basePrice === undefined) {
        basePrice = item.legacy_price ?? null;
      }
      item.base_price = basePrice;
      delete item.legacy_price;
    }
    res.json({ items });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const [items] = await db.query(
      `SELECT 
        mi.id, 
        mi.name, 
        mi.description, 
        mi.composition,
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
});
router.put("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const {
      name,
      description,
      composition,
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
      if (Array.isArray(category_ids)) {
        await connection.query("DELETE FROM menu_item_categories WHERE item_id = ?", [itemId]);
        for (const categoryId of category_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order) VALUES (?, ?, 0)", [itemId, categoryId]);
        }
      }
      if (Array.isArray(tag_ids)) {
        await connection.query("DELETE FROM menu_item_tags WHERE item_id = ?", [itemId]);
        for (const tagId of tag_ids) {
          await connection.query("INSERT IGNORE INTO menu_item_tags (item_id, tag_id) VALUES (?, ?)", [itemId, tagId]);
        }
      }
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
      if (Array.isArray(prices)) {
        for (const priceItem of prices) {
          if (!priceItem.fulfillment_type || priceItem.price === undefined) continue;
          await connection.query(
            `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [itemId, priceItem.city_id || null, priceItem.fulfillment_type, priceItem.price],
          );
        }
      }
      const [updatedItem] = await connection.query(
        `SELECT id, name, description, composition, image_url, 
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
});
router.delete("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/items/:itemId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/items/:itemId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
              sort_order, is_active, created_at, updated_at
       FROM item_variants
       WHERE item_id = ?
       ORDER BY sort_order, name`,
      [itemId],
    );
    res.json({ variants });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
           sort_order
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          sort_order || 0,
        ],
      );
      if (Array.isArray(prices) && prices.length > 0) {
        for (const priceItem of prices) {
          if (!priceItem.fulfillment_type || priceItem.price === undefined) continue;
          await connection.query(
            `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [result.insertId, priceItem.city_id || null, priceItem.fulfillment_type, priceItem.price],
          );
        }
      } else if (price !== undefined && price !== null) {
        const fulfillmentTypes = ["delivery", "pickup", "dine_in"];
        for (const fulfillmentType of fulfillmentTypes) {
          await connection.query(
            `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
             VALUES (?, NULL, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [result.insertId, fulfillmentType, price],
          );
        }
      }
      const [newVariant] = await connection.query(
        `SELECT id, item_id, name, price, weight_value, weight_unit,
                calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
                calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
                sort_order, is_active, created_at, updated_at
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
});
router.put("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
          sort_order: variant.sort_order || 0,
          is_active: variant.is_active !== undefined ? variant.is_active : true,
        };
        if (variant.id && existingIds.has(variant.id)) {
          await connection.query(
            `UPDATE item_variants
             SET name = ?, price = ?, weight_value = ?, weight_unit = ?,
                 calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
                 calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?,
                 sort_order = ?, is_active = ?
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
              payload.sort_order,
              payload.is_active,
              variant.id,
              itemId,
            ],
          );
        } else {
          const [insertResult] = await connection.query(
            `INSERT INTO item_variants (
               item_id, name, price, weight_value, weight_unit,
               calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
               calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
               sort_order, is_active
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              payload.sort_order,
              payload.is_active,
            ],
          );
          variant.id = insertResult.insertId;
        }
        if (Array.isArray(variant.prices) && variant.prices.length > 0) {
          for (const priceItem of variant.prices) {
            if (!priceItem.fulfillment_type || priceItem.price === undefined) continue;
            await connection.query(
              `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE price = VALUES(price)`,
              [variant.id, priceItem.city_id || null, priceItem.fulfillment_type, priceItem.price],
            );
          }
        } else if (!variant.id || !existingIds.has(variant.id)) {
          if (payload.price !== undefined && payload.price !== null) {
            const fulfillmentTypes = ["delivery", "pickup", "dine_in"];
            for (const fulfillmentType of fulfillmentTypes) {
              await connection.query(
                `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
                 VALUES (?, NULL, ?, ?)
                 ON DUPLICATE KEY UPDATE price = VALUES(price)`,
                [variant.id, fulfillmentType, payload.price],
              );
            }
          }
        }
      }
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
});
router.put("/admin/variants/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const variantId = req.params.id;
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
      sort_order,
      is_active,
      prices,
    } = req.body;
    const [variants] = await db.query(
      `SELECT iv.id, iv.item_id
       FROM item_variants iv
       JOIN menu_items mi ON iv.item_id = mi.id
       WHERE iv.id = ?`,
      [variantId],
    );
    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }
    const itemCityIds = await getItemCityIds(variants[0].item_id);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
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
    values.push(variantId);
    await db.query(`UPDATE item_variants SET ${updates.join(", ")} WHERE id = ?`, values);
    if (Array.isArray(prices) && prices.length > 0) {
      for (const priceItem of prices) {
        if (!priceItem.fulfillment_type || priceItem.price === undefined) continue;
        await db.query(
          `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE price = VALUES(price)`,
          [variantId, priceItem.city_id || null, priceItem.fulfillment_type, priceItem.price],
        );
      }
    }
    const [updatedVariant] = await db.query(
      `SELECT id, item_id, name, price, weight_value, weight_unit,
              calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
              calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
              sort_order, is_active, created_at, updated_at
       FROM item_variants WHERE id = ?`,
      [variantId],
    );
    await invalidateAllMenuCache();
    res.json({ variant: updatedVariant[0] });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/variants/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const variantId = req.params.id;
    const [variants] = await db.query(
      `SELECT iv.id, iv.item_id
       FROM item_variants iv
       JOIN menu_items mi ON iv.item_id = mi.id
       WHERE iv.id = ?`,
      [variantId],
    );
    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }
    const itemCityIds = await getItemCityIds(variants[0].item_id);
    if (!managerHasCityAccess(req.user, itemCityIds)) {
      return res.status(403).json({ error: "You do not have access to this item" });
    }
    await db.query("DELETE FROM item_variants WHERE id = ?", [variantId]);
    await invalidateAllMenuCache();
    res.json({ message: "Variant deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/variants", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const params = [];
    let whereClause = "";
    if (req.user.role === "manager" && Array.isArray(req.user.cities) && req.user.cities.length > 0) {
      whereClause = "WHERE mic.city_id IN (?)";
      params.push(req.user.cities);
    }
    const [variants] = await db.query(
      `SELECT iv.id, CONCAT(mi.name, ' - ', iv.name) as name
       FROM item_variants iv
       JOIN menu_items mi ON iv.item_id = mi.id
       LEFT JOIN menu_item_cities mic ON mic.item_id = mi.id
       ${whereClause}
       ORDER BY mi.name, iv.name`,
      params,
    );
    res.json({ variants });
  } catch (error) {
    next(error);
  }
});
router.get("/modifier-groups", async (req, res, next) => {
  try {
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections,
              is_active, created_at, updated_at
       FROM modifier_groups
       WHERE is_active = TRUE
       ORDER BY name`,
      [],
    );
    for (const group of groups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active
         FROM modifiers
         WHERE group_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [group.id],
      );
      group.modifiers = modifiers;
    }
    res.json({ modifier_groups: groups });
  } catch (error) {
    next(error);
  }
});
router.get("/modifier-groups/:id", async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections,
              is_active, created_at, updated_at
       FROM modifier_groups
       WHERE id = ? AND is_active = TRUE`,
      [groupId],
    );
    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }
    const group = groups[0];
    const [modifiers] = await db.query(
      `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active
       FROM modifiers
       WHERE group_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [groupId],
    );
    group.modifiers = modifiers;
    res.json({ modifier_group: group });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections,
              is_active, created_at, updated_at
       FROM modifier_groups
       ORDER BY name`,
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
});
router.post("/admin/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { name, type, is_required, is_global, min_selections, max_selections, modifiers } = req.body;
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
      const [groupResult] = await connection.query(
        `INSERT INTO modifier_groups (name, type, is_required, is_global, min_selections, max_selections)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name,
          type,
          is_required || false,
          is_global || false,
          min_selections !== undefined ? min_selections : is_required ? 1 : 0,
          max_selections !== undefined ? max_selections : type === "multiple" ? 10 : 1,
        ],
      );
      const groupId = groupResult.insertId;
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
        `SELECT id, name, type, is_required, is_global, min_selections, max_selections,
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
});
router.put("/admin/modifier-groups/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { name, type, is_required, is_global, min_selections, max_selections, is_active } = req.body;
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
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections,
              is_active, created_at, updated_at
       FROM modifier_groups WHERE id = ?`,
      [groupId],
    );
    await invalidateAllMenuCache();
    res.json({ modifier_group: updatedGroup[0] });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/modifier-groups/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);
    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }
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
});
router.post("/admin/items/:itemId/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/items/:itemId/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
      `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_global, mg.min_selections, mg.max_selections
       FROM modifier_groups mg
       JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
       WHERE img.item_id = ?
       ORDER BY mg.name`,
      [itemId],
    );
    res.json({ modifier_groups: groups });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/items/:itemId/modifier-groups/:groupId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/modifier-groups/:groupId/modifiers", async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const [modifiers] = await db.query(
      `SELECT id, group_id, name, price, sort_order, is_active, created_at, updated_at
       FROM modifiers
       WHERE group_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [groupId],
    );
    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/modifier-groups/:groupId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.id;
    const { name, price, weight, weight_unit, image_url, sort_order, is_active } = req.body;
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
      values.push(weight_unit);
    }
    if (image_url !== undefined) {
      updates.push("image_url = ?");
      values.push(image_url);
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
});
router.delete("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/tags", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.post("/admin/tags", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/tags/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
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
});
router.delete("/admin/tags/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
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
});
router.post("/admin/items/:itemId/tags", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.delete("/admin/items/:itemId/tags/:tagId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { itemId, tagId } = req.params;
    await db.query("DELETE FROM menu_item_tags WHERE item_id = ? AND tag_id = ?", [itemId, tagId]);
    await invalidateAllMenuCache();
    res.json({ message: "Tag removed from item successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/items/:itemId/tags", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/items/:itemId/tags", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.post("/admin/items/:itemId/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.delete("/admin/items/:itemId/categories/:categoryId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { itemId, categoryId } = req.params;
    await db.query("DELETE FROM menu_item_categories WHERE item_id = ? AND category_id = ?", [itemId, categoryId]);
    await invalidateAllMenuCache();
    res.json({ message: "Item removed from category successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/items/:itemId/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const [categories] = await db.query(
      `SELECT c.id, c.name, c.city_id, mic.sort_order
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
});
router.put("/admin/items/:itemId/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/items/:itemId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const [prices] = await db.query(
      `SELECT mip.id, mip.city_id, c.name as city_name, mip.fulfillment_type, mip.price, mip.created_at, mip.updated_at
       FROM menu_item_prices mip
       LEFT JOIN cities c ON c.id = mip.city_id
       WHERE mip.item_id = ?
       ORDER BY mip.city_id, mip.fulfillment_type`,
      [itemId],
    );
    res.json({ prices });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/items/:itemId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { city_id, fulfillment_type, price } = req.body;
    if (!fulfillment_type || price === undefined) {
      return res.status(400).json({ error: "fulfillment_type and price are required" });
    }
    if (!["delivery", "pickup", "dine_in"].includes(fulfillment_type)) {
      return res.status(400).json({ error: "Invalid fulfillment_type" });
    }
    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    if (city_id) {
      const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [city_id]);
      if (cities.length === 0) {
        return res.status(404).json({ error: "City not found" });
      }
    }
    await db.query(
      `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price)`,
      [itemId, city_id || null, fulfillment_type, price],
    );
    await invalidateAllMenuCache();
    res.json({ message: "Price saved successfully" });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/items/:itemId/prices/:priceId", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { itemId, priceId } = req.params;
    await db.query("DELETE FROM menu_item_prices WHERE id = ? AND item_id = ?", [priceId, itemId]);
    await invalidateAllMenuCache();
    res.json({ message: "Price deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/variants/:variantId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const variantId = req.params.variantId;
    const [prices] = await db.query(
      `SELECT mvp.id, mvp.city_id, c.name as city_name, mvp.fulfillment_type, mvp.price, mvp.created_at, mvp.updated_at
       FROM menu_variant_prices mvp
       LEFT JOIN cities c ON c.id = mvp.city_id
       WHERE mvp.variant_id = ?
       ORDER BY mvp.city_id, mvp.fulfillment_type`,
      [variantId],
    );
    res.json({ prices });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/variants/:variantId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const variantId = req.params.variantId;
    const { city_id, fulfillment_type, price } = req.body;
    if (!fulfillment_type || price === undefined) {
      return res.status(400).json({ error: "fulfillment_type and price are required" });
    }
    if (!["delivery", "pickup", "dine_in"].includes(fulfillment_type)) {
      return res.status(400).json({ error: "Invalid fulfillment_type" });
    }
    const [variants] = await db.query("SELECT id FROM item_variants WHERE id = ?", [variantId]);
    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }
    await db.query(
      `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price)`,
      [variantId, city_id || null, fulfillment_type, price],
    );
    await invalidateAllMenuCache();
    res.json({ message: "Variant price saved successfully" });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/modifiers/:modifierId/variant-prices", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.modifierId;
    const { variant_id, price, weight, weight_unit } = req.body;
    if (!variant_id || price === undefined) {
      return res.status(400).json({ error: "variant_id and price are required" });
    }
    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifierId]);
    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }
    const [variants] = await db.query("SELECT id FROM item_variants WHERE id = ?", [variant_id]);
    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }
    await db.query(
      `INSERT INTO menu_modifier_variant_prices (modifier_id, variant_id, price, weight, weight_unit)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         price = VALUES(price),
         weight = VALUES(weight),
         weight_unit = VALUES(weight_unit)`,
      [modifierId, variant_id, price, weight || null, weight_unit || null],
    );
    await invalidateAllMenuCache();
    res.json({ message: "Modifier variant price saved successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/modifiers/:modifierId/variant-prices", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.modifierId;
    const [prices] = await db.query(
      `SELECT mmvp.id, mmvp.variant_id, iv.name as variant_name, mmvp.price, mmvp.weight, mmvp.weight_unit, mmvp.created_at, mmvp.updated_at
       FROM menu_modifier_variant_prices mmvp
       JOIN item_variants iv ON iv.id = mmvp.variant_id
       WHERE mmvp.modifier_id = ?
       ORDER BY iv.sort_order, iv.name`,
      [modifierId],
    );
    res.json({ prices });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/stop-list", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/stop-list-reasons", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.post("/admin/stop-list-reasons", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/stop-list-reasons/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
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
});
router.delete("/admin/stop-list-reasons/:id", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const reasonId = req.params.id;
    await db.query("DELETE FROM menu_stop_list_reasons WHERE id = ?", [reasonId]);
    res.json({ message: "Reason deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/stop-list", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { branch_id, entity_type, entity_id, reason, fulfillment_types, auto_remove, remove_at } = req.body;
    if (!branch_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: "branch_id, entity_type, and entity_id are required" });
    }
    if (!["item", "variant", "modifier"].includes(entity_type)) {
      return res.status(400).json({ error: "Invalid entity_type" });
    }
    const allowedFulfillment = ["delivery", "pickup", "dine_in"];
    const normalizedFulfillment = Array.isArray(fulfillment_types)
      ? Array.from(new Set(fulfillment_types.filter((type) => allowedFulfillment.includes(type))))
      : null;
    const autoRemove = Boolean(auto_remove);
    const removeAtValue = autoRemove ? remove_at : null;
    if (autoRemove && (!removeAtValue || Number.isNaN(Date.parse(removeAtValue)))) {
      return res.status(400).json({ error: "remove_at is required for auto_remove" });
    }
    const [branches] = await db.query("SELECT id FROM branches WHERE id = ?", [branch_id]);
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }
    let entityTable;
    if (entity_type === "item") entityTable = "menu_items";
    else if (entity_type === "variant") entityTable = "item_variants";
    else if (entity_type === "modifier") entityTable = "modifiers";
    const [entities] = await db.query(`SELECT id FROM ${entityTable} WHERE id = ?`, [entity_id]);
    if (entities.length === 0) {
      return res.status(404).json({ error: `${entity_type} not found` });
    }
    await db.query(
      `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fulfillment_types = VALUES(fulfillment_types),
         reason = VALUES(reason),
         auto_remove = VALUES(auto_remove),
         remove_at = VALUES(remove_at),
         created_by = VALUES(created_by)`,
      [
        branch_id,
        entity_type,
        entity_id,
        normalizedFulfillment && normalizedFulfillment.length > 0 ? JSON.stringify(normalizedFulfillment) : null,
        reason || null,
        autoRemove,
        removeAtValue,
        req.user.id,
      ],
    );
    await invalidateAllMenuCache();
    res.status(201).json({ message: "Added to stop list successfully" });
  } catch (error) {
    next(error);
  }
});
router.delete("/admin/stop-list/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const stopListId = req.params.id;
    await db.query("DELETE FROM menu_stop_list WHERE id = ?", [stopListId]);
    await invalidateAllMenuCache();
    res.json({ message: "Removed from stop list successfully" });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/categories/:categoryId/cities", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId;
    const { city_id, is_active } = req.body;
    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }
    const [categories] = await db.query("SELECT id FROM menu_categories WHERE id = ?", [categoryId]);
    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }
    await db.query(
      `INSERT INTO menu_category_cities (category_id, city_id, is_active)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
      [categoryId, city_id, is_active !== undefined ? is_active : true],
    );
    await invalidateMenuCacheByCity(city_id);
    res.json({ message: "Category city availability updated successfully" });
  } catch (error) {
    next(error);
  }
});
router.put("/admin/categories/:categoryId/cities/:cityId", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { categoryId, cityId } = req.params;
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ error: "is_active is required" });
    }
    await db.query(
      `UPDATE menu_category_cities 
       SET is_active = ?
       WHERE category_id = ? AND city_id = ?`,
      [is_active, categoryId, cityId],
    );
    await invalidateMenuCacheByCity(cityId);
    res.json({ message: "Category availability updated successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/categories/:categoryId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId;
    const [cities] = await db.query(
      `SELECT mcc.id, mcc.city_id, c.name as city_name, mcc.is_active, mcc.created_at, mcc.updated_at
       FROM menu_category_cities mcc
       JOIN cities c ON c.id = mcc.city_id
       WHERE mcc.category_id = ?
       ORDER BY c.name`,
      [categoryId],
    );
    res.json({ cities });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/items/:itemId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/items/:itemId/cities/:cityId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.get("/admin/items/:itemId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.put("/admin/items/:itemId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
      await connection.query("DELETE FROM menu_item_cities WHERE item_id = ?", [itemId]);
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
});
router.post("/admin/items/:itemId/disabled-modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
router.delete(
  "/admin/items/:itemId/disabled-modifiers/:modifierId",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  async (req, res, next) => {
    try {
      const { itemId, modifierId } = req.params;
      await db.query("DELETE FROM menu_item_disabled_modifiers WHERE item_id = ? AND modifier_id = ?", [itemId, modifierId]);
      await invalidateAllMenuCache();
      res.json({ message: "Modifier enabled for item successfully" });
    } catch (error) {
      next(error);
    }
  },
);
router.get("/admin/items/:itemId/disabled-modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
});
export default router;
