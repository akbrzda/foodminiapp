import db from "../../../../config/database.js";

/**
 * Сервис для управления категориями цен из iiko CloudAPI
 * Отвечает за кэширование и получение доступных категорий цен
 */
export class IikoPriceCategoriesService {
  /**
   * Получить все доступные категории цен из iiko
   * @param {Object} iikoClient - клиент iiko API
   * @returns {Promise<Array>} массив категорий цен
   */
  async fetchAvailablePriceCategories(iikoClient) {
    try {
      const response = await iikoClient.getAvailablePriceCategories();
      const categories = Array.isArray(response?.priceCategories) ? response.priceCategories : [];

      // Сохранить/обновить категории в БД
      for (const category of categories) {
        const categoryId = String(category.id || category.externalId || "").trim();
        const categoryName = String(category.name || category.title || "").trim() || categoryId;

        if (!categoryId) continue;

        await db.query(
          `INSERT INTO iiko_price_categories (iiko_category_id, name, is_active, last_synced_at)
           VALUES (?, ?, 1, NOW())
           ON DUPLICATE KEY UPDATE 
             name = VALUES(name),
             is_active = 1,
             last_synced_at = NOW()`,
          [categoryId, categoryName]
        );
      }

      return categories;
    } catch (error) {
      console.error("Ошибка при получении категорий цен из iiko:", error);
      throw error;
    }
  }

  /**
   * Получить кэшированные категории цен
   * @returns {Promise<Array>} массив категорий из БД
   */
  async getCachedPriceCategories() {
    const [categories] = await db.query(
      `SELECT iiko_category_id as id, name, description, is_active, last_synced_at
       FROM iiko_price_categories
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    return categories || [];
  }

  /**
   * Получить маппинг типов заказов к категориям цен из настроек
   * @param {Object} settings - настройки интеграции
   * @returns {Object} маппинг типов заказов к ID категорий
   */
  getPriceCategoryMapping(settings) {
    const mapping = {
      delivery: null,
      pickup: null,
      dine_in: null,
    };

    if (
      settings.iikoPriceCategoriesMapping &&
      typeof settings.iikoPriceCategoriesMapping === "object"
    ) {
      return { ...mapping, ...settings.iikoPriceCategoriesMapping };
    }

    return mapping;
  }

  /**
   * Получить ID категории цен для типа заказа
   * @param {string} fulfillmentType - тип заказа (delivery/pickup/dine_in)
   * @param {Object} settings - настройки интеграции
   * @returns {string|null} ID категории или null
   */
  getPriceCategoryIdForFulfillment(fulfillmentType, settings) {
    const mapping = this.getPriceCategoryMapping(settings);
    return mapping[fulfillmentType] || null;
  }

  /**
   * Получить название категории по ID
   * @param {string} categoryId - ID категории
   * @returns {Promise<string|null>} название категории или null
   */
  async getPriceCategoryName(categoryId) {
    if (!categoryId) return null;

    const [result] = await db.query(
      `SELECT name FROM iiko_price_categories WHERE iiko_category_id = ? LIMIT 1`,
      [categoryId]
    );

    return result && result.length > 0 ? result[0].name : null;
  }

  /**
   * Валидировать конфигурацию маппинга категорий
   * @param {Object} mapping - маппинг для валидации
   * @param {Array} availableCategories - доступные категории из iiko
   * @returns {Object} результат валидации {valid: boolean, errors: []}
   */
  validatePriceCategoryMapping(mapping, availableCategories) {
    const errors = [];
    const availableIds = new Set(
      availableCategories.map((c) => String(c.id || c.externalId || "").trim())
    );

    for (const [orderType, categoryId] of Object.entries(mapping)) {
      if (categoryId && !availableIds.has(String(categoryId).trim())) {
        errors.push(`Категория '${categoryId}' для типа '${orderType}' не найдена в iiko`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Сохранить цену товара с категорией
   * @param {number} itemId - ID товара
   * @param {number} cityId - ID города
   * @param {string} fulfillmentType - тип доставки
   * @param {string} priceCategoryId - ID категории цен
   * @param {string} priceCategoryName - название категории цен
   * @param {number} price - цена
   * @returns {Promise<void>}
   */
  async savePriceWithCategory(
    itemId,
    cityId,
    fulfillmentType,
    priceCategoryId,
    priceCategoryName,
    price
  ) {
    await db.query(
      `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price_category_id, price_category_name, price, iiko_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         price = VALUES(price),
         price_category_name = VALUES(price_category_name),
         iiko_synced_at = NOW()`,
      [itemId, cityId, fulfillmentType, priceCategoryId, priceCategoryName, price]
    );
  }

  /**
   * Сохранить цену варианта товара с категорией
   * @param {number} variantId - ID варианта
   * @param {number} cityId - ID города
   * @param {string} fulfillmentType - тип доставки
   * @param {string} priceCategoryId - ID категории цен
   * @param {string} priceCategoryName - название категории цен
   * @param {number} price - цена
   * @returns {Promise<void>}
   */
  async saveVariantPriceWithCategory(
    variantId,
    cityId,
    fulfillmentType,
    priceCategoryId,
    priceCategoryName,
    price
  ) {
    await db.query(
      `INSERT INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price_category_id, price_category_name, price, iiko_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         price = VALUES(price),
         price_category_name = VALUES(price_category_name),
         iiko_synced_at = NOW()`,
      [variantId, cityId, fulfillmentType, priceCategoryId, priceCategoryName, price]
    );
  }

  /**
   * Получить цену товара для конкретного типа доставки и категории
   * @param {number} itemId - ID товара
   * @param {number} cityId - ID города
   * @param {string} fulfillmentType - тип доставки
   * @param {string} priceCategoryId - ID категории цен (опционально)
   * @returns {Promise<number|null>} цена или null
   */
  async getItemPrice(itemId, cityId, fulfillmentType, priceCategoryId = null) {
    let query = `
      SELECT price FROM menu_item_prices
      WHERE item_id = ? AND city_id = ? AND fulfillment_type = ?
    `;
    const params = [itemId, cityId, fulfillmentType];

    if (priceCategoryId) {
      query += ` AND price_category_id = ?`;
      params.push(priceCategoryId);
      query += ` LIMIT 1`;
    } else {
      // Если категория не указана, получить первую найденную цену
      query += ` ORDER BY price_category_id DESC LIMIT 1`;
    }

    const [result] = await db.query(query, params);
    return result && result.length > 0 ? result[0].price : null;
  }

  /**
   * Получить цену варианта товара
   * @param {number} variantId - ID варианта
   * @param {number} cityId - ID города
   * @param {string} fulfillmentType - тип доставки
   * @param {string} priceCategoryId - ID категории цен (опционально)
   * @returns {Promise<number|null>} цена или null
   */
  async getVariantPrice(variantId, cityId, fulfillmentType, priceCategoryId = null) {
    let query = `
      SELECT price FROM menu_variant_prices
      WHERE variant_id = ? AND city_id = ? AND fulfillment_type = ?
    `;
    const params = [variantId, cityId, fulfillmentType];

    if (priceCategoryId) {
      query += ` AND price_category_id = ?`;
      params.push(priceCategoryId);
      query += ` LIMIT 1`;
    } else {
      query += ` ORDER BY price_category_id DESC LIMIT 1`;
    }

    const [result] = await db.query(query, params);
    return result && result.length > 0 ? result[0].price : null;
  }

  /**
   * Очистить цены для товара при переходе на новую категорию
   * @param {number} itemId - ID товара
   * @param {number|null} cityId - ID города (опционально, если null — очищает для всех городов)
   * @returns {Promise<void>}
   */
  async clearItemPrices(itemId, cityId = null) {
    if (cityId) {
      await db.query(`DELETE FROM menu_item_prices WHERE item_id = ? AND city_id = ?`, [
        itemId,
        cityId,
      ]);
    } else {
      await db.query(`DELETE FROM menu_item_prices WHERE item_id = ?`, [itemId]);
    }
  }

  /**
   * Очистить цены для варианта товара
   * @param {number} variantId - ID варианта
   * @param {number|null} cityId - ID города (опционально)
   * @returns {Promise<void>}
   */
  async clearVariantPrices(variantId, cityId = null) {
    if (cityId) {
      await db.query(`DELETE FROM menu_variant_prices WHERE variant_id = ? AND city_id = ?`, [
        variantId,
        cityId,
      ]);
    } else {
      await db.query(`DELETE FROM menu_variant_prices WHERE variant_id = ?`, [variantId]);
    }
  }
}

export default new IikoPriceCategoriesService();
