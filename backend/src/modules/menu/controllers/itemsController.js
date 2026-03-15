import db from "../../../config/database.js";
import logger from "../../../utils/logger.js";
import { getIntegrationSettings } from "../../integrations/services/integrationConfigService.js";
import { notifyMenuUpdated } from "../../../websocket/runtime.js";

const NEW_BADGE_DAYS = 14;
const HIT_BADGE_SALES_THRESHOLD = 50;
const ALLOWED_ITEM_TYPES = new Set(["item", "combo"]);

// Вспомогательные функции
const toBool = (value, fallback = false) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return Boolean(value);
};

const isNewAutoActiveByCreatedAt = (createdAt) => {
  if (!createdAt) return false;
  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;
  return Date.now() - createdDate.getTime() <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
};

const resolveBadgeValue = (storedValue, autoValue) => {
  if (storedValue === null || storedValue === undefined) return Boolean(autoValue);
  return toBool(storedValue);
};

async function getCompletedSalesCount(itemId, connection = db) {
  if (!itemId) return 0;
  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS sold_count
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.item_id = ?
       AND o.status = 'completed'`,
    [itemId],
  );
  return Number(rows?.[0]?.sold_count) || 0;
}

function validateBadgesLimit({ isNewEnabled, isHitEnabled, isSpicyEnabled, isVegetarianEnabled, isPiquantEnabled, isValueEnabled }) {
  const activeCount = [isNewEnabled, isHitEnabled, isSpicyEnabled, isVegetarianEnabled, isPiquantEnabled, isValueEnabled].filter(Boolean).length;
  if (activeCount > 2) {
    return "Можно выбрать не более 2 бейджей для одного блюда";
  }
  return null;
}

function normalizeItemType(value, fallback = "item") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  return ALLOWED_ITEM_TYPES.has(normalized) ? normalized : fallback;
}

function normalizeComboComponents(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((row, index) => {
      const componentItemId = Number(row?.component_item_id);
      const componentVariantId = Number(row?.component_variant_id);
      const quantity = Math.max(1, Number.parseInt(row?.quantity, 10) || 1);
      const sortOrder = Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : (index + 1) * 10;
      if (!Number.isInteger(componentItemId) || !Number.isInteger(componentVariantId)) return null;
      return {
        component_item_id: componentItemId,
        component_variant_id: componentVariantId,
        quantity,
        sort_order: sortOrder,
      };
    })
    .filter(Boolean);
}

async function validateComboComponents(connection, comboComponents = []) {
  if (!Array.isArray(comboComponents) || comboComponents.length === 0) {
    return { valid: false, error: "Для комбо необходимо выбрать хотя бы один вариант блюда" };
  }

  const variantIds = [...new Set(comboComponents.map((component) => Number(component.component_variant_id)).filter(Number.isInteger))];
  const itemIds = [...new Set(comboComponents.map((component) => Number(component.component_item_id)).filter(Number.isInteger))];
  if (variantIds.length !== comboComponents.length) {
    return { valid: false, error: "В составе комбо обнаружены дубли вариантов" };
  }

  const [variantRows] = await connection.query(
    `SELECT iv.id, iv.item_id
     FROM item_variants iv
     JOIN menu_items mi ON mi.id = iv.item_id
     WHERE iv.id IN (${variantIds.map(() => "?").join(",")})
       AND iv.is_active = TRUE
       AND mi.is_active = TRUE`,
    variantIds,
  );
  if (variantRows.length !== variantIds.length) {
    return { valid: false, error: "Один или несколько выбранных вариантов недоступны" };
  }

  const [itemRows] = await connection.query(
    `SELECT id
     FROM menu_items
     WHERE id IN (${itemIds.map(() => "?").join(",")})
       AND is_active = TRUE`,
    itemIds,
  );
  if (itemRows.length !== itemIds.length) {
    return { valid: false, error: "Одна или несколько позиций состава недоступны" };
  }

  const itemByVariantId = new Map(variantRows.map((row) => [Number(row.id), Number(row.item_id)]));
  for (const component of comboComponents) {
    const mappedItemId = itemByVariantId.get(Number(component.component_variant_id));
    if (!mappedItemId || mappedItemId !== Number(component.component_item_id)) {
      return { valid: false, error: "Вариант должен принадлежать выбранному блюду в составе комбо" };
    }
  }

  return { valid: true };
}

async function replaceComboComponents(connection, comboItemId, comboComponents = []) {
  await connection.query("DELETE FROM menu_combo_components WHERE combo_item_id = ?", [comboItemId]);
  if (!Array.isArray(comboComponents) || comboComponents.length === 0) return;

  for (const component of comboComponents) {
    await connection.query(
      `INSERT INTO menu_combo_components (combo_item_id, component_item_id, component_variant_id, quantity, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [comboItemId, component.component_item_id, component.component_variant_id, component.quantity, component.sort_order],
    );
  }
}

async function getComboComponents(itemId, connection = db) {
  const [rows] = await connection.query(
    `SELECT mcc.id,
            mcc.combo_item_id,
            mcc.component_item_id,
            mcc.component_variant_id,
            mcc.quantity,
            mcc.sort_order,
            mi.name AS component_item_name,
            iv.name AS component_variant_name,
            iv.image_url AS component_variant_image_url
     FROM menu_combo_components mcc
     JOIN menu_items mi ON mi.id = mcc.component_item_id
     JOIN item_variants iv ON iv.id = mcc.component_variant_id
     WHERE mcc.combo_item_id = ?
     ORDER BY mcc.sort_order, mcc.id`,
    [itemId],
  );
  return rows;
}

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

async function invalidateMenuCacheByCity(cityId) {
  if (!cityId) return;
  try {
    const redis = (await import("../../../config/redis.js")).default;
    const keys = await redis.keys(`menu:*:city:${cityId}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
    notifyMenuUpdated({ source: "admin", scope: "city", cityId: Number(cityId) || null });
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
      is_new,
      is_hit,
      is_spicy,
      is_vegetarian,
      is_piquant,
      is_value,
      item_type,
      bonus_spend_allowed,
      bonus_earn_allowed,
      category_ids,
      tag_ids,
      city_ids,
      prices,
      combo_components,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "name is required",
      });
    }

    const desiredIsNew = is_new !== undefined ? toBool(is_new, false) : null;
    const desiredIsHit = is_hit !== undefined ? toBool(is_hit, false) : null;
    const desiredIsSpicy = toBool(is_spicy, false);
    const desiredIsVegetarian = toBool(is_vegetarian, false);
    const desiredIsPiquant = toBool(is_piquant, false);
    const desiredIsValue = toBool(is_value, false);
    const normalizedItemType = normalizeItemType(item_type, "item");
    const normalizedBonusSpendAllowed = toBool(bonus_spend_allowed, true);
    const normalizedBonusEarnAllowed = toBool(bonus_earn_allowed, true);
    const normalizedComboComponents = normalizeComboComponents(combo_components);

    const badgeLimitError = validateBadgesLimit({
      isNewEnabled: desiredIsNew || false,
      isHitEnabled: desiredIsHit || false,
      isSpicyEnabled: desiredIsSpicy,
      isVegetarianEnabled: desiredIsVegetarian,
      isPiquantEnabled: desiredIsPiquant,
      isValueEnabled: desiredIsValue,
    });
    if (badgeLimitError) {
      return res.status(400).json({ error: badgeLimitError });
    }

    const createTime = new Date();
    const isNewAutoActive = isNewAutoActiveByCreatedAt(createTime);
    const effectiveIsNew = desiredIsNew === null ? isNewAutoActive : desiredIsNew;
    const effectiveIsHit = desiredIsHit === null ? false : desiredIsHit;

    const effectiveBadgeLimitError = validateBadgesLimit({
      isNewEnabled: effectiveIsNew,
      isHitEnabled: effectiveIsHit,
      isSpicyEnabled: desiredIsSpicy,
      isVegetarianEnabled: desiredIsVegetarian,
      isPiquantEnabled: desiredIsPiquant,
      isValueEnabled: desiredIsValue,
    });
    if (effectiveBadgeLimitError) {
      return res.status(400).json({ error: effectiveBadgeLimitError });
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
          sort_order, is_active, is_new, is_hit, is_spicy, is_vegetarian, is_piquant, is_value,
          item_type, bonus_spend_allowed, bonus_earn_allowed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          desiredIsNew === null ? null : desiredIsNew ? 1 : 0,
          desiredIsHit === null ? null : desiredIsHit ? 1 : 0,
          desiredIsSpicy ? 1 : 0,
          desiredIsVegetarian ? 1 : 0,
          desiredIsPiquant ? 1 : 0,
          desiredIsValue ? 1 : 0,
          normalizedItemType,
          normalizedBonusSpendAllowed ? 1 : 0,
          normalizedBonusEarnAllowed ? 1 : 0,
        ],
      );

      const itemId = result.insertId;

      if (normalizedItemType === "combo") {
        const comboValidation = await validateComboComponents(connection, normalizedComboComponents);
        if (!comboValidation.valid) {
          const validationError = new Error(comboValidation.error);
          validationError.status = 400;
          throw validationError;
        }
        await replaceComboComponents(connection, itemId, normalizedComboComponents);
      }

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
                is_new, is_hit, is_spicy, is_vegetarian, is_piquant, is_value, item_type, bonus_spend_allowed, bonus_earn_allowed,
                created_at, updated_at
         FROM menu_items WHERE id = ?`,
        [itemId],
      );

      if (normalizedItemType === "combo") {
        newItem[0].combo_components = await getComboComponents(itemId, connection);
      } else {
        newItem[0].combo_components = [];
      }

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
    const allowedSources = new Set(["local", "iiko"]);
    const defaultSource = integration.iikoEnabled ? "iiko" : "local";
    const requestedSource = String(req.query.source || "")
      .trim()
      .toLowerCase();
    const source = allowedSources.has(requestedSource) ? requestedSource : defaultSource;
    const sourceWhere =
      source === "iiko"
        ? "WHERE COALESCE(NULLIF(TRIM(mi.iiko_item_id), ''), NULL) IS NOT NULL OR mi.item_type = 'combo'"
        : "WHERE COALESCE(NULLIF(TRIM(mi.iiko_item_id), ''), NULL) IS NULL";

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
        mi.is_new,
        mi.is_hit,
        mi.is_spicy,
        mi.is_vegetarian,
        mi.is_piquant,
        mi.is_value,
        mi.item_type,
        mi.bonus_spend_allowed,
        mi.bonus_earn_allowed,
        mi.created_at, 
        mi.updated_at
      FROM menu_items mi
      ${sourceWhere}
      ORDER BY mi.sort_order, mi.name
    `;

    const [items] = await db.query(query);
    const [itemCities] = await db.query(
      `SELECT item_id, city_id
       FROM menu_item_cities
       WHERE is_active = TRUE`,
    );

    const cityIdsByItemId = new Map();
    for (const row of itemCities) {
      const itemId = Number(row.item_id);
      if (!cityIdsByItemId.has(itemId)) {
        cityIdsByItemId.set(itemId, []);
      }
      cityIdsByItemId.get(itemId).push(Number(row.city_id));
    }

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
      item.city_ids = cityIdsByItemId.get(Number(item.id)) || [];
      delete item.legacy_price;
    }

    res.json({
      items,
      meta: {
        source,
        default_source: defaultSource,
      },
    });
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
        mi.is_new,
        mi.is_hit,
        mi.is_spicy,
        mi.is_vegetarian,
        mi.is_piquant,
        mi.is_value,
        mi.item_type,
        mi.bonus_spend_allowed,
        mi.bonus_earn_allowed,
        mi.created_at, 
        mi.updated_at
      FROM menu_items mi
      WHERE mi.id = ?`,
      [itemId],
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = items[0];
    const salesCount = await getCompletedSalesCount(item.id);
    const isNewAuto = isNewAutoActiveByCreatedAt(item.created_at);
    const isHitAuto = salesCount >= HIT_BADGE_SALES_THRESHOLD;
    const isNewEnabled = resolveBadgeValue(item.is_new, isNewAuto);
    const isHitEnabled = resolveBadgeValue(item.is_hit, isHitAuto);

    res.json({
      item: {
        ...item,
        is_new: isNewEnabled,
        is_hit: isHitEnabled,
        combo_components: await getComboComponents(itemId),
      },
    });
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
      is_new,
      is_hit,
      is_spicy,
      is_vegetarian,
      is_piquant,
      is_value,
      item_type,
      bonus_spend_allowed,
      bonus_earn_allowed,
      category_ids,
      tag_ids,
      city_ids,
      prices,
      combo_components,
    } = req.body;

    const [items] = await db.query(
      `SELECT id, created_at, is_new, is_hit, is_spicy, is_vegetarian, is_piquant, is_value, item_type, bonus_spend_allowed, bonus_earn_allowed
       FROM menu_items
       WHERE id = ?`,
      [itemId],
    );
    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    const existingItem = items[0];
    const salesCount = await getCompletedSalesCount(itemId);
    const isNewAuto = isNewAutoActiveByCreatedAt(existingItem.created_at);
    const isHitAuto = salesCount >= HIT_BADGE_SALES_THRESHOLD;
    const currentIsNewEffective = resolveBadgeValue(existingItem.is_new, isNewAuto);
    const currentIsHitEffective = resolveBadgeValue(existingItem.is_hit, isHitAuto);
    const desiredIsNew = is_new !== undefined ? toBool(is_new) : currentIsNewEffective;
    const desiredIsHit = is_hit !== undefined ? toBool(is_hit) : currentIsHitEffective;
    const desiredIsSpicy = is_spicy !== undefined ? toBool(is_spicy) : toBool(existingItem.is_spicy);
    const desiredIsVegetarian = is_vegetarian !== undefined ? toBool(is_vegetarian) : toBool(existingItem.is_vegetarian);
    const desiredIsPiquant = is_piquant !== undefined ? toBool(is_piquant) : toBool(existingItem.is_piquant);
    const desiredIsValue = is_value !== undefined ? toBool(is_value) : toBool(existingItem.is_value);
    const desiredItemType = item_type !== undefined ? normalizeItemType(item_type, "item") : normalizeItemType(existingItem.item_type, "item");
    const desiredBonusSpendAllowed =
      bonus_spend_allowed !== undefined ? toBool(bonus_spend_allowed, true) : toBool(existingItem.bonus_spend_allowed, true);
    const desiredBonusEarnAllowed =
      bonus_earn_allowed !== undefined ? toBool(bonus_earn_allowed, true) : toBool(existingItem.bonus_earn_allowed, true);
    const normalizedComboComponents = normalizeComboComponents(combo_components);

    const badgeLimitError = validateBadgesLimit({
      isNewEnabled: desiredIsNew,
      isHitEnabled: desiredIsHit,
      isSpicyEnabled: desiredIsSpicy,
      isVegetarianEnabled: desiredIsVegetarian,
      isPiquantEnabled: desiredIsPiquant,
      isValueEnabled: desiredIsValue,
    });
    if (badgeLimitError) {
      return res.status(400).json({ error: badgeLimitError });
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
    if (is_new !== undefined) {
      updates.push("is_new = ?");
      values.push(desiredIsNew ? 1 : 0);
    }
    if (is_hit !== undefined) {
      updates.push("is_hit = ?");
      values.push(desiredIsHit ? 1 : 0);
    }
    if (is_spicy !== undefined) {
      updates.push("is_spicy = ?");
      values.push(desiredIsSpicy ? 1 : 0);
    }
    if (is_vegetarian !== undefined) {
      updates.push("is_vegetarian = ?");
      values.push(desiredIsVegetarian ? 1 : 0);
    }
    if (is_piquant !== undefined) {
      updates.push("is_piquant = ?");
      values.push(desiredIsPiquant ? 1 : 0);
    }
    if (is_value !== undefined) {
      updates.push("is_value = ?");
      values.push(desiredIsValue ? 1 : 0);
    }
    if (item_type !== undefined) {
      updates.push("item_type = ?");
      values.push(desiredItemType);
    }
    if (bonus_spend_allowed !== undefined) {
      updates.push("bonus_spend_allowed = ?");
      values.push(desiredBonusSpendAllowed ? 1 : 0);
    }
    if (bonus_earn_allowed !== undefined) {
      updates.push("bonus_earn_allowed = ?");
      values.push(desiredBonusEarnAllowed ? 1 : 0);
    }

    const hasComboPayload = combo_components !== undefined;
    if (updates.length === 0 && !hasComboPayload) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      if (updates.length > 0) {
        values.push(itemId);
        await connection.query(`UPDATE menu_items SET ${updates.join(", ")} WHERE id = ?`, values);
      }

      const shouldUpdateComboComponents = combo_components !== undefined || item_type !== undefined;
      if (desiredItemType === "combo" && shouldUpdateComboComponents) {
        const comboValidation = await validateComboComponents(connection, normalizedComboComponents);
        if (!comboValidation.valid) {
          const validationError = new Error(comboValidation.error);
          validationError.status = 400;
          throw validationError;
        }
        await replaceComboComponents(connection, itemId, normalizedComboComponents);
      } else if (desiredItemType !== "combo" && shouldUpdateComboComponents) {
        await replaceComboComponents(connection, itemId, []);
      }

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
                is_new, is_hit, is_spicy, is_vegetarian, is_piquant, is_value, item_type, bonus_spend_allowed, bonus_earn_allowed,
                created_at, updated_at
         FROM menu_items WHERE id = ?`,
        [itemId],
      );

      if (desiredItemType === "combo") {
        updatedItem[0].combo_components = await getComboComponents(itemId, connection);
      } else {
        updatedItem[0].combo_components = [];
      }

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
