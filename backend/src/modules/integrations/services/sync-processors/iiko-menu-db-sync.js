import db from "../../../../config/database.js";
import { getIikoClientOrNull, getIntegrationSettings } from "../integrationConfigService.js";
import { INTEGRATION_MODULE, INTEGRATION_TYPE } from "../../constants.js";
import { finishIntegrationEvent, startIntegrationEvent } from "../integrationLoggerService.js";
import { notifyMenuUpdated } from "../../../../websocket/runtime.js";
import iikoPriceCategoriesService from "../iikoPriceCategoriesService.js";
import {
  getPriceCategoryMapping,
  getCategoriesToSync,
  mergeMenuPayloadsByCategories,
} from "../../utils/priceCategoryHelper.js";
import {
  calcServingNutrition,
  extractIikoItemCategoryIds,
  extractModifierPrice,
  firstNonEmptyString,
  invalidatePublicMenuCache,
  normalizeBooleanFlag,
  normalizeDisplayName,
  normalizeIikoId,
  normalizeModifierGroupSelections,
  normalizeModifierGroupType,
  normalizeWeightUnit,
  normalizeWeightValue,
  resolveIikoPriceFromRows,
  resolveImageUrl,
  toLookupKey,
  toNumberOrNull,
} from "./iiko-menu.helpers.js";

export async function processIikoMenuSync(reason = "manual", cityId = null) {
  const client = await getIikoClientOrNull();
  if (!client) throw new Error("Клиент iiko недоступен");
  const integrationSettings = await getIntegrationSettings();

  // Синхронизировать доступные категории цен из iiko
  await iikoPriceCategoriesService.fetchAvailablePriceCategories(client);

  const selectedCategoryIds = new Set(
    (integrationSettings.iikoSyncCategoryIds || []).map((id) => String(id).trim()).filter(Boolean)
  );
  const useCategoryFilter = selectedCategoryIds.size > 0;
  const externalMenuId = String(integrationSettings.iikoExternalMenuId || "").trim();
  const priceCategoryId = String(integrationSettings.iikoPriceCategoryId || "").trim();
  const preserveLocalNames = integrationSettings.iikoPreserveLocalNames !== false;
  const useExternalMenuFilter = Boolean(externalMenuId);
  const requestedCityId = Number(cityId);
  const isCityScopedSync = Number.isFinite(requestedCityId) && requestedCityId > 0;
  const canDeactivateMissingExternalItems = !isCityScopedSync;
  if (!useExternalMenuFilter) {
    throw new Error(
      "Не выбран iiko_external_menu_id. Синхронизация меню выполняется через /api/2/menu/by_id."
    );
  }

  const startedAt = Date.now();
  const logId = await startIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.MENU,
    action: "sync_menu",
    requestData: { reason, cityId },
  });

  try {
    // Получаем маппинг категорий цен
    const priceCategoryMapping = getPriceCategoryMapping(integrationSettings);
    const hasMultiplePriceCategories = Object.keys(priceCategoryMapping).length > 0;

    let externalMenuPayload = null;
    let externalMenuItemIds = new Set();
    const externalMenuCategoryIdsByItemId = new Map();
    let externalCategoriesRaw = [];
    let externalItemsRaw = [];
    const itemPriceCategoryMap = new Map(); // itemId -> { categoryId, name, fulfillmentTypes[] }
    const itemPriceRowsByFulfillment = new Map(); // `${itemId}::${fulfillment}` -> { prices, categoryId, categoryName }
    const variantPriceRowsByFulfillment = new Map(); // `${variantId}::${fulfillment}` -> { prices, categoryId, categoryName }
    const priceCategoryNameById = new Map();
    const priceFulfillmentTypes = ["delivery", "pickup"];
    const buildPriceLookupKey = (entityId, fulfillmentType) =>
      `${String(entityId || "").trim()}::${String(fulfillmentType || "").trim()}`;

    if (hasMultiplePriceCategories) {
      // НОВАЯ ЛОГИКА: Получить меню для каждой категории цен
      const categoriesToSync = await getCategoriesToSync(client, priceCategoryMapping);
      const normalizedCategoriesToSync = Array.isArray(categoriesToSync) ? categoriesToSync : [];
      for (const category of normalizedCategoriesToSync) {
        const normalizedCategoryId = normalizeIikoId(category?.id);
        if (!normalizedCategoryId) continue;
        priceCategoryNameById.set(normalizedCategoryId, String(category?.name || "").trim());
      }

      if (categoriesToSync && categoriesToSync.length > 0) {
        // Получить меню для каждой категории
        const menuPayloads = [];
        for (const category of categoriesToSync) {
          try {
            const payload = await client.getMenuById({
              externalMenuId,
              priceCategoryId: category.id,
              useConfiguredOrganization: false,
            });
            menuPayloads.push({
              categoryId: category.id,
              name: category.name,
              payload,
              fulfillmentTypes: category.fulfillmentTypes,
            });
          } catch (error) {
            console.warn(`Ошибка получения меню для категории ${category.id}: ${error.message}`);
          }
        }

        if (menuPayloads.length === 0) {
          throw new Error("Не удалось получить меню ни для одной категории цен");
        }

        for (const payloadEntry of menuPayloads) {
          const normalizedCategoryId = normalizeIikoId(payloadEntry?.categoryId);
          const categoryName = String(payloadEntry?.name || "").trim() || null;
          const fulfillmentTypes = Array.isArray(payloadEntry?.fulfillmentTypes)
            ? payloadEntry.fulfillmentTypes.map((value) => String(value || "").trim()).filter(Boolean)
            : [];
          if (!normalizedCategoryId || fulfillmentTypes.length === 0) continue;

          const itemCategories = Array.isArray(payloadEntry?.payload?.itemCategories)
            ? payloadEntry.payload.itemCategories
            : [];
          for (const itemCategory of itemCategories) {
            const menuItems = Array.isArray(itemCategory?.items) ? itemCategory.items : [];
            for (const menuItem of menuItems) {
              const iikoItemId = normalizeIikoId(
                menuItem?.itemId || menuItem?.id || menuItem?.productId
              );
              if (!iikoItemId) continue;

              const itemSizes = Array.isArray(menuItem?.itemSizes) ? menuItem.itemSizes : [];
              const primarySize = itemSizes[0] || null;
              const itemPrices = Array.isArray(primarySize?.prices) ? primarySize.prices : [];

              for (const fulfillmentType of fulfillmentTypes) {
                const itemPriceKey = buildPriceLookupKey(iikoItemId, fulfillmentType);
                if (!itemPriceRowsByFulfillment.has(itemPriceKey) && itemPrices.length > 0) {
                  itemPriceRowsByFulfillment.set(itemPriceKey, {
                    prices: itemPrices,
                    categoryId: normalizedCategoryId,
                    categoryName,
                  });
                }
              }

              for (const size of itemSizes) {
                const sizeId = normalizeIikoId(size?.sizeId || size?.id);
                if (!sizeId) continue;
                const iikoVariantId = `${iikoItemId}_${sizeId}`;
                const variantPrices = Array.isArray(size?.prices) ? size.prices : [];
                if (variantPrices.length === 0) continue;

                for (const fulfillmentType of fulfillmentTypes) {
                  const variantPriceKey = buildPriceLookupKey(iikoVariantId, fulfillmentType);
                  if (variantPriceRowsByFulfillment.has(variantPriceKey)) continue;
                  variantPriceRowsByFulfillment.set(variantPriceKey, {
                    prices: variantPrices,
                    categoryId: normalizedCategoryId,
                    categoryName,
                  });
                }
              }
            }
          }
        }

        // Слить данные из разных категорий
        const { items: mergedItems } = mergeMenuPayloadsByCategories(menuPayloads);

        // Использовать первый payload для категорий блюд (они одинаковые для всех категорий цен)
        externalMenuPayload = menuPayloads[0].payload;

        // Заполнить маппинг категорий цен для каждого блюда
        for (const [itemId, itemData] of mergedItems) {
          if (itemData.categories.length > 0) {
            // Берем первую категорию (обычно есть только одна, но может быть несколько)
            const cat = itemData.categories[0];
            itemPriceCategoryMap.set(itemId, {
              categoryId: cat.id,
              categoryName: cat.name,
              fulfillmentTypes: cat.fulfillmentTypes,
            });
          }
        }
      } else {
        // Fallback на старую логику если категории не получены
        externalMenuPayload = await client.getMenuById({
          externalMenuId,
          priceCategoryId: priceCategoryId || undefined,
          useConfiguredOrganization: false,
        });
      }
    } else {
      // СТАРАЯ ЛОГИКА: Получить меню с одной категорией цен
      externalMenuPayload = await client.getMenuById({
        externalMenuId,
        priceCategoryId: priceCategoryId || undefined,
        useConfiguredOrganization: false,
      });
    }

    const menuCategories = Array.isArray(externalMenuPayload?.itemCategories)
      ? externalMenuPayload.itemCategories
      : [];
    externalCategoriesRaw = menuCategories.map((category, index) => ({
      id: normalizeIikoId(category?.id || category?.itemCategoryId || category?.iikoGroupId),
      name:
        firstNonEmptyString(category?.name, category?.title, category?.caption) ||
        `Категория ${index + 1}`,
      sort_order: index,
      is_active: category?.isHidden ? 0 : 1,
      image_url: category?.buttonImageUrl || category?.headerImageUrl || null,
    }));

    const pickSizePrice = (size = {}) => {
      return resolveIikoPriceFromRows(size?.prices || []);
    };

    const allExternalMenuItemIds = new Set();
    const normalizedItemsById = new Map();
    const scopedItemIds = new Set();
    for (const category of menuCategories) {
      const externalCategoryId = normalizeIikoId(
        category?.id || category?.itemCategoryId || category?.iikoGroupId
      );
      const categoryItems = Array.isArray(category?.items) ? category.items : [];
      for (const menuItem of categoryItems) {
        const itemId = normalizeIikoId(menuItem?.itemId || menuItem?.id || menuItem?.productId);
        if (!itemId) continue;
        allExternalMenuItemIds.add(itemId);
        if (
          useCategoryFilter &&
          externalCategoryId &&
          !selectedCategoryIds.has(externalCategoryId)
        ) {
          continue;
        }
        scopedItemIds.add(itemId);
        if (externalCategoryId) {
          if (!externalMenuCategoryIdsByItemId.has(itemId)) {
            externalMenuCategoryIdsByItemId.set(itemId, new Set());
          }
          externalMenuCategoryIdsByItemId.get(itemId).add(externalCategoryId);
        }

        if (normalizedItemsById.has(itemId)) continue;

        const itemSizes = Array.isArray(menuItem?.itemSizes) ? menuItem.itemSizes : [];
        const sizePrices = itemSizes.map((size, index) => {
          const sizeId = normalizeIikoId(size?.sizeId || size?.id || `size_${index + 1}`);
          const resolvedPrice = pickSizePrice(size);
          return {
            id: sizeId,
            sizeId,
            sizeName: firstNonEmptyString(size?.sizeName, size?.name, size?.code),
            price: resolvedPrice,
            priceValue: resolvedPrice,
            prices: Array.isArray(size?.prices) ? size.prices : [],
            is_active: size?.isHidden ? 0 : 1,
            image_url: size?.buttonImageUrl || null,
            portionWeight: toNumberOrNull(size?.portionWeightGrams),
            measureUnitType: size?.measureUnitType || null,
            nutritionalValues: size?.nutritionPerHundredGrams || null,
            itemModifierGroups: Array.isArray(size?.itemModifierGroups)
              ? size.itemModifierGroups
              : [],
            isDefault: Boolean(size?.isDefault),
          };
        });

        const primarySize = itemSizes[0] || null;

        normalizedItemsById.set(itemId, {
          id: itemId,
          itemId,
          name: menuItem?.name,
          description: menuItem?.description || null,
          composition: menuItem?.description || null,
          image_url: menuItem?.buttonImageUrl || itemSizes[0]?.buttonImageUrl || null,
          is_active: menuItem?.isHidden ? 0 : 1,
          orderItemType: menuItem?.orderItemType || menuItem?.type || "Product",
          type: menuItem?.type || menuItem?.orderItemType || "Product",
          measureUnit: menuItem?.measureUnit || primarySize?.measureUnitType || null,
          weight_unit: primarySize?.measureUnitType || menuItem?.measureUnit || null,
          productCategoryId: menuItem?.productCategoryId || externalCategoryId || null,
          groupIds: externalCategoryId ? [externalCategoryId] : [],
          sizePrices,
          weight: toNumberOrNull(itemSizes[0]?.portionWeightGrams),
          nutritionalValues: primarySize?.nutritionPerHundredGrams || null,
        });
      }
    }
    externalMenuItemIds = scopedItemIds;
    externalItemsRaw = [...normalizedItemsById.values()].filter((item) =>
      externalMenuItemIds.has(normalizeIikoId(item?.id))
    );

    if (externalMenuItemIds.size === 0 || externalItemsRaw.length === 0) {
      throw new Error("Во внешнем меню iiko не найдено позиций для синхронизации");
    }

    const categoriesRaw = externalCategoriesRaw;
    const items = externalItemsRaw;
    const allowedCategoryIds = new Set();
    for (const item of items) {
      const itemCategoryIds = extractIikoItemCategoryIds(item);
      for (const itemCategoryId of itemCategoryIds) {
        const normalizedCategoryId = normalizeIikoId(itemCategoryId);
        if (normalizedCategoryId) allowedCategoryIds.add(normalizedCategoryId);
      }
    }
    const categories = categoriesRaw.filter((category) => {
      const iikoCategoryId = normalizeIikoId(
        category?.id || category?.category_id || category?.groupId || category?.group_id
      );
      if (!iikoCategoryId) return false;
      if (useExternalMenuFilter && !allowedCategoryIds.has(iikoCategoryId)) return false;
      return true;
    });
    const sizes = [];

    const connection = await db.getConnection();
    let stats = { categories: 0, items: 0, variants: 0, modifierGroups: 0, modifiers: 0 };
    const syncedCategoryExternalIds = new Set();
    const syncedItemExternalIds = new Set();
    const syncedVariantExternalIds = new Set();
    const syncedModifierGroupExternalIds = new Set();
    const syncedModifierExternalIds = new Set();

    try {
      await connection.beginTransaction();

      const [citiesRows] = await connection.query("SELECT id FROM cities ORDER BY id");
      const allCityIds = citiesRows.map((row) => Number(row.id)).filter(Number.isFinite);
      const targetCityIds =
        Number.isFinite(requestedCityId) && requestedCityId > 0 ? [requestedCityId] : allCityIds;
      const [cityOrganizationRows] = await connection.query(
        `SELECT city_id, iiko_organization_id
       FROM branches
       WHERE city_id IN (${targetCityIds.map(() => "?").join(",")})
         AND iiko_organization_id IS NOT NULL
         AND iiko_organization_id <> ''
       ORDER BY city_id, id`,
        targetCityIds
      );
      const cityOrganizationIds = new Map();
      for (const row of cityOrganizationRows) {
        const cityKey = Number(row.city_id);
        const organizationId = String(row.iiko_organization_id || "").trim();
        if (!Number.isFinite(cityKey) || !organizationId) continue;
        if (!cityOrganizationIds.has(cityKey)) {
          cityOrganizationIds.set(cityKey, []);
        }
        const current = cityOrganizationIds.get(cityKey);
        if (!current.includes(organizationId)) {
          current.push(organizationId);
        }
      }

      const sizeNameById = new Map();
      for (const size of sizes) {
        const sizeId = normalizeIikoId(size.id || size.sizeId || size.size_id);
        if (!sizeId) continue;
        const sizeName = size.name || size.fullName || size.shortName || size.code || null;
        if (!sizeName) continue;
        sizeNameById.set(toLookupKey(sizeId), String(sizeName));
      }

      const localCategoryIdByIikoId = new Map();
      const processedCategoryIds = new Set();

      for (const category of categories) {
        const iikoId = normalizeIikoId(
          category.id || category.category_id || category.groupId || category.group_id
        );
        if (!iikoId) continue;
        if (processedCategoryIds.has(iikoId)) continue;
        processedCategoryIds.add(iikoId);
        if (useCategoryFilter && !selectedCategoryIds.has(iikoId)) continue;
        syncedCategoryExternalIds.add(iikoId);

        const name = normalizeDisplayName(
          category.name || category.title || category.caption,
          `Категория ${iikoId}`
        );
        const sortOrder = Number(category.sort_order || category.order || 0);
        const categoryDisabled =
          normalizeBooleanFlag(category.is_active) === false ||
          normalizeBooleanFlag(category.isActive) === false ||
          normalizeBooleanFlag(category.active) === false ||
          normalizeBooleanFlag(category.isDeleted) === true ||
          normalizeBooleanFlag(category.deleted) === true;
        const isActive = categoryDisabled ? 0 : 1;
        const imageUrl =
          category.image_url || category.image || category.imageLinks?.[0]?.href || null;

        const [existing] = await connection.query(
          "SELECT id, name, is_active FROM menu_categories WHERE iiko_category_id = ? LIMIT 1",
          [iikoId]
        );
        let localCategoryId = null;
        if (existing.length > 0) {
          localCategoryId = existing[0].id;
          const resolvedName = preserveLocalNames ? existing[0].name : name;
          await connection.query(
            `UPDATE menu_categories
           SET name = ?, image_url = COALESCE(?, image_url), sort_order = ?, is_active = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
            [resolvedName, imageUrl, sortOrder, isActive, localCategoryId]
          );
        } else {
          const [inserted] = await connection.query(
            `INSERT INTO menu_categories (name, image_url, sort_order, is_active, iiko_category_id, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
            [name, imageUrl, sortOrder, isActive, iikoId]
          );
          localCategoryId = inserted.insertId;
        }

        localCategoryIdByIikoId.set(iikoId, localCategoryId);

        for (const targetCityId of targetCityIds) {
          await connection.query(
            `INSERT INTO menu_category_cities (category_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [localCategoryId, targetCityId, isActive ? 1 : 0]
          );
        }

        stats.categories += 1;
      }

      for (const item of items) {
        const iikoItemId = normalizeIikoId(
          item.id || item.item_id || item.productId || item.product_id
        );
        if (!iikoItemId) continue;
        if (String(item.orderItemType || "").toLowerCase() === "modifier") continue;
        if (String(item.type || "").toLowerCase() === "modifier") continue;
        syncedItemExternalIds.add(iikoItemId);
        const iikoCategoryIds = useExternalMenuFilter
          ? [...(externalMenuCategoryIdsByItemId.get(iikoItemId) || [])]
          : extractIikoItemCategoryIds(item);
        if (useCategoryFilter && !useExternalMenuFilter) {
          const inSelectedCategory = iikoCategoryIds.some((categoryId) =>
            selectedCategoryIds.has(categoryId)
          );
          if (!inSelectedCategory) continue;
        }

        const name = normalizeDisplayName(item.name || item.title, `Позиция ${iikoItemId}`);
        const description = firstNonEmptyString(
          item.description,
          item.additionalInfo,
          item.comment
        );
        const composition = firstNonEmptyString(
          item.composition,
          item.additionalInfo,
          item.comment
        );
        const imageUrl =
          resolveImageUrl(item.image_url) ||
          resolveImageUrl(item.image) ||
          resolveImageUrl(item.imageLinks) ||
          resolveImageUrl(item.images) ||
          resolveImageUrl(item?.imageLinks?.large) ||
          resolveImageUrl(item?.imageLinks?.medium) ||
          resolveImageUrl(item?.imageLinks?.small) ||
          null;
        const sizePricesRaw = Array.isArray(item.sizePrices)
          ? item.sizePrices
          : Array.isArray(item.size_prices)
            ? item.size_prices
            : [];
        const hasIncludedSize = sizePricesRaw.some(
          (sizePrice) => normalizeBooleanFlag(sizePrice?.price?.isIncludedInMenu) !== false
        );
        const explicitIncludedInMenu =
          normalizeBooleanFlag(item.isIncludedInMenu) ??
          normalizeBooleanFlag(item.includedInMenu) ??
          normalizeBooleanFlag(item.price?.isIncludedInMenu);
        const isIncludedInMenu =
          explicitIncludedInMenu ?? (sizePricesRaw.length > 0 ? hasIncludedSize : true);
        const itemDisabled =
          normalizeBooleanFlag(item.is_active) === false ||
          normalizeBooleanFlag(item.isActive) === false ||
          normalizeBooleanFlag(item.active) === false ||
          normalizeBooleanFlag(item.isDeleted) === true ||
          normalizeBooleanFlag(item.deleted) === true ||
          isIncludedInMenu === false;
        const isActive = itemDisabled ? 0 : 1;
        const directPrice = toNumberOrNull(item.price ?? item.base_price);
        const fallbackSizePrice =
          sizePricesRaw.length > 0
            ? resolveIikoPriceFromRows(sizePricesRaw[0]?.prices || [], [])
            : null;
        const basePrice = directPrice ?? fallbackSizePrice;
        const sortOrder = Number(item.sort_order || item.order || 0);
        const nutrition = item.nutritionalValues || item.nutritional_values || item.nutrition || {};
        const nutritionPer100 =
          nutrition.per100g ||
          nutrition.per100 ||
          nutrition.valuesPer100g ||
          (toNumberOrNull(nutrition.energy ?? nutrition.calories) !== null ||
          toNumberOrNull(nutrition.proteins) !== null ||
          toNumberOrNull(nutrition.fats ?? nutrition.fat) !== null ||
          toNumberOrNull(nutrition.carbs ?? nutrition.carbohydrates) !== null
            ? nutrition
            : {});
        const nutritionPerServing =
          nutrition.perServing || nutrition.serving || nutrition.full || {};
        const weightValueRaw = toNumberOrNull(
          item.weight ??
            item.amount ??
            item.measureUnitWeight ??
            item.measure_unit_weight ??
            item.portionWeight ??
            nutrition.weight
        );
        const weightUnit =
          normalizeWeightUnit(
            item.weight_unit || item.measureUnit || item.weightUnit || item.unit
          ) || "pcs";
        const weightValue = normalizeWeightValue(weightValueRaw, weightUnit);
        const caloriesPer100g = toNumberOrNull(
          item.energyAmount ?? nutritionPer100.energy ?? nutritionPer100.calories
        );
        const proteinsPer100g = toNumberOrNull(item.proteinsAmount ?? nutritionPer100.proteins);
        const fatsPer100g = toNumberOrNull(
          item.fatAmount ?? nutritionPer100.fats ?? nutritionPer100.fat
        );
        const carbsPer100g = toNumberOrNull(
          item.carbohydratesAmount ?? nutritionPer100.carbohydrates ?? nutritionPer100.carbs
        );
        const caloriesPerServing =
          toNumberOrNull(
            item.energyFullAmount ?? nutritionPerServing.energy ?? nutritionPerServing.calories
          ) ?? calcServingNutrition(caloriesPer100g, weightValue);
        const proteinsPerServing =
          toNumberOrNull(item.proteinsFullAmount ?? nutritionPerServing.proteins) ??
          calcServingNutrition(proteinsPer100g, weightValue);
        const fatsPerServing =
          toNumberOrNull(
            item.fatFullAmount ?? nutritionPerServing.fats ?? nutritionPerServing.fat
          ) ?? calcServingNutrition(fatsPer100g, weightValue);
        const carbsPerServing =
          toNumberOrNull(
            item.carbohydratesFullAmount ??
              nutritionPerServing.carbohydrates ??
              nutritionPerServing.carbs
          ) ?? calcServingNutrition(carbsPer100g, weightValue);

        const [existing] = await connection.query(
          "SELECT id, name, is_active, price FROM menu_items WHERE iiko_item_id = ? LIMIT 1",
          [iikoItemId]
        );
        let localItemId = null;
        if (existing.length > 0) {
          localItemId = existing[0].id;
          const resolvedName = preserveLocalNames ? existing[0].name : name;
          const storedBasePrice = toNumberOrNull(existing[0].price);
          await connection.query(
            `UPDATE menu_items
           SET name = ?, description = ?, composition = ?, image_url = COALESCE(?, image_url), price = ?, sort_order = ?, is_active = ?,
               weight_value = ?, weight_unit = ?, calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
               calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?, iiko_synced_at = NOW()
           WHERE id = ?`,
            [
              resolvedName,
              description,
              composition,
              imageUrl,
              basePrice ?? storedBasePrice ?? 0,
              sortOrder,
              isActive,
              weightValue,
              weightUnit,
              caloriesPer100g,
              proteinsPer100g,
              fatsPer100g,
              carbsPer100g,
              caloriesPerServing,
              proteinsPerServing,
              fatsPerServing,
              carbsPerServing,
              localItemId,
            ]
          );
        } else {
          const [inserted] = await connection.query(
            `INSERT INTO menu_items
           (name, description, composition, price, image_url, sort_order, is_active, iiko_item_id,
            weight_value, weight_unit, calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
            calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving, iiko_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              name,
              description,
              composition,
              basePrice ?? 0,
              imageUrl,
              sortOrder,
              isActive,
              iikoItemId,
              weightValue,
              weightUnit,
              caloriesPer100g,
              proteinsPer100g,
              fatsPer100g,
              carbsPer100g,
              caloriesPerServing,
              proteinsPerServing,
              fatsPerServing,
              carbsPerServing,
            ]
          );
          localItemId = inserted.insertId;
        }

        const localCategoryIds = iikoCategoryIds
          .map((iikoCategoryId) => localCategoryIdByIikoId.get(iikoCategoryId))
          .filter((value) => Number.isFinite(Number(value)));

        if (localCategoryIds.length > 0) {
          await connection.query("DELETE FROM menu_item_categories WHERE item_id = ?", [
            localItemId,
          ]);
          for (const localCategoryId of localCategoryIds) {
            await connection.query(
              `INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order)
             VALUES (?, ?, 0)`,
              [localItemId, localCategoryId]
            );
          }
        }

        for (const targetCityId of targetCityIds) {
          await connection.query(
            `INSERT INTO menu_item_cities (item_id, city_id, is_active)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
            [localItemId, targetCityId, isActive ? 1 : 0]
          );
        }
        for (const targetCityId of targetCityIds) {
          const preferredOrganizationIds = cityOrganizationIds.get(Number(targetCityId)) || [];
          const priceCategoryInfo = itemPriceCategoryMap.get(iikoItemId);
          for (const fulfillmentType of priceFulfillmentTypes) {
            const mappedPriceCategoryId = normalizeIikoId(priceCategoryMapping?.[fulfillmentType]);
            const itemPriceEntry = hasMultiplePriceCategories
              ? itemPriceRowsByFulfillment.get(buildPriceLookupKey(iikoItemId, fulfillmentType))
              : null;
            const priceRows = hasMultiplePriceCategories
              ? itemPriceEntry?.prices || []
              : sizePricesRaw[0]?.prices || [];
            const priceCategoryId =
              itemPriceEntry?.categoryId ||
              mappedPriceCategoryId ||
              priceCategoryInfo?.categoryId ||
              null;
            const priceCategoryName =
              itemPriceEntry?.categoryName ||
              (priceCategoryId ? priceCategoryNameById.get(priceCategoryId) || null : null) ||
              priceCategoryInfo?.categoryName ||
              null;
            const cityItemPrice = hasMultiplePriceCategories
              ? resolveIikoPriceFromRows(priceRows, preferredOrganizationIds)
              : directPrice ?? resolveIikoPriceFromRows(priceRows, preferredOrganizationIds);
            if (cityItemPrice === null) {
              await connection.query(
                `DELETE FROM menu_item_prices
                 WHERE item_id = ?
                   AND city_id = ?
                   AND fulfillment_type = ?`,
                [localItemId, targetCityId, fulfillmentType]
              );
              continue;
            }

            await connection.query(
              `INSERT INTO menu_item_prices 
               (item_id, city_id, fulfillment_type, price, price_category_id, price_category_name, iiko_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE 
               price = VALUES(price), 
               price_category_id = VALUES(price_category_id), 
               price_category_name = VALUES(price_category_name),
               iiko_synced_at = NOW()`,
              [
                localItemId,
                targetCityId,
                fulfillmentType,
                cityItemPrice,
                priceCategoryId,
                priceCategoryName,
              ]
            );
          }
        }

        stats.items += 1;

        const hasSingleImplicitSize =
          sizePricesRaw.length === 1 &&
          !firstNonEmptyString(
            sizePricesRaw[0]?.sizeName,
            sizePricesRaw[0]?.name,
            sizePricesRaw[0]?.caption,
            sizePricesRaw[0]?.productSizeName,
            sizePricesRaw[0]?.size?.name,
            sizePricesRaw[0]?.size?.fullName
          );
        const itemVariants =
          sizePricesRaw.length > 0 && !hasSingleImplicitSize
            ? sizePricesRaw.map((sizePrice, index) => {
                const sizeObject =
                  sizePrice.size || sizePrice.productSize || sizePrice.price?.size || null;
                const sizeId = normalizeIikoId(
                  sizePrice.sizeId ||
                    sizePrice.size_id ||
                    sizePrice.productSizeId ||
                    sizePrice.product_size_id ||
                    sizePrice.id ||
                    sizeObject?.id
                );
                const variantName =
                  firstNonEmptyString(
                    sizePrice.sizeName,
                    sizePrice.name,
                    sizePrice.caption,
                    sizePrice.productSizeName,
                    sizeObject?.name,
                    sizeObject?.fullName
                  ) ||
                  (sizeId ? sizeNameById.get(toLookupKey(sizeId)) : null) ||
                  (sizePricesRaw.length > 1 ? `Вариант ${index + 1}` : "Стандарт");
                const variantPrice = resolveIikoPriceFromRows(sizePrice.prices || []);
                const variantIncluded =
                  normalizeBooleanFlag(sizePrice?.price?.isIncludedInMenu) !== false;
                const variantNutritionPer100 = sizePrice?.nutritionalValues || {};
                const variantWeightUnit =
                  normalizeWeightUnit(
                    sizePrice?.measureUnitType || item.weight_unit || item.measureUnit || item.unit
                  ) || weightUnit;
                const variantWeightValue = normalizeWeightValue(
                  sizePrice?.portionWeight,
                  variantWeightUnit
                );
                const variantCaloriesPer100g = toNumberOrNull(
                  variantNutritionPer100.energy ?? variantNutritionPer100.calories
                );
                const variantProteinsPer100g = toNumberOrNull(variantNutritionPer100.proteins);
                const variantFatsPer100g = toNumberOrNull(
                  variantNutritionPer100.fats ?? variantNutritionPer100.fat
                );
                const variantCarbsPer100g = toNumberOrNull(
                  variantNutritionPer100.carbs ?? variantNutritionPer100.carbohydrates
                );
                return {
                  id: sizeId ? `${iikoItemId}_${sizeId}` : `${iikoItemId}_size_${index + 1}`,
                  name: variantName,
                  price: variantPrice ?? basePrice,
                  prices: Array.isArray(sizePrice.prices) ? sizePrice.prices : [],
                  sort_order: index,
                  is_active: isActive === 1 && variantIncluded,
                  image_url:
                    resolveImageUrl(sizePrice?.image_url) ||
                    resolveImageUrl(sizePrice?.image) ||
                    resolveImageUrl(sizeObject?.buttonImageUrl) ||
                    imageUrl,
                  weight_value: variantWeightValue,
                  weight_unit: variantWeightUnit,
                  calories_per_100g: variantCaloriesPer100g,
                  proteins_per_100g: variantProteinsPer100g,
                  fats_per_100g: variantFatsPer100g,
                  carbs_per_100g: variantCarbsPer100g,
                  calories_per_serving: calcServingNutrition(
                    variantCaloriesPer100g,
                    variantWeightValue
                  ),
                  proteins_per_serving: calcServingNutrition(
                    variantProteinsPer100g,
                    variantWeightValue
                  ),
                  fats_per_serving: calcServingNutrition(variantFatsPer100g, variantWeightValue),
                  carbs_per_serving: calcServingNutrition(variantCarbsPer100g, variantWeightValue),
                };
              })
            : Array.isArray(item.variants)
              ? item.variants
              : [];

        const syncedVariantIds = [];
        const syncedVariantRows = [];
        const localVariantIdByIikoVariantId = new Map();
        for (const variant of itemVariants) {
          const iikoVariantId = normalizeIikoId(
            variant.id || variant.variant_id || variant.sizeId || variant.size_id
          );
          if (!iikoVariantId) continue;
          syncedVariantExternalIds.add(iikoVariantId);
          syncedVariantIds.push(iikoVariantId);

          const variantName = normalizeDisplayName(variant.name, `Вариант ${iikoVariantId}`);
          const variantPrice = toNumberOrNull(variant.price) ?? basePrice ?? 0;
          const variantImage = variant.image_url || variant.image || null;
          const variantSortOrder = Number(variant.sort_order || 0);
          const variantActive = variant.is_active === false ? 0 : 1;
          const variantWeightValue = normalizeWeightValue(
            variant.weight_value,
            normalizeWeightUnit(variant.weight_unit) || weightUnit
          );
          const variantWeightUnit = normalizeWeightUnit(variant.weight_unit) || weightUnit;
          const variantCaloriesPer100g = toNumberOrNull(variant.calories_per_100g);
          const variantProteinsPer100g = toNumberOrNull(variant.proteins_per_100g);
          const variantFatsPer100g = toNumberOrNull(variant.fats_per_100g);
          const variantCarbsPer100g = toNumberOrNull(variant.carbs_per_100g);
          const variantCaloriesPerServing =
            toNumberOrNull(variant.calories_per_serving) ??
            calcServingNutrition(variantCaloriesPer100g, variantWeightValue);
          const variantProteinsPerServing =
            toNumberOrNull(variant.proteins_per_serving) ??
            calcServingNutrition(variantProteinsPer100g, variantWeightValue);
          const variantFatsPerServing =
            toNumberOrNull(variant.fats_per_serving) ??
            calcServingNutrition(variantFatsPer100g, variantWeightValue);
          const variantCarbsPerServing =
            toNumberOrNull(variant.carbs_per_serving) ??
            calcServingNutrition(variantCarbsPer100g, variantWeightValue);

          const [existingVariant] = await connection.query(
            "SELECT id, name, price FROM item_variants WHERE iiko_variant_id = ? LIMIT 1",
            [iikoVariantId]
          );
          let localVariantId = null;
          if (existingVariant.length > 0) {
            localVariantId = existingVariant[0].id;
            const resolvedVariantName = preserveLocalNames ? existingVariant[0].name : variantName;
            const storedVariantPrice = toNumberOrNull(existingVariant[0].price);
            await connection.query(
              `UPDATE item_variants
             SET item_id = ?, name = ?, price = ?, image_url = COALESCE(?, image_url),
                 weight_value = ?, weight_unit = ?, calories_per_100g = ?, proteins_per_100g = ?, fats_per_100g = ?, carbs_per_100g = ?,
                 calories_per_serving = ?, proteins_per_serving = ?, fats_per_serving = ?, carbs_per_serving = ?,
                 sort_order = ?, is_active = ?, iiko_synced_at = NOW()
             WHERE id = ?`,
              [
                localItemId,
                resolvedVariantName,
                variantPrice ?? storedVariantPrice ?? basePrice ?? 0,
                variantImage,
                variantWeightValue,
                variantWeightUnit,
                variantCaloriesPer100g,
                variantProteinsPer100g,
                variantFatsPer100g,
                variantCarbsPer100g,
                variantCaloriesPerServing,
                variantProteinsPerServing,
                variantFatsPerServing,
                variantCarbsPerServing,
                variantSortOrder,
                variantActive,
                localVariantId,
              ]
            );
          } else {
            const [insertedVariant] = await connection.query(
              `INSERT INTO item_variants
             (item_id, name, price, image_url, weight_value, weight_unit, calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
              calories_per_serving, proteins_per_serving, fats_per_serving, carbs_per_serving, sort_order, is_active, iiko_variant_id, iiko_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [
                localItemId,
                variantName,
                variantPrice ?? basePrice ?? 0,
                variantImage,
                variantWeightValue,
                variantWeightUnit,
                variantCaloriesPer100g,
                variantProteinsPer100g,
                variantFatsPer100g,
                variantCarbsPer100g,
                variantCaloriesPerServing,
                variantProteinsPerServing,
                variantFatsPerServing,
                variantCarbsPerServing,
                variantSortOrder,
                variantActive,
                iikoVariantId,
              ]
            );
            localVariantId = insertedVariant.insertId;
          }
          if (Number.isFinite(Number(localVariantId))) {
            localVariantIdByIikoVariantId.set(iikoVariantId, Number(localVariantId));
            syncedVariantRows.push({
              id: Number(localVariantId),
              iikoVariantId,
              price: variantPrice,
              isActive: variantActive,
              prices: Array.isArray(variant.prices) ? variant.prices : [],
            });
          }
          stats.variants += 1;
        }

        // Деактивируем устаревшие iiko-варианты товара, которых больше нет в актуальном ответе.
        if (syncedVariantIds.length > 0) {
          await connection.query(
            `UPDATE item_variants
           SET is_active = 0, iiko_synced_at = NOW()
           WHERE item_id = ?
             AND iiko_variant_id IS NOT NULL
             AND iiko_variant_id NOT IN (${syncedVariantIds.map(() => "?").join(",")})`,
            [localItemId, ...syncedVariantIds]
          );
        } else {
          await connection.query(
            `UPDATE item_variants
           SET is_active = 0, iiko_synced_at = NOW()
           WHERE item_id = ?
             AND iiko_variant_id IS NOT NULL`,
            [localItemId]
          );
        }

        for (const variantRow of syncedVariantRows) {
          for (const targetCityId of targetCityIds) {
            const preferredOrganizationIds = cityOrganizationIds.get(Number(targetCityId)) || [];
            const priceCategoryInfo = itemPriceCategoryMap.get(iikoItemId);
            for (const fulfillmentType of priceFulfillmentTypes) {
              const mappedPriceCategoryId = normalizeIikoId(priceCategoryMapping?.[fulfillmentType]);
              const variantPriceEntry = hasMultiplePriceCategories
                ? variantPriceRowsByFulfillment.get(
                    buildPriceLookupKey(variantRow.iikoVariantId, fulfillmentType)
                  )
                : null;
              const priceRows = hasMultiplePriceCategories
                ? variantPriceEntry?.prices || []
                : variantRow.prices || [];
              const priceCategoryId =
                variantPriceEntry?.categoryId ||
                mappedPriceCategoryId ||
                priceCategoryInfo?.categoryId ||
                null;
              const priceCategoryName =
                variantPriceEntry?.categoryName ||
                (priceCategoryId ? priceCategoryNameById.get(priceCategoryId) || null : null) ||
                priceCategoryInfo?.categoryName ||
                null;
              const cityVariantPrice = resolveIikoPriceFromRows(priceRows, preferredOrganizationIds);
              if (cityVariantPrice === null) {
                await connection.query(
                  `DELETE FROM menu_variant_prices
                   WHERE variant_id = ?
                     AND city_id = ?
                     AND fulfillment_type = ?`,
                  [variantRow.id, targetCityId, fulfillmentType]
                );
                continue;
              }

              await connection.query(
                `INSERT INTO menu_variant_prices 
                 (variant_id, city_id, fulfillment_type, price, price_category_id, price_category_name, iiko_synced_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE 
                 price = VALUES(price), 
                 price_category_id = VALUES(price_category_id), 
                 price_category_name = VALUES(price_category_name),
                 iiko_synced_at = NOW()`,
                [
                  variantRow.id,
                  targetCityId,
                  fulfillmentType,
                  cityVariantPrice,
                  priceCategoryId,
                  priceCategoryName,
                ]
              );
            }
          }
        }

        const modifierGroupIdsForItem = new Set();
        const seenModifierGroupExternalIds = new Set();
        const seenModifierExternalIds = new Set();

        for (const sizePrice of sizePricesRaw) {
          const sizeIdRaw = normalizeIikoId(
            sizePrice?.sizeId ||
              sizePrice?.size_id ||
              sizePrice?.productSizeId ||
              sizePrice?.product_size_id ||
              sizePrice?.id ||
              sizePrice?.size?.id
          );
          const iikoVariantIdForSize = sizeIdRaw ? `${iikoItemId}_${sizeIdRaw}` : "";
          const localVariantId = iikoVariantIdForSize
            ? localVariantIdByIikoVariantId.get(iikoVariantIdForSize)
            : null;
          const itemModifierGroups = Array.isArray(sizePrice?.itemModifierGroups)
            ? sizePrice.itemModifierGroups
            : [];

          for (let groupIndex = 0; groupIndex < itemModifierGroups.length; groupIndex += 1) {
            const rawGroup = itemModifierGroups[groupIndex] || {};
            const groupName = normalizeDisplayName(rawGroup?.name, `Группа ${groupIndex + 1}`);
            const groupExternalId =
              normalizeIikoId(rawGroup?.itemGroupId) ||
              `${iikoItemId}::${toLookupKey(groupName)}::${String(groupIndex + 1)}`;
            const groupRestrictions = rawGroup?.restrictions || {};
            const groupType = normalizeModifierGroupType(groupRestrictions);
            const { minSelections, maxSelections } =
              normalizeModifierGroupSelections(groupRestrictions);
            const groupIsRequired = minSelections > 0 ? 1 : 0;
            const groupIsActive = rawGroup?.isHidden ? 0 : 1;

            let localGroupId = null;
            if (!seenModifierGroupExternalIds.has(groupExternalId)) {
              const [existingGroup] = await connection.query(
                "SELECT id, name FROM modifier_groups WHERE iiko_modifier_group_id = ? LIMIT 1",
                [groupExternalId]
              );
              if (existingGroup.length > 0) {
                localGroupId = existingGroup[0].id;
                const resolvedGroupName = preserveLocalNames ? existingGroup[0].name : groupName;
                await connection.query(
                  `UPDATE modifier_groups
                 SET name = ?, type = ?, is_required = ?, min_selections = ?, max_selections = ?, sort_order = ?, is_active = ?, iiko_synced_at = NOW()
                 WHERE id = ?`,
                  [
                    resolvedGroupName,
                    groupType,
                    groupIsRequired,
                    minSelections,
                    maxSelections,
                    groupIndex,
                    groupIsActive,
                    localGroupId,
                  ]
                );
              } else {
                const [insertedGroup] = await connection.query(
                  `INSERT INTO modifier_groups
                 (name, iiko_modifier_group_id, type, is_required, is_global, min_selections, max_selections, sort_order, is_active, iiko_synced_at)
                 VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())`,
                  [
                    groupName,
                    groupExternalId,
                    groupType,
                    groupIsRequired,
                    minSelections,
                    maxSelections,
                    groupIndex,
                    groupIsActive,
                  ]
                );
                localGroupId = insertedGroup.insertId;
              }
              seenModifierGroupExternalIds.add(groupExternalId);
              syncedModifierGroupExternalIds.add(groupExternalId);
              stats.modifierGroups += 1;
            } else {
              const [groupRows] = await connection.query(
                "SELECT id FROM modifier_groups WHERE iiko_modifier_group_id = ? LIMIT 1",
                [groupExternalId]
              );
              if (groupRows.length > 0) {
                localGroupId = groupRows[0].id;
              }
            }
            if (!Number.isFinite(Number(localGroupId))) continue;
            modifierGroupIdsForItem.add(Number(localGroupId));

            const groupItems = Array.isArray(rawGroup?.items) ? rawGroup.items : [];
            for (let modIndex = 0; modIndex < groupItems.length; modIndex += 1) {
              const rawModifier = groupItems[modIndex] || {};
              const modifierExternalId = normalizeIikoId(rawModifier?.itemId || rawModifier?.id);
              if (!modifierExternalId) continue;
              const modifierName = normalizeDisplayName(
                rawModifier?.name,
                `Модификатор ${modIndex + 1}`
              );
              const modifierPrice = extractModifierPrice(rawModifier);
              const modifierImageUrl = resolveImageUrl(
                rawModifier?.buttonImageUrl || rawModifier?.image_url || rawModifier?.image
              );
              const modifierWeightUnit = normalizeWeightUnit(rawModifier?.measureUnitType);
              const modifierWeightValue = normalizeWeightValue(
                rawModifier?.portionWeightGrams,
                modifierWeightUnit || "g"
              );
              const modifierIsActive = rawModifier?.isHidden ? 0 : 1;
              const modifierSortOrder = Number(rawModifier?.position ?? modIndex);

              let localModifierId = null;
              if (!seenModifierExternalIds.has(modifierExternalId)) {
                const [existingModifier] = await connection.query(
                  "SELECT id, name FROM modifiers WHERE iiko_modifier_id = ? LIMIT 1",
                  [modifierExternalId]
                );
                if (existingModifier.length > 0) {
                  localModifierId = existingModifier[0].id;
                  const resolvedModifierName = preserveLocalNames
                    ? existingModifier[0].name
                    : modifierName;
                  await connection.query(
                    `UPDATE modifiers
                   SET group_id = ?, name = ?, price = ?, weight = ?, weight_unit = ?, image_url = COALESCE(?, image_url),
                       sort_order = ?, is_active = ?, iiko_synced_at = NOW()
                   WHERE id = ?`,
                    [
                      localGroupId,
                      resolvedModifierName,
                      modifierPrice,
                      modifierWeightValue,
                      modifierWeightUnit,
                      modifierImageUrl,
                      modifierSortOrder,
                      modifierIsActive,
                      localModifierId,
                    ]
                  );
                } else {
                  const [insertedModifier] = await connection.query(
                    `INSERT INTO modifiers
                   (group_id, name, price, weight, weight_unit, image_url, iiko_modifier_id, iiko_synced_at, sort_order, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
                    [
                      localGroupId,
                      modifierName,
                      modifierPrice,
                      modifierWeightValue,
                      modifierWeightUnit,
                      modifierImageUrl,
                      modifierExternalId,
                      modifierSortOrder,
                      modifierIsActive,
                    ]
                  );
                  localModifierId = insertedModifier.insertId;
                }
                seenModifierExternalIds.add(modifierExternalId);
                syncedModifierExternalIds.add(modifierExternalId);
                stats.modifiers += 1;
              } else {
                const [modifierRows] = await connection.query(
                  "SELECT id FROM modifiers WHERE iiko_modifier_id = ? LIMIT 1",
                  [modifierExternalId]
                );
                if (modifierRows.length > 0) {
                  localModifierId = modifierRows[0].id;
                }
              }
              if (
                !Number.isFinite(Number(localModifierId)) ||
                !Number.isFinite(Number(localVariantId))
              )
                continue;

              await connection.query(
                `INSERT INTO menu_modifier_variant_prices (modifier_id, variant_id, price, weight, weight_unit)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE price = VALUES(price), weight = VALUES(weight), weight_unit = VALUES(weight_unit)`,
                [
                  localModifierId,
                  localVariantId,
                  modifierPrice,
                  modifierWeightValue,
                  modifierWeightUnit,
                ]
              );
            }
          }
        }

        await connection.query(
          `DELETE img
         FROM item_modifier_groups img
         JOIN modifier_groups mg ON mg.id = img.modifier_group_id
         WHERE img.item_id = ?
           AND mg.iiko_modifier_group_id IS NOT NULL`,
          [localItemId]
        );
        for (const groupId of modifierGroupIdsForItem) {
          await connection.query(
            `INSERT IGNORE INTO item_modifier_groups (item_id, modifier_group_id)
           VALUES (?, ?)`,
            [localItemId, groupId]
          );
        }
      }

      // Внешнее меню iiko приходит целиком, поэтому отсутствующие в нем блюда
      // нужно деактивировать даже при локальном фильтре по категориям.
      if (canDeactivateMissingExternalItems) {
        if (allExternalMenuItemIds.size > 0) {
          const itemPlaceholders = [...allExternalMenuItemIds].map(() => "?").join(", ");
          await connection.query(
            `UPDATE menu_items
             SET is_active = 0, iiko_synced_at = NOW()
             WHERE COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NOT NULL
               AND iiko_item_id NOT IN (${itemPlaceholders})`,
            [...allExternalMenuItemIds]
          );
        } else {
          await connection.query(
            `UPDATE menu_items
             SET is_active = 0, iiko_synced_at = NOW()
             WHERE COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NOT NULL`
          );
        }
      }

      // Для полного синка без фильтров дополнительно деактивируем локальные iiko-сущности,
      // отсутствующие в актуальном ответе внешнего меню.
      // Для частичных синков по городу эту деактивацию пропускаем.
      if (!useCategoryFilter && canDeactivateMissingExternalItems) {
        const deactivateByIikoIds = async (tableName, externalField, syncedIds = []) => {
          if (!Array.isArray(syncedIds) || syncedIds.length === 0) {
            await connection.query(
              `UPDATE ${tableName}
               SET is_active = 0, iiko_synced_at = NOW()
               WHERE COALESCE(NULLIF(TRIM(${externalField}), ''), NULL) IS NOT NULL`
            );
            return;
          }
          const placeholders = syncedIds.map(() => "?").join(", ");
          await connection.query(
            `UPDATE ${tableName}
             SET is_active = 0, iiko_synced_at = NOW()
             WHERE COALESCE(NULLIF(TRIM(${externalField}), ''), NULL) IS NOT NULL
               AND ${externalField} NOT IN (${placeholders})`,
            syncedIds
          );
        };

        await deactivateByIikoIds("menu_categories", "iiko_category_id", [
          ...syncedCategoryExternalIds,
        ]);
        await deactivateByIikoIds("menu_items", "iiko_item_id", [...syncedItemExternalIds]);
        await deactivateByIikoIds("item_variants", "iiko_variant_id", [
          ...syncedVariantExternalIds,
        ]);
        await deactivateByIikoIds("modifier_groups", "iiko_modifier_group_id", [
          ...syncedModifierGroupExternalIds,
        ]);
        await deactivateByIikoIds("modifiers", "iiko_modifier_id", [...syncedModifierExternalIds]);

        await connection.query(
          `UPDATE menu_category_cities mcc
           JOIN menu_categories mc ON mc.id = mcc.category_id
           SET mcc.is_active = CASE WHEN mc.is_active = 1 THEN mcc.is_active ELSE 0 END`
        );
        await connection.query(
          `UPDATE menu_item_cities mic
           JOIN menu_items mi ON mi.id = mic.item_id
           SET mic.is_active = CASE WHEN mi.is_active = 1 THEN mic.is_active ELSE 0 END`
        );
      }

      // Удаляем связи позиций с деактивированными iiko-категориями,
      // чтобы в админке не оставалось "разброса" товаров по архивным дублям.
      await connection.query(
        `DELETE mic
         FROM menu_item_categories mic
         JOIN menu_categories mc ON mc.id = mic.category_id
         WHERE mc.is_active = 0
           AND COALESCE(NULLIF(TRIM(mc.iiko_category_id), ''), NULL) IS NOT NULL`
      );

      await connection.query(
        `DELETE mc
         FROM menu_categories mc
         LEFT JOIN menu_item_categories mic ON mic.category_id = mc.id
         WHERE mc.is_active = 0
           AND COALESCE(NULLIF(TRIM(mc.iiko_category_id), ''), NULL) IS NOT NULL
           AND mic.category_id IS NULL`
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await invalidatePublicMenuCache();
    notifyMenuUpdated({
      source: "iiko-sync",
      scope: cityId ? "city" : "all",
      cityId: cityId ? Number(cityId) || null : null,
    });

    const [[menuCounters]] = await Promise.all([
      db.query(
        `SELECT
           (
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM menu_categories) +
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM menu_items) +
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM item_variants) +
             (SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) FROM modifiers)
           ) AS total_count,
           (
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_category_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM menu_categories) +
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM menu_items) +
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_variant_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM item_variants) +
             (SELECT SUM(CASE WHEN is_active = 1 AND COALESCE(NULLIF(TRIM(iiko_modifier_id), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) FROM modifiers)
           ) AS linked_count`
      ),
    ]);

    const menuTotalCount = Number(menuCounters?.total_count || 0);
    const menuLinkedCount = Number(menuCounters?.linked_count || 0);
    const menuUnlinkedCount = Math.max(menuTotalCount - menuLinkedCount, 0);
    const menuStatus = menuUnlinkedCount === 0 ? "ready" : "needs_mapping";
    const menuStats = {
      total: menuTotalCount,
      linked: menuLinkedCount,
      unlinked: menuUnlinkedCount,
      linked_percent:
        menuTotalCount > 0 ? Number(((menuLinkedCount / menuTotalCount) * 100).toFixed(2)) : 0,
      unlinked_percent:
        menuTotalCount > 0 ? Number(((menuUnlinkedCount / menuTotalCount) * 100).toFixed(2)) : 0,
    };
    await db.query(
      `INSERT INTO integration_readiness
         (provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at)
       VALUES
         ('iiko', 'menu', ?, ?, ?, ?, ?, JSON_OBJECT('max_unlinked_percent', 0), NOW())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         total_count = VALUES(total_count),
         linked_count = VALUES(linked_count),
         unlinked_count = VALUES(unlinked_count),
         stats = VALUES(stats),
         last_checked_at = NOW()`,
      [menuStatus, menuTotalCount, menuLinkedCount, menuUnlinkedCount, JSON.stringify(menuStats)]
    );

    const responseData = {
      hasData: Boolean(externalMenuPayload),
      keys: externalMenuPayload ? Object.keys(externalMenuPayload).slice(0, 20) : [],
      organizationStats: [],
      selectedCategoryIds: [...selectedCategoryIds],
      externalMenuId: useExternalMenuFilter ? externalMenuId : null,
      priceCategoryId: useExternalMenuFilter && priceCategoryId ? priceCategoryId : null,
      externalMenuItemCount: useExternalMenuFilter ? externalMenuItemIds.size : null,
      synced: stats,
      revisions: {},
    };

    await finishIntegrationEvent(logId, {
      status: "success",
      responseData,
      durationMs: Date.now() - startedAt,
    });

    return externalMenuPayload;
  } catch (error) {
    await finishIntegrationEvent(logId, {
      status: "failed",
      errorMessage: error?.message || "Ошибка синхронизации",
      durationMs: Date.now() - startedAt,
    });
    notifyMenuUpdated({
      source: "iiko-sync",
      status: "failed",
      error: error?.message || "Ошибка синхронизации",
    });
    throw error;
  }
}
