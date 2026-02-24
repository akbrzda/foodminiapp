import db from "../../../../config/database.js";

export const ACTIVE_ORDER_STATUSES = ["confirmed", "preparing", "ready", "delivering", "completed"];

export const getUserItemStats = async (userId) => {
  if (!userId) return { itemStats: new Map(), categoryStats: new Map() };

  const [itemRows] = await db.query(
    `SELECT oi.item_id, COUNT(*) AS cnt
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ?
       AND oi.item_id IS NOT NULL
       AND o.status IN (${ACTIVE_ORDER_STATUSES.map(() => "?").join(", ")})
     GROUP BY oi.item_id`,
    [userId, ...ACTIVE_ORDER_STATUSES],
  );

  const [categoryRows] = await db.query(
    `SELECT mic.category_id, COUNT(*) AS cnt
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN menu_item_categories mic ON mic.item_id = oi.item_id
     WHERE o.user_id = ?
       AND oi.item_id IS NOT NULL
       AND o.status IN (${ACTIVE_ORDER_STATUSES.map(() => "?").join(", ")})
     GROUP BY mic.category_id`,
    [userId, ...ACTIVE_ORDER_STATUSES],
  );

  return {
    itemStats: new Map(itemRows.map((row) => [Number(row.item_id), Number(row.cnt) || 0])),
    categoryStats: new Map(categoryRows.map((row) => [Number(row.category_id), Number(row.cnt) || 0])),
  };
};

export const getCartAssociationStats = async (cartItemIds) => {
  if (cartItemIds.length === 0) return new Map();

  const placeholders = cartItemIds.map(() => "?").join(", ");
  const statusPlaceholders = ACTIVE_ORDER_STATUSES.map(() => "?").join(", ");
  const [rows] = await db.query(
    `SELECT oi2.item_id, COUNT(*) AS cnt
     FROM order_items oi1
     JOIN order_items oi2 ON oi2.order_id = oi1.order_id
     JOIN orders o ON o.id = oi1.order_id
     WHERE oi1.item_id IN (${placeholders})
       AND oi2.item_id IS NOT NULL
       AND oi2.item_id NOT IN (${placeholders})
       AND o.status IN (${statusPlaceholders})
     GROUP BY oi2.item_id`,
    [...cartItemIds, ...cartItemIds, ...ACTIVE_ORDER_STATUSES],
  );

  return new Map(rows.map((row) => [Number(row.item_id), Number(row.cnt) || 0]));
};

export const getCartCategoryIds = async (cartItemIds) => {
  if (cartItemIds.length === 0) return new Set();

  const [rows] = await db.query(
    `SELECT DISTINCT category_id
     FROM menu_item_categories
     WHERE item_id IN (${cartItemIds.map(() => "?").join(", ")})`,
    cartItemIds,
  );

  return new Set(rows.map((row) => Number(row.category_id)).filter(Number.isInteger));
};

export const getCandidates = async ({ cityId, branchId, fulfillmentType, cartItemIds }) => {
  const params = [cityId, cityId, fulfillmentType, cityId, fulfillmentType];

  let cartExclusionSql = "";
  if (cartItemIds.length > 0) {
    cartExclusionSql = `AND mi.id NOT IN (${cartItemIds.map(() => "?").join(", ")})`;
    params.push(...cartItemIds);
  }

  let itemStopListSql = "";
  if (branchId) {
    itemStopListSql = `AND NOT EXISTS (
      SELECT 1 FROM menu_stop_list sl
      WHERE sl.branch_id = ?
        AND sl.entity_type = 'item'
        AND sl.entity_id = mi.id
        AND (sl.remove_at IS NULL OR sl.remove_at > NOW())
        AND (sl.fulfillment_types IS NULL OR JSON_CONTAINS(sl.fulfillment_types, JSON_QUOTE(?)))
    )`;
    params.push(branchId, fulfillmentType);
  }

  const [rows] = await db.query(
    `SELECT
       mi.id,
       mi.name,
       mi.description,
       mi.image_url,
       mcx.category_id,
       COALESCE(mip.price, mvp_min.min_variant_price) AS min_price,
       COALESCE(vs.has_variants, 0) AS has_variants,
       COALESCE(req.required_groups, 0) AS required_groups
     FROM menu_items mi
     JOIN menu_item_cities mic ON mic.item_id = mi.id AND mic.city_id = ? AND mic.is_active = TRUE
     LEFT JOIN menu_item_prices mip ON mip.item_id = mi.id AND mip.city_id = ? AND mip.fulfillment_type = ?
     LEFT JOIN (
       SELECT iv.item_id, MIN(mvp.price) AS min_variant_price
       FROM item_variants iv
       JOIN menu_variant_prices mvp ON mvp.variant_id = iv.id
       WHERE iv.is_active = TRUE AND mvp.city_id = ? AND mvp.fulfillment_type = ?
       GROUP BY iv.item_id
     ) mvp_min ON mvp_min.item_id = mi.id
     LEFT JOIN (
       SELECT item_id, MIN(category_id) AS category_id
       FROM menu_item_categories
       GROUP BY item_id
     ) mcx ON mcx.item_id = mi.id
     LEFT JOIN (
       SELECT item_id, 1 AS has_variants
       FROM item_variants
       WHERE is_active = TRUE
       GROUP BY item_id
     ) vs ON vs.item_id = mi.id
     LEFT JOIN (
       SELECT img.item_id, COUNT(*) AS required_groups
       FROM item_modifier_groups img
       JOIN modifier_groups mg ON mg.id = img.modifier_group_id
       WHERE mg.is_active = TRUE AND mg.is_required = TRUE
       GROUP BY img.item_id
     ) req ON req.item_id = mi.id
     WHERE mi.is_active = TRUE
       AND (mip.price IS NOT NULL OR mvp_min.min_variant_price IS NOT NULL)
       ${cartExclusionSql}
       ${itemStopListSql}
     LIMIT 120`,
    params,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    category_id: row.category_id === null ? null : Number(row.category_id),
    min_price: Number(row.min_price),
    has_variants: Number(row.has_variants) === 1,
    has_required_modifiers: Number(row.required_groups) > 0,
  }));
};

export const getPreferredVariants = async ({ itemIds, cityId, fulfillmentType, branchId = null }) => {
  if (itemIds.length === 0) return new Map();

  const params = [cityId, fulfillmentType, ...itemIds];
  let variantStopListSql = "";

  if (branchId) {
    variantStopListSql = `AND NOT EXISTS (
      SELECT 1 FROM menu_stop_list sl
      WHERE sl.branch_id = ?
        AND sl.entity_type = 'variant'
        AND sl.entity_id = iv.id
        AND (sl.remove_at IS NULL OR sl.remove_at > NOW())
        AND (sl.fulfillment_types IS NULL OR JSON_CONTAINS(sl.fulfillment_types, JSON_QUOTE(?)))
    )`;
    params.push(branchId, fulfillmentType);
  }

  const [rows] = await db.query(
    `SELECT item_id, variant_id, variant_name, price, image_url
     FROM (
       SELECT
         iv.item_id,
         iv.id AS variant_id,
         iv.name AS variant_name,
         mvp.price,
         iv.image_url,
         ROW_NUMBER() OVER (PARTITION BY iv.item_id ORDER BY mvp.price ASC, iv.id ASC) AS rn
       FROM item_variants iv
       JOIN menu_variant_prices mvp ON mvp.variant_id = iv.id
       WHERE iv.is_active = TRUE
         AND mvp.city_id = ?
         AND mvp.fulfillment_type = ?
         AND iv.item_id IN (${itemIds.map(() => "?").join(", ")})
         ${variantStopListSql}
     ) ranked
     WHERE rn = 1`,
    params,
  );

  const map = new Map();
  rows.forEach((row) => {
    map.set(Number(row.item_id), {
      variant_id: Number(row.variant_id),
      variant_name: row.variant_name,
      price: Number(row.price),
      image_url: row.image_url || null,
    });
  });

  return map;
};
