import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";
import { getIntegrationSettings } from "../../integrations/services/integrationConfigService.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";

// Функции для получения городов доступа
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

async function invalidateMenuCacheByCity(cityId) {
  if (!cityId) return;
  try {
    const redis = (await import("../../../config/redis.js")).default;
    const keys = await redis.keys(`menu:city:${cityId}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
    notifyMenuUpdated({ source: "admin", scope: "city", cityId: Number(cityId) || null });
  } catch (error) {
    logger.error("Failed to invalidate menu cache", { error });
  }
}

// GET /admin/all-categories - Получение всех категорий без фильтрации
export const getAllCategories = async (req, res, next) => {
  try {
    const integration = await getIntegrationSettings();
    const allowedSources = new Set(["local", "iiko"]);
    const defaultSource = integration.iikoEnabled ? "iiko" : "local";
    const requestedSource = String(req.query.source || "")
      .trim()
      .toLowerCase();
    const source = allowedSources.has(requestedSource) ? requestedSource : defaultSource;
    const sourceWhere =
      source === "iiko"
        ? "WHERE COALESCE(NULLIF(TRIM(mc.iiko_category_id), ''), NULL) IS NOT NULL"
        : "WHERE COALESCE(NULLIF(TRIM(mc.iiko_category_id), ''), NULL) IS NULL";

    const [rows] = await db.query(
      `SELECT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order,
              mc.is_active, mc.created_at, mc.updated_at,
              GROUP_CONCAT(CASE WHEN mcc.is_active = TRUE THEN mcc.city_id END ORDER BY mcc.city_id SEPARATOR ',') AS city_ids_raw
       FROM menu_categories mc
       LEFT JOIN menu_category_cities mcc ON mcc.category_id = mc.id
       ${sourceWhere}
       GROUP BY mc.id, mc.name, mc.description, mc.image_url, mc.sort_order, mc.is_active, mc.created_at, mc.updated_at
       ORDER BY mc.sort_order, mc.name`,
    );

    const categories = rows.map((row) => {
      const cityIds = String(row.city_ids_raw || "")
        .split(",")
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id));
      const { city_ids_raw, ...category } = row;
      return {
        ...category,
        city_ids: cityIds,
      };
    });

    res.json({
      categories,
      meta: {
        source,
        default_source: defaultSource,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /admin/categories - Получение категорий для города (админ)
export const getAdminCategories = async (req, res, next) => {
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
};

// POST /admin/categories - Создание категории
export const createCategory = async (req, res, next) => {
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

      // Создание категории
      const [result] = await connection.query(
        `INSERT INTO menu_categories (name, description, image_url, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [name, description || null, image_url || null, sort_order || 0, is_active !== undefined ? is_active : true],
      );

      // Получение всех городов
      const [cities] = await connection.query(`SELECT id FROM cities`);
      const allCityIds = cities.map((city) => city.id);

      const allowedCityIds = req.user.role === "manager" ? (Array.isArray(req.user.cities) ? req.user.cities : []) : allCityIds;

      const requestedCityIds = Array.isArray(city_ids) ? city_ids.map((id) => parseInt(id)) : allowedCityIds;

      if (req.user.role === "manager" && requestedCityIds.some((cityId) => !allowedCityIds.includes(cityId))) {
        return res.status(403).json({ error: "You do not have access to one or more cities" });
      }

      // Привязка категории к городам
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
};

// PUT /admin/categories/:id - Обновление категории
export const updateCategory = async (req, res, next) => {
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

      // Обновление привязки к городам
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
};

// DELETE /admin/categories/:id - Удаление категории
export const deleteCategory = async (req, res, next) => {
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

    // Проверка наличия товаров в категории
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
};

// GET /admin/categories/:categoryId/items - Получение товаров категории (админ)
export const getCategoryAdminItems = async (req, res, next) => {
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
};

// POST /admin/categories/:categoryId/cities - Добавление города к категории
export const addCategoryCity = async (req, res, next) => {
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
};

// PUT /admin/categories/:categoryId/cities/:cityId - Обновление доступности категории в городе
export const updateCategoryCity = async (req, res, next) => {
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
};

// GET /admin/categories/:categoryId/cities - Получение городов категории
export const getCategoryCities = async (req, res, next) => {
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
};
