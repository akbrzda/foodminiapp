import db from "../../../config/database.js";
import { getPriceCategoryMapping } from "../../integrations/utils/priceCategoryHelper.js";
import { getIntegrationSettings } from "../../integrations/services/integrationConfigService.js";

/**
 * Получить категорию цены для типа заказа
 * @param {string} fulfillmentType - delivery, pickup, dine_in
 * @param {Object} priceCategoryMapping - маппинг типов заказов на category IDs
 * @returns {string|null} ID категории цены или null
 */
function getPriceCategoryIdForFulfillment(fulfillmentType, priceCategoryMapping) {
  if (!fulfillmentType || !priceCategoryMapping) return null;
  return priceCategoryMapping[fulfillmentType] || null;
}

/**
 * Получить цену товара с учетом типа заказа и категории цены
 * @param {number} itemId - ID товара
 * @param {number} cityId - ID города
 * @param {string} fulfillmentType - delivery, pickup, dine_in
 * @param {Object} priceCategoryMapping - маппинг типов заказов на category IDs или null
 * @returns {Promise<number|null>} Цена или null
 */
export async function getItemPriceByFulfillmentType(
  itemId,
  cityId,
  fulfillmentType,
  priceCategoryMapping = null
) {
  if (!fulfillmentType) {
    fulfillmentType = "delivery"; // default
  }

  const priceCategoryId = getPriceCategoryIdForFulfillment(fulfillmentType, priceCategoryMapping);

  if (priceCategoryId) {
    // Получить цену для конкретной категории
    const [prices] = await db.query(
      `SELECT price FROM menu_item_prices
       WHERE item_id = ?
         AND city_id = ?
         AND fulfillment_type = ?
         AND price_category_id = ?
       LIMIT 1`,
      [itemId, cityId, fulfillmentType, priceCategoryId]
    );
    if (prices.length > 0) {
      return prices[0].price;
    }
  } else {
    // Получить цену без категории (для обратной совместимости)
    const [prices] = await db.query(
      `SELECT price FROM menu_item_prices
       WHERE item_id = ?
         AND city_id = ?
         AND fulfillment_type = ?
         AND (price_category_id IS NULL OR price_category_id = '')
       LIMIT 1`,
      [itemId, cityId, fulfillmentType]
    );
    if (prices.length > 0) {
      return prices[0].price;
    }
  }

  return null;
}

/**
 * Получить цену варианта с учетом типа заказа и категории цены
 * @param {number} variantId - ID варианта
 * @param {number} cityId - ID города
 * @param {string} fulfillmentType - delivery, pickup, dine_in
 * @param {Object} priceCategoryMapping - маппинг типов заказов на category IDs или null
 * @returns {Promise<number|null>} Цена или null
 */
export async function getVariantPriceByFulfillmentType(
  variantId,
  cityId,
  fulfillmentType,
  priceCategoryMapping = null
) {
  if (!fulfillmentType) {
    fulfillmentType = "delivery"; // default
  }

  const priceCategoryId = getPriceCategoryIdForFulfillment(fulfillmentType, priceCategoryMapping);

  if (priceCategoryId) {
    // Получить цену для конкретной категории
    const [prices] = await db.query(
      `SELECT price FROM menu_variant_prices
       WHERE variant_id = ?
         AND city_id = ?
         AND fulfillment_type = ?
         AND price_category_id = ?
       LIMIT 1`,
      [variantId, cityId, fulfillmentType, priceCategoryId]
    );
    if (prices.length > 0) {
      return prices[0].price;
    }
  } else {
    // Получить цену без категории (для обратной совместимости)
    const [prices] = await db.query(
      `SELECT price FROM menu_variant_prices
       WHERE variant_id = ?
         AND city_id = ?
         AND fulfillment_type = ?
         AND (price_category_id IS NULL OR price_category_id = '')
       LIMIT 1`,
      [variantId, cityId, fulfillmentType]
    );
    if (prices.length > 0) {
      return prices[0].price;
    }
  }

  return null;
}

/**
 * Получить маппинг категорий цен для использования в контроллерах
 * @returns {Promise<Object|null>} Маппинг или null если категории не настроены
 */
export async function getPriceCategoryMappingForContext() {
  try {
    const integrationSettings = await getIntegrationSettings();
    const mapping = getPriceCategoryMapping(integrationSettings);
    return Object.keys(mapping).length > 0 ? mapping : null;
  } catch (error) {
    console.error("Ошибка получения маппинга категорий цен:", error);
    return null;
  }
}
