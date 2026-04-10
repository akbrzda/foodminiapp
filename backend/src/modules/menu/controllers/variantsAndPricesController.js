import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";
import { getPriceCategoryMappingForContext } from "../services/priceService.js";

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

const normalizePriceCategoryId = (value) => String(value || "").trim();

const pickPreferredPriceRows = (rows = [], priceCategoryMapping = null) => {
  const mapping = priceCategoryMapping && typeof priceCategoryMapping === "object" ? priceCategoryMapping : {};
  const grouped = new Map();

  const getPriority = (row) => {
    const fulfillmentType = String(row?.fulfillment_type || "").trim();
    const targetCategoryId = normalizePriceCategoryId(mapping?.[fulfillmentType] || "");
    const rowCategoryId = normalizePriceCategoryId(row?.price_category_id || "");

    if (targetCategoryId) {
      if (rowCategoryId === targetCategoryId) return 3;
      if (!rowCategoryId) return 1;
      return 2;
    }

    if (!rowCategoryId) return 1;
    return 2;
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = `${row.city_id}:${row.fulfillment_type}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, row);
      continue;
    }

    const currentPriority = getPriority(current);
    const nextPriority = getPriority(row);
    if (nextPriority > currentPriority) {
      grouped.set(key, row);
      continue;
    }
    if (nextPriority < currentPriority) continue;

    const currentUpdatedAt = new Date(current.updated_at || 0).getTime();
    const nextUpdatedAt = new Date(row.updated_at || 0).getTime();
    if (nextUpdatedAt > currentUpdatedAt) {
      grouped.set(key, row);
      continue;
    }
    if (nextUpdatedAt === currentUpdatedAt && Number(row.id || 0) > Number(current.id || 0)) {
      grouped.set(key, row);
    }
  }

  return [...grouped.values()].sort((a, b) => {
    const cityA = Number(a.city_id || 0);
    const cityB = Number(b.city_id || 0);
    if (cityA !== cityB) return cityA - cityB;
    return String(a.fulfillment_type || "").localeCompare(String(b.fulfillment_type || ""));
  });
};

// PUT /admin/variants/:id - Обновление варианта
export const updateVariant = async (req, res, next) => {
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
      image_url,
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

    values.push(variantId);
    await db.query(`UPDATE item_variants SET ${updates.join(", ")} WHERE id = ?`, values);

    // Обновление цен варианта
    if (Array.isArray(prices) && prices.length > 0) {
      const priceCategoryMapping = await getPriceCategoryMappingForContext();
      for (const priceItem of prices) {
        if (!priceItem.fulfillment_type || priceItem.price === undefined || priceItem.city_id === undefined || priceItem.city_id === null) continue;
        const priceCategoryId = normalizePriceCategoryId(
          priceCategoryMapping?.[priceItem.fulfillment_type] || ""
        );
        if (!priceCategoryId) continue;
        await db.query(
          `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price_category_id, price)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE price = VALUES(price)`,
          [
            variantId,
            priceItem.city_id,
            priceItem.fulfillment_type,
            priceCategoryId,
            priceItem.price,
          ],
        );
      }
    }

    const [updatedVariant] = await db.query(
      `SELECT id, item_id, name, price, weight_value, weight_unit,
              calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
              calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving,
              image_url, sort_order, is_active, created_at, updated_at
       FROM item_variants WHERE id = ?`,
      [variantId],
    );

    await invalidateAllMenuCache();

    res.json({ variant: updatedVariant[0] });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/variants/:id - Удаление варианта
export const deleteVariant = async (req, res, next) => {
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
};

// GET /admin/variants - Получение всех вариантов (для выбора)
export const getAdminVariants = async (req, res, next) => {
  try {
    const params = [];
    let whereClause = "WHERE iv.is_active = TRUE AND mi.is_active = TRUE";

    if (req.user.role === "manager") {
      if (!Array.isArray(req.user.cities) || req.user.cities.length === 0) {
        return res.json({ variants: [] });
      }
      whereClause += ` AND EXISTS (
        SELECT 1
        FROM menu_item_cities mic
        WHERE mic.item_id = mi.id
          AND mic.city_id IN (?)
          AND mic.is_active = TRUE
      )`;
      params.push(req.user.cities);
    }

    const [variants] = await db.query(
      `SELECT DISTINCT iv.id, iv.item_id, iv.name AS variant_name, mi.name AS item_name, CONCAT(mi.name, ' - ', iv.name) as name
       FROM item_variants iv
       JOIN menu_items mi ON iv.item_id = mi.id
       ${whereClause}
       ORDER BY mi.name, iv.name`,
      params,
    );

    res.json({ variants });
  } catch (error) {
    next(error);
  }
};

// GET /admin/items/:itemId/prices - Получение цен товара
export const getItemPrices = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const priceCategoryMapping = await getPriceCategoryMappingForContext();

    const [prices] = await db.query(
      `SELECT mip.id, mip.city_id, c.name as city_name, mip.fulfillment_type, mip.price, mip.price_category_id, mip.price_category_name, mip.created_at, mip.updated_at
       FROM menu_item_prices mip
       LEFT JOIN cities c ON c.id = mip.city_id
       WHERE mip.item_id = ?
       ORDER BY mip.city_id, mip.fulfillment_type, mip.updated_at DESC, mip.id DESC`,
      [itemId],
    );

    res.json({ prices: pickPreferredPriceRows(prices, priceCategoryMapping) });
  } catch (error) {
    next(error);
  }
};

// POST /admin/items/:itemId/prices - Добавление/обновление цены товара
export const createItemPrice = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { city_id, fulfillment_type, price } = req.body;
    const priceCategoryMapping = await getPriceCategoryMappingForContext();
    const priceCategoryId = normalizePriceCategoryId(priceCategoryMapping?.[fulfillment_type] || "");

    if (!fulfillment_type || price === undefined || city_id === undefined || city_id === null) {
      return res.status(400).json({ error: "city_id, fulfillment_type and price are required" });
    }

    if (!["delivery", "pickup"].includes(fulfillment_type)) {
      return res.status(400).json({ error: "Invalid fulfillment_type" });
    }
    if (!priceCategoryId) {
      return res.status(400).json({ error: "Price category mapping is required for fulfillment_type" });
    }

    const [items] = await db.query("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }

    await db.query(
      `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price_category_id, price)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price)`,
      [itemId, city_id, fulfillment_type, priceCategoryId, price],
    );
    await invalidateAllMenuCache();

    res.json({ message: "Price saved successfully" });
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/items/:itemId/prices/:priceId - Удаление цены товара
export const deleteItemPrice = async (req, res, next) => {
  try {
    const { itemId, priceId } = req.params;

    await db.query("DELETE FROM menu_item_prices WHERE id = ? AND item_id = ?", [priceId, itemId]);
    await invalidateAllMenuCache();

    res.json({ message: "Price deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// GET /admin/variants/:variantId/prices - Получение цен варианта
export const getVariantPrices = async (req, res, next) => {
  try {
    const variantId = req.params.variantId;
    const priceCategoryMapping = await getPriceCategoryMappingForContext();

    const [prices] = await db.query(
      `SELECT mvp.id, mvp.city_id, c.name as city_name, mvp.fulfillment_type, mvp.price, mvp.price_category_id, mvp.price_category_name, mvp.created_at, mvp.updated_at
       FROM menu_variant_prices mvp
       LEFT JOIN cities c ON c.id = mvp.city_id
       WHERE mvp.variant_id = ?
       ORDER BY mvp.city_id, mvp.fulfillment_type, mvp.updated_at DESC, mvp.id DESC`,
      [variantId],
    );

    res.json({ prices: pickPreferredPriceRows(prices, priceCategoryMapping) });
  } catch (error) {
    next(error);
  }
};

// POST /admin/variants/:variantId/prices - Добавление/обновление цены варианта
export const createVariantPrice = async (req, res, next) => {
  try {
    const variantId = req.params.variantId;
    const { city_id, fulfillment_type, price } = req.body;
    const priceCategoryMapping = await getPriceCategoryMappingForContext();
    const priceCategoryId = normalizePriceCategoryId(priceCategoryMapping?.[fulfillment_type] || "");

    if (!fulfillment_type || price === undefined || city_id === undefined || city_id === null) {
      return res.status(400).json({ error: "city_id, fulfillment_type and price are required" });
    }

    if (!["delivery", "pickup"].includes(fulfillment_type)) {
      return res.status(400).json({ error: "Invalid fulfillment_type" });
    }
    if (!priceCategoryId) {
      return res.status(400).json({ error: "Price category mapping is required for fulfillment_type" });
    }

    const [variants] = await db.query("SELECT id FROM item_variants WHERE id = ?", [variantId]);
    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const [cities] = await db.query("SELECT id FROM cities WHERE id = ?", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found" });
    }

    await db.query(
      `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price_category_id, price)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price)`,
      [variantId, city_id, fulfillment_type, priceCategoryId, price],
    );
    await invalidateAllMenuCache();

    res.json({ message: "Variant price saved successfully" });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/variants/:variantId/prices - Полная замена цен варианта
export const updateVariantPrices = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const variantId = req.params.variantId;
    const { prices } = req.body;
    const priceCategoryMapping = await getPriceCategoryMappingForContext();

    if (!Array.isArray(prices)) {
      return res.status(400).json({ error: "prices must be an array" });
    }

    const [variants] = await connection.query("SELECT id FROM item_variants WHERE id = ?", [variantId]);
    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await connection.beginTransaction();

    for (const priceItem of prices) {
      const { city_id, fulfillment_type, price } = priceItem || {};
      if (!fulfillment_type || price === undefined || price === null) {
        continue;
      }

      if (!["delivery", "pickup"].includes(fulfillment_type)) {
        await connection.rollback();
        return res.status(400).json({ error: "Invalid fulfillment_type" });
      }
      if (city_id === undefined || city_id === null) {
        await connection.rollback();
        return res.status(400).json({ error: "city_id is required for each price" });
      }
      const priceCategoryId = normalizePriceCategoryId(priceCategoryMapping?.[fulfillment_type] || "");
      if (!priceCategoryId) {
        await connection.rollback();
        return res.status(400).json({ error: "Price category mapping is required for fulfillment_type" });
      }

      await connection.query(
        `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price_category_id, price)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE price = VALUES(price)`,
        [variantId, city_id, fulfillment_type, priceCategoryId, price],
      );
    }

    await connection.commit();
    await invalidateAllMenuCache();

    res.json({ message: "Variant prices replaced successfully" });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};
