import db from "../../../config/database.js";
import redis from "../../../config/redis.js";
import logger from "../../../utils/logger.js";
import { getIntegrationSettings } from "../../integrations/services/integrationConfigService.js";
import { getDynamicUpsell } from "../services/upsellService.js";
import {
  getItemPriceByFulfillmentType,
  getVariantPriceByFulfillmentType,
  getPriceCategoryMappingForContext,
} from "../services/priceService.js";

const MENU_CACHE_TTL = 300;
const MENU_CACHE_VERSION = "v2";
const NEW_BADGE_DAYS = 14;
const HIT_BADGE_SALES_THRESHOLD = 50;

const buildSourceScope = (integrationSettings) => {
  const menuMode = String(integrationSettings?.integrationMode?.menu || "local")
    .trim()
    .toLowerCase();
  const useIikoSource = Boolean(integrationSettings?.iikoEnabled) && menuMode === "external";

  // В local-режиме не отсекаем сущности по наличию iiko-id:
  // после синка iiko локальные позиции сохраняют внешние идентификаторы и
  // должны оставаться видимыми при отключенной интеграции.
  const categoryFilter = "";
  const itemFilter = useIikoSource
    ? "AND (COALESCE(NULLIF(TRIM(mi.iiko_item_id), ''), NULL) IS NOT NULL OR mi.item_type = 'combo')"
    : "";

  return {
    source: useIikoSource ? "iiko" : "local",
    categoryFilter,
    itemFilter,
  };
};

const isTruthy = (value) => value === true || value === 1 || value === "1";

function buildItemBadges(item, soldCount = 0) {
  const badges = [];
  const createdAt = item?.created_at ? new Date(item.created_at) : null;
  const now = new Date();
  const isNewAuto =
    createdAt instanceof Date &&
    !Number.isNaN(createdAt.getTime()) &&
    now.getTime() - createdAt.getTime() <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
  const isHitAuto = Number(soldCount) >= HIT_BADGE_SALES_THRESHOLD;
  const hasManualNew = item?.is_new !== null && item?.is_new !== undefined;
  const hasManualHit = item?.is_hit !== null && item?.is_hit !== undefined;
  const isNewEnabled = hasManualNew ? isTruthy(item?.is_new) : isNewAuto;
  const isHitEnabled = hasManualHit ? isTruthy(item?.is_hit) : isHitAuto;

  if (isNewEnabled) {
    badges.push({ code: "new", label: "Новинка" });
  }
  if (isHitEnabled) {
    badges.push({ code: "hit", label: "Хит" });
  }
  if (isTruthy(item?.is_spicy)) {
    badges.push({ code: "spicy", label: "Острое" });
  }
  if (isTruthy(item?.is_vegetarian)) {
    badges.push({ code: "vegetarian", label: "Вегетарианское" });
  }
  if (isTruthy(item?.is_piquant)) {
    badges.push({ code: "piquant", label: "Пикантное" });
  }
  if (isTruthy(item?.is_value)) {
    badges.push({ code: "value", label: "Выгодно" });
  }

  return badges.slice(0, 2);
}

function parseNumericPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasPositivePrice(value) {
  const price = parseNumericPrice(value);
  return price !== null && price > 0;
}

function isVariantVisibleInPublicMenu(variant) {
  if (!variant) return false;
  return hasPositivePrice(variant.price);
}

function isItemVisibleInPublicMenu(item) {
  if (!item) return false;
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    return item.variants.some((variant) => isVariantVisibleInPublicMenu(variant));
  }
  return hasPositivePrice(item.price);
}

async function getCompletedSalesByItemIds(itemIds = []) {
  const normalizedIds = itemIds.map((id) => Number(id)).filter(Number.isFinite);
  if (normalizedIds.length === 0) return new Map();

  const [rows] = await db.query(
    `SELECT oi.item_id, COALESCE(SUM(oi.quantity), 0) AS sold_count
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.item_id IN (${normalizedIds.map(() => "?").join(",")})
       AND o.status = 'completed'
     GROUP BY oi.item_id`,
    normalizedIds
  );

  return new Map(rows.map((row) => [Number(row.item_id), Number(row.sold_count) || 0]));
}

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

  const modifierIds = [
    ...new Set(allModifiers.map((modifier) => Number(modifier.id)).filter(Number.isFinite)),
  ];
  const variantIds = [
    ...new Set((variants || []).map((variant) => Number(variant.id)).filter(Number.isFinite)),
  ];

  for (const modifier of allModifiers) {
    modifier.variant_prices = [];
  }

  if (variantIds.length === 0 || modifierIds.length === 0) return;
  const [rows] = await db.query(
    `SELECT modifier_id, variant_id, price, weight, weight_unit
     FROM menu_modifier_variant_prices
     WHERE modifier_id IN (${modifierIds.map(() => "?").join(",")})
       AND variant_id IN (${variantIds.map(() => "?").join(",")})`,
    [...modifierIds, ...variantIds]
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

async function resolveComboComponentsWithAvailability(
  itemId,
  { cityId = null, branchId = null, fulfillmentType = "delivery", priceCategoryMapping = null } = {}
) {
  const [components] = await db.query(
    `SELECT mcc.id,
            mcc.combo_item_id,
            mcc.component_item_id,
            mcc.component_variant_id,
            mcc.quantity,
            mcc.sort_order,
            mi.name AS component_item_name,
            iv.name AS component_variant_name,
            iv.image_url AS component_variant_image_url,
            iv.price AS component_variant_base_price,
            iv.is_active AS component_variant_is_active,
            mi.is_active AS component_item_is_active
     FROM menu_combo_components mcc
     JOIN menu_items mi ON mi.id = mcc.component_item_id
     JOIN item_variants iv ON iv.id = mcc.component_variant_id
     WHERE mcc.combo_item_id = ?
     ORDER BY mcc.sort_order, mcc.id`,
    [itemId]
  );

  if (!Array.isArray(components) || components.length === 0) {
    return { components: [], isAvailable: false };
  }

  const result = [];
  let isAvailable = true;

  for (const component of components) {
    let componentPrice = Number(component.component_variant_base_price) || 0;
    let componentInStopList = false;
    let componentCityAvailable = true;
    const componentVariantId = Number(component.component_variant_id);
    const componentItemId = Number(component.component_item_id);

    if (cityId) {
      const [cityAvailabilityRows] = await db.query(
        `SELECT is_active
         FROM menu_item_cities
         WHERE item_id = ? AND city_id = ?
         LIMIT 1`,
        [componentItemId, cityId]
      );
      componentCityAvailable =
        cityAvailabilityRows.length > 0 && Boolean(cityAvailabilityRows[0].is_active);

      const resolvedComponentPrice = await getVariantPriceByFulfillmentType(
        componentVariantId,
        cityId,
        fulfillmentType,
        priceCategoryMapping
      );
      if (resolvedComponentPrice !== null) {
        componentPrice = Number(resolvedComponentPrice) || 0;
      }
    }

    if (branchId) {
      const [itemStopRows] = await db.query(
        `SELECT id
         FROM menu_stop_list
         WHERE branch_id = ?
           AND entity_type = 'item'
           AND entity_id = ?
           AND (remove_at IS NULL OR remove_at > NOW())
           AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))
         LIMIT 1`,
        [branchId, componentItemId, fulfillmentType]
      );
      const [variantStopRows] = await db.query(
        `SELECT id
         FROM menu_stop_list
         WHERE branch_id = ?
           AND entity_type = 'variant'
           AND entity_id = ?
           AND (remove_at IS NULL OR remove_at > NOW())
           AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))
         LIMIT 1`,
        [branchId, componentVariantId, fulfillmentType]
      );
      componentInStopList = itemStopRows.length > 0 || variantStopRows.length > 0;
    }

    const componentIsActive =
      Boolean(component.component_item_is_active) && Boolean(component.component_variant_is_active);
    const componentHasPrice = Number.isFinite(componentPrice) && componentPrice > 0;
    const componentIsAvailable =
      componentIsActive && componentCityAvailable && componentHasPrice && !componentInStopList;
    if (!componentIsAvailable) {
      isAvailable = false;
    }

    result.push({
      id: component.id,
      combo_item_id: component.combo_item_id,
      component_item_id: componentItemId,
      component_variant_id: componentVariantId,
      component_item_name: component.component_item_name,
      component_variant_name: component.component_variant_name,
      component_variant_image_url: component.component_variant_image_url,
      quantity: Number(component.quantity) || 1,
      sort_order: Number(component.sort_order) || 0,
      price: Number(componentPrice) || 0,
      in_stop_list: componentInStopList,
      is_available: componentIsAvailable,
    });
  }

  return { components: result, isAvailable };
}

// GET / - Получение полного меню с фильтрацией по городу и филиалу
export const getMenu = async (req, res, next) => {
  try {
    const { city_id, branch_id, fulfillment_type } = req.query;

    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }

    const cityId = Number(city_id);
    const integration = await getIntegrationSettings();
    const sourceScope = buildSourceScope(integration);
    const priceCategoryMapping = await getPriceCategoryMappingForContext();
    const cacheKeyParts = [
      `menu:${MENU_CACHE_VERSION}:city:${city_id}`,
      `mode:${sourceScope.source}`,
    ];
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
         ${sourceScope.categoryFilter}
       ORDER BY mc.sort_order, mc.name`,
      [city_id]
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
                mi.is_new, mi.is_hit, mi.is_spicy, mi.is_vegetarian, mi.is_piquant, mi.is_value,
                mi.price AS legacy_price,
                mi.item_type, mi.bonus_spend_allowed, mi.bonus_earn_allowed,
                mi.created_at, mi.updated_at
         FROM menu_items mi
         JOIN menu_item_categories mic ON mic.item_id = mi.id
         JOIN menu_item_cities micities ON micities.item_id = mi.id
         WHERE mic.category_id = ? 
           AND mi.is_active = TRUE
           AND micities.city_id = ?
           AND micities.is_active = TRUE
           ${sourceScope.itemFilter}
         ORDER BY mic.sort_order, mi.sort_order, mi.name`,
        [category.id, city_id]
      );

      const salesByItemId = await getCompletedSalesByItemIds(items.map((item) => item.id));
      const availableItems = [];

      for (const item of items) {
        // Получение тегов
        const [tags] = await db.query(
          `SELECT t.id, t.name, t.icon, t.color
           FROM tags t
           JOIN menu_item_tags mit ON mit.tag_id = t.id
           WHERE mit.item_id = ?
           ORDER BY t.name`,
          [item.id]
        );
        item.tags = tags;
        item.badges = buildItemBadges(item, salesByItemId.get(Number(item.id)) || 0);

        // Получение цены товара с учетом категории цены
        const fallbackLegacyPrice = hasPositivePrice(item.legacy_price) ? item.legacy_price : null;
        if (fulfillment_type) {
          item.price =
            (await getItemPriceByFulfillmentType(
              item.id,
              city_id,
              fulfillment_type,
              priceCategoryMapping
            )) || fallbackLegacyPrice;
        } else {
          item.price =
            (await getItemPriceByFulfillmentType(
              item.id,
              city_id,
              "delivery",
              priceCategoryMapping
            )) || fallbackLegacyPrice;
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
          const params = fulfillment_type
            ? [branch_id, item.id, fulfillment_type]
            : [branch_id, item.id];
          const [stopList] = await db.query(stopListQuery, params);
          item.in_stop_list = stopList.length > 0;
        } else {
          item.in_stop_list = false;
        }

        // Получение вариантов товара
        const [variants] = await db.query(
          `SELECT iv.id, iv.item_id, iv.name, iv.image_url, iv.weight_value, iv.weight_unit, 
                  iv.sort_order, iv.is_active, iv.price AS legacy_price,
                  iv.calories_per_100g, iv.proteins_per_100g, iv.fats_per_100g, iv.carbs_per_100g,
                  iv.calories_per_serving, iv.proteins_per_serving, iv.fats_per_serving, iv.carbs_per_serving
           FROM item_variants iv
           WHERE iv.item_id = ? AND iv.is_active = TRUE
           ORDER BY iv.sort_order, iv.name`,
          [item.id]
        );

        for (const variant of variants) {
          const fallbackLegacyVariantPrice = hasPositivePrice(variant.legacy_price)
            ? variant.legacy_price
            : null;
          variant.price =
            (await getVariantPriceByFulfillmentType(
              variant.id,
              city_id,
              fulfillment_type || "delivery",
              priceCategoryMapping
            )) || fallbackLegacyVariantPrice;

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
            const params = fulfillment_type
              ? [branch_id, variant.id, fulfillment_type]
              : [branch_id, variant.id];
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
          [item.id]
        );

        // Получение отключенных модификаторов для товара
        const [disabledModifiers] = await db.query(
          `SELECT modifier_id FROM menu_item_disabled_modifiers WHERE item_id = ?`,
          [item.id]
        );
        const disabledIds = disabledModifiers.map((dm) => dm.modifier_id);

        for (const group of modifierGroups) {
          // Получение модификаторов группы
          const [modifiers] = await db.query(
            `SELECT m.id, m.group_id, m.name, m.price, m.weight, m.weight_unit, m.image_url, m.sort_order, m.is_active
             FROM modifiers m
             WHERE m.group_id = ? AND m.is_active = TRUE
             ORDER BY m.sort_order, m.name`,
            [group.id]
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
              [cityId, ...modifierIds]
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
              const params = fulfillment_type
                ? [branch_id, modifier.id, fulfillment_type]
                : [branch_id, modifier.id];
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
        item.item_type = item.item_type || "item";

        if (item.variants.length > 0) {
          item.variants = item.variants.filter((variant) => isVariantVisibleInPublicMenu(variant));
        }

        if (item.item_type === "combo") {
          const comboPayload = await resolveComboComponentsWithAvailability(item.id, {
            cityId,
            branchId: branch_id ? Number(branch_id) : null,
            fulfillmentType: fulfillment_type || "delivery",
            priceCategoryMapping,
          });
          item.combo_components = comboPayload.components;
          if (!comboPayload.isAvailable) {
            item.in_stop_list = true;
          }
        } else {
          item.combo_components = [];
        }

        if (!isItemVisibleInPublicMenu(item)) {
          continue;
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

    const integration = await getIntegrationSettings();
    const sourceScope = buildSourceScope(integration);

    const [categories] = await db.query(
      `SELECT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order,
              (mc.is_active AND mcc.is_active) AS is_active,
              mc.created_at, mc.updated_at
       FROM menu_categories mc
       JOIN menu_category_cities mcc ON mcc.category_id = mc.id
       WHERE mcc.city_id = ?
         AND mc.is_active = TRUE
         AND mcc.is_active = TRUE
         ${sourceScope.categoryFilter}
       ORDER BY mc.sort_order, mc.name`,
      [city_id]
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
    const integration = await getIntegrationSettings();
    const sourceScope = buildSourceScope(integration);

    const [categories] = await db.query(
      `SELECT mc.id, mc.name, mc.description, mc.image_url, mc.sort_order, 
              mc.is_active, mc.created_at, mc.updated_at
       FROM menu_categories mc
       WHERE mc.id = ? AND mc.is_active = TRUE
         ${sourceScope.categoryFilter}`,
      [categoryId]
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
    const integration = await getIntegrationSettings();
    const sourceScope = buildSourceScope(integration);

    const [items] = await db.query(
      `SELECT mi.id, mi.name, mi.description, mi.price, mi.image_url, 
              mi.weight, mi.weight_value, mi.weight_unit, mi.calories, mi.sort_order, mi.is_active, mi.created_at, mi.updated_at
       FROM menu_items mi
       JOIN menu_item_categories mic ON mic.item_id = mi.id
       WHERE mic.category_id = ? AND mi.is_active = TRUE
         ${sourceScope.itemFilter}
       ORDER BY mic.sort_order, mi.sort_order, mi.name`,
      [categoryId]
    );

    for (const item of items) {
      // Получение вариантов
      const [variants] = await db.query(
        `SELECT id, item_id, name, price, image_url, weight_value, weight_unit, sort_order, is_active
         FROM item_variants
         WHERE item_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [item.id]
      );
      item.variants = variants;

      // Получение групп модификаторов
      const [modifierGroups] = await db.query(
        `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.min_selections, mg.max_selections, mg.sort_order, mg.is_active
         FROM modifier_groups mg
         JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
         WHERE img.item_id = ? AND mg.is_active = TRUE
         ORDER BY mg.sort_order, mg.name`,
        [item.id]
      );

      for (const group of modifierGroups) {
        const [modifiers] = await db.query(
          `SELECT id, group_id, name, price, sort_order, is_active
           FROM modifiers
           WHERE group_id = ? AND is_active = TRUE
           ORDER BY sort_order, name`,
          [group.id]
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
    const { city_id, branch_id, fulfillment_type } = req.query;
    const fulfillmentType = fulfillment_type || "delivery";
    const integration = await getIntegrationSettings();
    const sourceScope = buildSourceScope(integration);
    const priceCategoryMapping = await getPriceCategoryMappingForContext();

    const [items] = await db.query(
      `SELECT mi.id,
              COALESCE(
                (
                  SELECT JSON_ARRAYAGG(sorted_categories.category_id)
                  FROM (
                    SELECT mic.category_id
                    FROM menu_item_categories mic
                    WHERE mic.item_id = mi.id
                    ORDER BY mic.sort_order, mic.category_id
                  ) AS sorted_categories
                ),
                JSON_ARRAY()
              ) AS category_ids,
              mi.name, mi.description, mi.price, mi.image_url,
              mi.weight, mi.weight_value, mi.weight_unit, mi.calories, mi.sort_order, mi.is_active,
              mi.is_new, mi.is_hit, mi.is_spicy, mi.is_vegetarian, mi.is_piquant, mi.is_value,
              mi.item_type, mi.bonus_spend_allowed, mi.bonus_earn_allowed,
              mi.created_at, mi.updated_at
       FROM menu_items mi
       WHERE mi.id = ? AND mi.is_active = TRUE
         ${sourceScope.itemFilter}`,
      [itemId]
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
    const salesByItemId = await getCompletedSalesByItemIds([item.id]);
    item.badges = buildItemBadges(item, salesByItemId.get(Number(item.id)) || 0);

    // Получение цены товара по городу
    if (city_id) {
      const fallbackLegacyPrice = hasPositivePrice(item.price) ? item.price : null;
      item.price =
        (await getItemPriceByFulfillmentType(
          itemId,
          city_id,
          fulfillmentType,
          priceCategoryMapping
        )) || fallbackLegacyPrice;
    }

    if (branch_id) {
      const [stopList] = await db.query(
        `SELECT id
         FROM menu_stop_list
         WHERE branch_id = ?
           AND entity_type = 'item'
           AND entity_id = ?
           AND (remove_at IS NULL OR remove_at > NOW())
           AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))
         LIMIT 1`,
        [branch_id, itemId, fulfillmentType]
      );
      item.in_stop_list = stopList.length > 0;
    } else {
      item.in_stop_list = false;
    }

    // Получение вариантов
    const [variants] = await db.query(
      `SELECT id, item_id, name, price AS legacy_price, image_url, weight_value, weight_unit, sort_order, is_active
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId]
    );

    if (city_id) {
      for (const variant of variants) {
        const fallbackLegacyVariantPrice = hasPositivePrice(variant.legacy_price)
          ? variant.legacy_price
          : null;
        variant.price =
          (await getVariantPriceByFulfillmentType(
            variant.id,
            city_id,
            fulfillmentType,
            priceCategoryMapping
          )) || fallbackLegacyVariantPrice;
      }
    }

    for (const variant of variants) {
      if (branch_id) {
        const [stopList] = await db.query(
          `SELECT id
           FROM menu_stop_list
           WHERE branch_id = ?
             AND entity_type = 'variant'
             AND entity_id = ?
             AND (remove_at IS NULL OR remove_at > NOW())
             AND (fulfillment_types IS NULL OR JSON_CONTAINS(fulfillment_types, JSON_QUOTE(?)))
           LIMIT 1`,
          [branch_id, variant.id, fulfillmentType]
        );
        variant.in_stop_list = stopList.length > 0;
      } else {
        variant.in_stop_list = false;
      }
    }

    const visibleVariants = variants.filter((variant) => isVariantVisibleInPublicMenu(variant));
    if (visibleVariants.length > 0) {
      item.variants = visibleVariants;
    } else {
      item.variants = [];
    }

    if (!isItemVisibleInPublicMenu(item)) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Получение групп модификаторов
    const [modifierGroups] = await db.query(
      `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.min_selections, mg.max_selections, mg.sort_order, mg.is_active
       FROM modifier_groups mg
       JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
       WHERE img.item_id = ? AND mg.is_active = TRUE
       ORDER BY mg.sort_order, mg.name`,
      [itemId]
    );

    for (const group of modifierGroups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, sort_order, is_active
         FROM modifiers
         WHERE group_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [group.id]
      );

      if (city_id && modifiers.length > 0) {
        const modifierIds = modifiers.map((modifier) => modifier.id);
        const [cityPrices] = await db.query(
          `SELECT modifier_id, price, is_active
           FROM menu_modifier_prices
           WHERE city_id = ?
             AND modifier_id IN (${modifierIds.map(() => "?").join(",")})`,
          [city_id, ...modifierIds]
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

    let comboComponents = [];
    if (item.item_type === "combo") {
      const comboPayload = await resolveComboComponentsWithAvailability(item.id, {
        cityId: city_id ? Number(city_id) : null,
        branchId: branch_id ? Number(branch_id) : null,
        fulfillmentType,
        priceCategoryMapping,
      });
      comboComponents = comboPayload.components;
      if (!comboPayload.isAvailable) {
        item.in_stop_list = true;
      }
    }

    res.json({
      item: {
        ...item,
        variants: item.variants,
        modifier_groups: modifierGroups,
        combo_components: comboComponents,
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
      [itemId, itemId]
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
      `SELECT id, item_id, name, price, image_url, weight_value, weight_unit, sort_order, is_active, created_at, updated_at
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId]
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
      []
    );

    for (const group of groups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, weight, weight_unit, image_url, sort_order, is_active
         FROM modifiers
         WHERE group_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [group.id]
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
      [groupId]
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
      [groupId]
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
      [groupId]
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
};

// POST /upsell - Динамичные допродажи для корзины
export const getCartUpsell = async (req, res, next) => {
  try {
    const { city_id, branch_id, fulfillment_type, cart_items, limit } = req.body || {};
    const cityId = Number(city_id);
    if (!Number.isInteger(cityId)) {
      return res.status(400).json({ error: "city_id is required" });
    }

    const suggestions = await getDynamicUpsell({
      cityId,
      branchId: Number.isInteger(Number(branch_id)) ? Number(branch_id) : null,
      fulfillmentType: fulfillment_type || "delivery",
      cartItems: Array.isArray(cart_items) ? cart_items : [],
      userId: req.user?.id || null,
      limit,
    });

    return res.json({ items: suggestions });
  } catch (error) {
    return next(error);
  }
};
