// Вспомогательные функции для работы с категориями цен

/**
 * Получить маппинг категорий цен из settings
 * @param {Object} integrationSettings - настройки интеграции
 * @returns {Object} Маппинг типов заказов на category IDs: { delivery: id, pickup: id, dine_in: id }
 */
export function getPriceCategoryMapping(integrationSettings) {
  try {
    const mapping = integrationSettings?.iikoPriceCategoriesMapping;
    if (!mapping || typeof mapping !== "object") {
      return {};
    }

    // Валидируем структуру
    const result = {};
    for (const [fulfillmentType, categoryId] of Object.entries(mapping)) {
      if (categoryId && String(categoryId).trim()) {
        result[fulfillmentType] = String(categoryId).trim();
      }
    }
    return result;
  } catch (error) {
    console.error("Ошибка получения маппинга категорий цен:", error);
    return {};
  }
}

/**
 * Получить категории цен, которые нужно синхронизировать
 * @param {Object} iikoClient - клиент IIKO
 * @param {Object} mapping - маппинг типов заказов на category IDs
 * @returns {Promise<Array>} Массив объектов { id, name, fulfillmentTypes: ['delivery', 'pickup'] }
 */
export async function getCategoriesToSync(iikoClient, mapping) {
  try {
    if (!Object.keys(mapping).length) {
      return null; // Используем старую логику с одной категорией
    }

    const priceCategories = await iikoClient.getAvailablePriceCategories();
    if (!Array.isArray(priceCategories) || priceCategories.length === 0) {
      console.warn("Не получены категории цен от iiko");
      return null;
    }

    // Маппим категории к типам заказов
    const categoryMap = new Map();
    for (const [fulfillmentType, categoryId] of Object.entries(mapping)) {
      const category = priceCategories.find((c) => c.id === categoryId);
      if (!category) {
        console.warn(`Категория ${categoryId} не найдена в iiko для типа ${fulfillmentType}`);
        continue;
      }

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          id: categoryId,
          name: category.name,
          fulfillmentTypes: [],
        });
      }
      categoryMap.get(categoryId).fulfillmentTypes.push(fulfillmentType);
    }

    return Array.from(categoryMap.values());
  } catch (error) {
    console.error("Ошибка получения категорий цен для синхронизации:", error);
    return null;
  }
}

/**
 * Слить данные меню из разных категорий цен
 * Объединить items и variants с указанием категории цены для каждого
 * @param {Array} menuPayloads - [{ categoryId, name, payload }, ...]
 * @returns {Object} { items, variants, categoryMap }
 */
export function mergeMenuPayloadsByCategories(menuPayloads) {
  const itemsByIikoId = new Map(); // iiko_item_id -> { item, categories: [{ id, name, fulfillmentTypes }] }
  const variantsByIikoId = new Map();

  for (const { categoryId, name: categoryName, payload, fulfillmentTypes } of menuPayloads) {
    const menuCategories = Array.isArray(payload?.itemCategories) ? payload.itemCategories : [];

    for (const category of menuCategories) {
      const categoryItems = Array.isArray(category?.items) ? category.items : [];

      for (const item of categoryItems) {
        const itemId = String(item?.id || item?.itemId || item?.productId || "").trim();
        if (!itemId) continue;

        if (!itemsByIikoId.has(itemId)) {
          itemsByIikoId.set(itemId, { item, categories: [] });
        }

        itemsByIikoId.get(itemId).categories.push({
          id: categoryId,
          name: categoryName,
          fulfillmentTypes,
        });

        // Обработка вариантов размеров
        const itemSizes = Array.isArray(item?.itemSizes) ? item.itemSizes : [];
        for (const size of itemSizes) {
          const variantId = String(
            size?.sizeId || size?.id || `${itemId}_${itemSizes.indexOf(size)}`
          ).trim();
          if (!variantId) continue;

          if (!variantsByIikoId.has(variantId)) {
            variantsByIikoId.set(variantId, { variant: size, itemId, categories: [] });
          }

          variantsByIikoId.get(variantId).categories.push({
            id: categoryId,
            name: categoryName,
            fulfillmentTypes,
          });
        }
      }
    }
  }

  return {
    items: itemsByIikoId,
    variants: variantsByIikoId,
  };
}
