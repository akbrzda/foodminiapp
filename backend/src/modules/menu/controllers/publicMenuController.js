import db from "../../../config/database.js";
import redis from "../../../config/redis.js";
import logger from "../../../utils/logger.js";

const MENU_CACHE_TTL = 300;

// Функции кэширования
async function getMenuCache(cacheKey) {
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error("Failed to read menu cache", { error });
    return null;
  }
}

async function setMenuCache(cacheKey, payload) {
  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", MENU_CACHE_TTL);
  } catch (error) {
    logger.error("Failed to write menu cache", { error });
  }
}

async function attachVariantPricesToModifiers(modifierGroups = [], variants = []) {
  const allModifiers = modifierGroups.flatMap((group) => group.modifiers || []);
  if (allModifiers.length === 0) return;

  const modifierIds = [...new Set(allModifiers.map((modifier) => Number(modifier.id)).filter(Number.isFinite))];
  const variantIds = [...new Set((variants || []).map((variant) => Number(variant.id)).filter(Number.isFinite))];

  for (const modifier of allModifiers) {
    modifier.variant_prices = [];
  }

  if (variantIds.length === 0 || modifierIds.length === 0) return;
  const [rows] = await db.query(
    `SELECT modifier_id, variant_id, price, weight, weight_unit
     FROM menu_modifier_variant_prices
     WHERE modifier_id IN (${modifierIds.map(() => "?").join(",")})
       AND variant_id IN (${variantIds.map(() => "?").join(",")})`,
    [...modifierIds, ...variantIds],
  );

  const pricesMap = new Map();
  for (const row of rows) {
    if (!pricesMap.has(row.modifier_id)) {
      pricesMap.set(row.modifier_id, []);
    }
    pricesMap.get(row.modifier_id).push({
      variant_id: row.variant_id,
      price: row.price,
      weight: row.weight,
      weight_unit: row.weight_unit,
    });
  }

  for (const modifier of allModifiers) {
    modifier.variant_prices = pricesMap.get(modifier.id) || [];
  }
}

// GET / - Получение полного меню с фильтрацией по городу и филиалу
export const getMenu = async (req, res, next) => {
  try {
    const { city_id, branch_id, fulfillment_type } = req.query;

    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }

    const cityId = Number(city_id);
    const cacheKeyParts = [`menu:city:${city_id}`];
    if (branch_id) cacheKeyParts.push(`branch:${branch_id}`);
    if (fulfillment_type) cacheKeyParts.push(`fulfillment:${fulfillment_type}`);
    const cacheKey = cacheKeyParts.join(":");

    // Проверка кэша
    const cachedMenu = await getMenuCache(cacheKey);
    if (cachedMenu) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cachedMenu);
    }

    // Получение категорий
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
      // Получение товаров для категории
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
        // Получение тегов
        const [tags] = await db.query(
          `SELECT t.id, t.name, t.icon, t.color
           FROM tags t
           JOIN menu_item_tags mit ON mit.tag_id = t.id
           WHERE mit.item_id = ?
           ORDER BY t.name`,
          [item.id],
        );
        item.tags = tags;

        // Получение цены товара
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

        // Проверка стоп-листа для товара
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

        // Получение вариантов товара
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
          // Получение цены варианта
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

          // Проверка стоп-листа для варианта
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

        // Получение групп модификаторов
        const [modifierGroups] = await db.query(
          `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_global, 
                  mg.min_selections, mg.max_selections, mg.sort_order, mg.is_active
           FROM modifier_groups mg
           JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
           WHERE img.item_id = ? AND mg.is_active = TRUE
           ORDER BY mg.sort_order, mg.is_required DESC, mg.name`,
          [item.id],
        );

        // Получение отключенных модификаторов для товара
        const [disabledModifiers] = await db.query(`SELECT modifier_id FROM menu_item_disabled_modifiers WHERE item_id = ?`, [item.id]);
        const disabledIds = disabledModifiers.map((dm) => dm.modifier_id);

        for (const group of modifierGroups) {
          // Получение модификаторов группы
          const [modifiers] = await db.query(
            `SELECT m.id, m.group_id, m.name, m.price, m.weight, m.weight_unit, m.image_url, m.sort_order, m.is_active
             FROM modifiers m
             WHERE m.group_id = ? AND m.is_active = TRUE
             ORDER BY m.sort_order, m.name`,
            [group.id],
          );

          const activeModifiers = modifiers.filter((mod) => !disabledIds.includes(mod.id));
          let modifiersWithCity = activeModifiers;

          // Применение городских цен на модификаторы
          if (cityId && activeModifiers.length > 0) {
            const modifierIds = activeModifiers.map((mod) => mod.id);
            const [cityPrices] = await db.query(
              `SELECT modifier_id, price, is_active
               FROM menu_modifier_prices
               WHERE city_id = ?
                 AND modifier_id IN (${modifierIds.map(() => "?").join(",")})`,
              [cityId, ...modifierIds],
            );

            const pricesByModifier = new Map(cityPrices.map((row) => [row.modifier_id, row]));

            modifiersWithCity = activeModifiers.filter((modifier) => {
              const priceRow = pricesByModifier.get(modifier.id);
              if (priceRow && !priceRow.is_active) {
                return false;
              }
              if (priceRow) {
                modifier.price = priceRow.price;
              }
              return true;
            });
          }

          // Проверка стоп-листа для модификаторов
          for (const modifier of modifiersWithCity) {
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

          group.modifiers = modifiersWithCity;
        }

        await attachVariantPricesToModifiers(modifierGroups, variants);
        item.modifier_groups = modifierGroups;

        // Фильтрация товаров без цен
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

    // Сохранение в кэш
    await setMenuCache(cacheKey, payload);

    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

// GET /categories - Получение списка категорий для города
export const getCategories = async (req, res, next) => {
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
};

// GET /categories/:id - Получение одной категории
export const getCategoryById = async (req, res, next) => {
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
};

// GET /categories/:categoryId/items - Получение товаров категории
export const getCategoryItems = async (req, res, next) => {
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
      // Получение вариантов
      const [variants] = await db.query(
        `SELECT id, item_id, name, price, weight_value, weight_unit, sort_order, is_active
         FROM item_variants
         WHERE item_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [item.id],
      );
      item.variants = variants;

      // Получение групп модификаторов
      const [modifierGroups] = await db.query(
        `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.min_selections, mg.max_selections, mg.sort_order, mg.is_active
         FROM modifier_groups mg
         JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
         WHERE img.item_id = ? AND mg.is_active = TRUE
         ORDER BY mg.sort_order, mg.name`,
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

      await attachVariantPricesToModifiers(modifierGroups, variants);
      item.modifier_groups = modifierGroups;
    }

    res.json({ items });
  } catch (error) {
    next(error);
  }
};

// GET /items/:id - Получение одного товара
export const getItemById = async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const { city_id, fulfillment_type } = req.query;
    const fulfillmentType = fulfillment_type || "delivery";

    const [items] = await db.query(
      `SELECT mi.id,
              COALESCE(
                (
                  SELECT JSON_ARRAYAGG(mic.category_id ORDER BY mic.sort_order, mic.category_id)
                  FROM menu_item_categories mic
                  WHERE mic.item_id = mi.id
                ),
                JSON_ARRAY()
              ) AS category_ids,
              mi.name, mi.description, mi.price, mi.image_url,
              mi.weight, mi.weight_value, mi.weight_unit, mi.calories, mi.sort_order, mi.is_active, mi.created_at, mi.updated_at
       FROM menu_items mi
       WHERE mi.id = ? AND mi.is_active = TRUE`,
      [itemId],
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = items[0];
    let categoryIds = item.category_ids;
    if (typeof categoryIds === "string") {
      try {
        categoryIds = JSON.parse(categoryIds);
      } catch (error) {
        categoryIds = [];
      }
    }
    if (!Array.isArray(categoryIds)) {
      categoryIds = [];
    }
    item.category_ids = categoryIds;
    // Оставляем обратную совместимость для клиентов, ожидающих одно значение.
    item.category_id = categoryIds[0] || null;

    // Получение цены товара по городу
    if (city_id) {
      const [prices] = await db.query(
        `SELECT price FROM menu_item_prices
         WHERE item_id = ?
           AND (city_id = ? OR city_id IS NULL)
           AND fulfillment_type = ?
         ORDER BY city_id DESC
         LIMIT 1`,
        [itemId, city_id, fulfillmentType],
      );
      item.price = prices.length > 0 ? prices[0].price : null;
    }

    // Получение вариантов
    const [variants] = await db.query(
      `SELECT id, item_id, name, price, weight_value, weight_unit, sort_order, is_active
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId],
    );

    if (city_id) {
      for (const variant of variants) {
        const [variantPrices] = await db.query(
          `SELECT price FROM menu_variant_prices
           WHERE variant_id = ?
             AND (city_id = ? OR city_id IS NULL)
             AND fulfillment_type = ?
           ORDER BY city_id DESC
           LIMIT 1`,
          [variant.id, city_id, fulfillmentType],
        );
        variant.price = variantPrices.length > 0 ? variantPrices[0].price : null;
      }
    }

    // Получение групп модификаторов
    const [modifierGroups] = await db.query(
      `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.min_selections, mg.max_selections, mg.sort_order, mg.is_active
       FROM modifier_groups mg
       JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
       WHERE img.item_id = ? AND mg.is_active = TRUE
       ORDER BY mg.sort_order, mg.name`,
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

      if (city_id && modifiers.length > 0) {
        const modifierIds = modifiers.map((modifier) => modifier.id);
        const [cityPrices] = await db.query(
          `SELECT modifier_id, price, is_active
           FROM menu_modifier_prices
           WHERE city_id = ?
             AND modifier_id IN (${modifierIds.map(() => "?").join(",")})`,
          [city_id, ...modifierIds],
        );

        const pricesByModifier = new Map(cityPrices.map((row) => [row.modifier_id, row]));

        const filteredModifiers = modifiers.filter((modifier) => {
          const priceRow = pricesByModifier.get(modifier.id);
          if (priceRow && !priceRow.is_active) {
            return false;
          }
          if (priceRow) {
            modifier.price = priceRow.price;
          }
          return true;
        });
        group.modifiers = filteredModifiers;
      } else {
        group.modifiers = modifiers;
      }
    }

    await attachVariantPricesToModifiers(modifierGroups, variants);

    res.json({
      item: {
        ...item,
        variants: variants,
        modifier_groups: modifierGroups,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /items/:itemId/modifiers - Получение модификаторов товара
export const getItemModifiers = async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [modifiers] = await db.query(
      `SELECT m.id, ? as item_id, m.group_id, m.name, m.price, m.weight, m.weight_unit, m.image_url,
              m.sort_order, m.is_active, m.created_at, m.updated_at
       FROM modifiers m
       JOIN item_modifier_groups img ON img.modifier_group_id = m.group_id
       LEFT JOIN menu_item_disabled_modifiers midm ON midm.item_id = img.item_id AND midm.modifier_id = m.id
       WHERE img.item_id = ?
         AND m.is_active = TRUE
         AND midm.id IS NULL
       ORDER BY m.sort_order, m.name`,
      [itemId, itemId],
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
};

// GET /items/:itemId/variants - Получение вариантов товара
export const getItemVariants = async (req, res, next) => {
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
};

// GET /modifier-groups - Получение всех групп модификаторов
export const getModifierGroups = async (req, res, next) => {
  try {
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections, sort_order,
              is_active, created_at, updated_at
       FROM modifier_groups
       WHERE is_active = TRUE
       ORDER BY sort_order, name`,
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
};

// GET /modifier-groups/:id - Получение одной группы модификаторов
export const getModifierGroupById = async (req, res, next) => {
  try {
    const groupId = req.params.id;

    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_global, min_selections, max_selections, sort_order,
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
};

// GET /modifier-groups/:groupId/modifiers - Получение модификаторов группы
export const getGroupModifiers = async (req, res, next) => {
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
};
