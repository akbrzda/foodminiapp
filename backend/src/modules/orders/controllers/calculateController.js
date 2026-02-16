import db from "../../../config/database.js";
import { findTariffForAmount } from "../../polygons/utils/deliveryTariffs.js";
import { validateBonusUsage, getLoyaltyLevelsFromDb, getRedeemPercentForLevel } from "../../loyalty/services/loyaltyService.js";
import { logger } from "../../../utils/logger.js";
import { badRequest, notFound } from "../../../utils/errors.js";

// Вспомогательные функции
const getTariffsByPolygonId = async (polygonId) => {
  const [rows] = await db.query(
    `SELECT id, polygon_id, amount_from, amount_to, delivery_cost
     FROM delivery_tariffs
     WHERE polygon_id = ?
     ORDER BY amount_from`,
    [polygonId],
  );
  return (rows || []).map((row) => ({
    id: row.id,
    polygon_id: row.polygon_id,
    amount_from: row.amount_from,
    amount_to: row.amount_to === null ? null : Number(row.amount_to),
    delivery_cost: row.delivery_cost,
  }));
};

const resolveDeliveryCost = async (polygonId, amount) => {
  const tariffs = await getTariffsByPolygonId(polygonId);
  if (tariffs.length === 0) {
    return { deliveryCost: 0, tariffs: [{ amount_from: 0, amount_to: null, delivery_cost: 0 }] };
  }
  const tariff = findTariffForAmount(tariffs, amount);
  return { deliveryCost: tariff ? tariff.delivery_cost : 0, tariffs };
};

/**
 * Валидация и расчет стоимости заказа
 */
export const calculateOrder = async (req, res, next) => {
  try {
    const { items, bonus_to_use = 0, city_id, polygon_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw badRequest("Items are required");
    }

    const userId = req.user?.id || req.user?.userId;
    const cityId = city_id || null;

    // Валидация товаров
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const { item_id, variant_id, quantity = 1, modifiers = [] } = item;

      if (!item_id || quantity < 1) {
        return res.status(400).json({ error: "Invalid item data" });
      }

      // Получение товара
      const [menuItems] = await db.query("SELECT id, name, price, weight, weight_unit, is_active FROM menu_items WHERE id = ? AND is_active = TRUE", [
        item_id,
      ]);

      if (menuItems.length === 0) {
        return res.status(400).json({ error: `Menu item ${item_id} not found or inactive` });
      }

      const menuItem = menuItems[0];
      let itemBasePrice = parseFloat(menuItem.price);
      let variantName = null;

      // Проверка городских цен
      if (cityId) {
        const [cityAvailability] = await db.query(
          `SELECT is_active
           FROM menu_item_cities
           WHERE item_id = ? AND city_id = ?
           LIMIT 1`,
          [item_id, cityId],
        );
        if (cityAvailability.length > 0 && !cityAvailability[0].is_active) {
          return res.status(400).json({ error: `Item ${item_id} is not available in this city` });
        }

        const [cityPrices] = await db.query(
          `SELECT price
           FROM menu_item_prices
           WHERE item_id = ? AND city_id = ? AND fulfillment_type = 'delivery'
           LIMIT 1`,
          [item_id, cityId],
        );

        if (cityPrices.length > 0) {
          itemBasePrice = parseFloat(cityPrices[0].price);
        }
      }

      // Проверка варианта
      if (variant_id) {
        const [variants] = await db.query("SELECT id, name, price, is_active FROM item_variants WHERE id = ? AND item_id = ?", [variant_id, item_id]);

        if (variants.length === 0 || !variants[0].is_active) {
          return res.status(400).json({ error: `Variant ${variant_id} not found or inactive` });
        }

        const variant = variants[0];
        variantName = variant.name;
        itemBasePrice = parseFloat(variant.price);

        if (cityId) {
          const [cityVariantPrices] = await db.query(
            `SELECT price
             FROM menu_variant_prices
             WHERE variant_id = ? AND city_id = ? AND fulfillment_type = 'delivery'
             LIMIT 1`,
            [variant_id, cityId],
          );

          if (cityVariantPrices.length > 0) {
            itemBasePrice = parseFloat(cityVariantPrices[0].price);
          }
        }
      }

      // Валидация модификаторов
      const validatedModifiers = [];
      let modifiersTotal = 0;

      if (modifiers && Array.isArray(modifiers) && modifiers.length > 0) {
        for (const modId of modifiers) {
          const [newModifiers] = await db.query(
            "SELECT m.id, m.name, m.price, m.weight, m.weight_unit, m.is_active, m.group_id, mg.type, mg.is_required FROM modifiers m JOIN modifier_groups mg ON m.group_id = mg.id WHERE m.id = ? AND m.is_active = TRUE",
            [modId],
          );

          if (newModifiers.length === 0) {
            return res.status(400).json({ error: `Modifier ${modId} not found or inactive` });
          }

          const modifier = newModifiers[0];
          let modifierPrice = parseFloat(modifier.price);

          if (cityId) {
            const [cityModifierPrices] = await db.query(
              `SELECT price, is_active
               FROM menu_modifier_prices
               WHERE modifier_id = ? AND city_id = ?
               LIMIT 1`,
              [modifier.id, cityId],
            );

          if (cityModifierPrices.length > 0) {
            if (!cityModifierPrices[0].is_active) {
              return res.status(400).json({ error: `Modifier ${modifier.id} is not available in this city` });
            }
            modifierPrice = parseFloat(cityModifierPrices[0].price);
          }
        }

        if (variant_id) {
          const [variantPrices] = await db.query(
            `SELECT price
             FROM menu_modifier_variant_prices
             WHERE modifier_id = ? AND variant_id = ?
             LIMIT 1`,
            [modifier.id, variant_id],
          );
          if (variantPrices.length > 0) {
            modifierPrice = parseFloat(variantPrices[0].price);
          }
        }

        modifiersTotal += modifierPrice;
          validatedModifiers.push({
            id: modifier.id,
            name: modifier.name,
            price: modifierPrice,
            group_id: modifier.group_id,
            type: modifier.type,
            is_required: modifier.is_required,
            weight_value: modifier.weight ?? null,
            weight_unit: modifier.weight_unit ?? null,
          });
        }
      }

      const unitPrice = itemBasePrice + modifiersTotal;
      const itemSubtotal = unitPrice * quantity;
      subtotal += itemSubtotal;

      validatedItems.push({
        item_id: menuItem.id,
        item_name: menuItem.name,
        variant_id: variant_id || null,
        variant_name: variantName,
        item_price: itemBasePrice,
        quantity,
        modifiers: validatedModifiers,
        subtotal: itemSubtotal,
      });
    }

    // Валидация бонусов
    let bonusUsed = 0;
    if (bonus_to_use > 0) {
      const [userRows] = await db.query("SELECT current_loyalty_level_id FROM users WHERE id = ?", [userId]);

      if (userRows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const loyaltyLevelId = userRows[0]?.current_loyalty_level_id || 1;
      const loyaltyLevels = await getLoyaltyLevelsFromDb();
      const maxUsePercent = getRedeemPercentForLevel(loyaltyLevelId, loyaltyLevels);
      const bonusValidation = await validateBonusUsage(userId, bonus_to_use, subtotal, maxUsePercent);
      if (!bonusValidation.valid) {
        return res.status(400).json({
          error: bonusValidation.error,
        });
      }

      bonusUsed = bonus_to_use;
    }

    const total = subtotal - bonusUsed;

    // Расчет доставки
    let deliveryCost = 0;
    let deliveryTariffs = [];

    if (polygon_id) {
      const result = await resolveDeliveryCost(polygon_id, total);
      deliveryCost = result.deliveryCost;
      deliveryTariffs = result.tariffs;
    }

    const finalTotal = total + deliveryCost;

    res.json({
      subtotal,
      bonus_used: bonusUsed,
      total,
      delivery_cost: deliveryCost,
      final_total: finalTotal,
      delivery_tariffs: deliveryTariffs,
      items: validatedItems,
    });
  } catch (error) {
    next(error);
  }
};
