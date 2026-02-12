import axios from "axios";
import db from "../../../config/database.js";
import {
  calculateEarnedBonuses,
  validateBonusUsage,
  spendBonuses,
  getLoyaltyLevelsFromDb,
  getRedeemPercentForLevel,
} from "../../loyalty/services/loyaltyService.js";
import { logger } from "../../../utils/logger.js";
import { addTelegramNotification } from "../../../queues/config.js";
import { getSystemSettings } from "../../../utils/settings.js";
import { findTariffForAmount } from "../../polygons/utils/deliveryTariffs.js";
import { checkBranchIsOpen } from "../../../utils/workingHours.js";

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

const ensureOrderAccess = (settings, orderType, res) => {
  if (orderType === "delivery" && !settings.delivery_enabled) {
    res.status(400).json({ error: "Delivery is disabled" });
    return false;
  }
  if (orderType === "pickup" && !settings.pickup_enabled) {
    res.status(400).json({ error: "Pickup is disabled" });
    return false;
  }
  return true;
};

const ensureBranchIsOpen = async (connection, branchId, cityId) => {
  const [branches] = await connection.query(
    `SELECT b.id, b.name, b.working_hours, b.is_active, c.timezone 
     FROM branches b
     JOIN cities c ON b.city_id = c.id
     WHERE b.id = ? AND b.city_id = ?`,
    [branchId, cityId],
  );

  if (branches.length === 0) {
    return { ok: false, error: "Branch not found" };
  }

  const branch = branches[0];

  // Проверка активности филиала
  if (!branch.is_active) {
    return { ok: false, error: `Branch ${branch.name} is inactive` };
  }

  // Проверка графика работы
  const openState = checkBranchIsOpen(branch.working_hours, branch.timezone || "Europe/Moscow");

  if (!openState.isOpen) {
    return { ok: false, error: `Branch ${branch.name} is currently closed` };
  }

  return { ok: true };
};

const generateOrderNumber = async (connection) => {
  const [result] = await connection.query(
    `SELECT LPAD(
       CASE
         WHEN COALESCE(MAX(CAST(order_number AS UNSIGNED)), 0) >= 9999 THEN 1
         ELSE COALESCE(MAX(CAST(order_number AS UNSIGNED)), 0) + 1
       END,
       4,
       '0'
     ) as next_number
     FROM orders`,
  );
  return result[0]?.next_number || "0001";
};

const resolveInternalApiBaseUrl = (req) => {
  const fromEnv = (process.env.INTERNAL_API_URL || process.env.API_INTERNAL_URL || "").trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const host = req.get("host");
  const protocol = req.protocol === "https" && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host || "") ? "http" : req.protocol;
  return `${protocol}://${host}`;
};

const calculateOrderCost = async (items, { cityId, fulfillmentType, bonusToUse }) => {
  let subtotal = 0;
  const validatedItems = [];

  for (const item of items) {
    const { item_id, variant_id, quantity = 1, modifiers = [] } = item;

    if (!item_id || quantity < 1) {
      throw new Error("Invalid item data");
    }

    // Получение товара
    const [menuItems] = await db.query("SELECT id, name, price, weight, weight_unit, is_active FROM menu_items WHERE id = ? AND is_active = TRUE", [
      item_id,
    ]);

    if (menuItems.length === 0) {
      throw new Error(`Menu item ${item_id} not found or inactive`);
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
        throw new Error(`Item ${item_id} is not available in this city`);
      }

      const [cityPrices] = await db.query(
        `SELECT price
         FROM menu_item_prices
         WHERE item_id = ? AND city_id = ? AND fulfillment_type = ?
         LIMIT 1`,
        [item_id, cityId, fulfillmentType],
      );

      if (cityPrices.length > 0) {
        itemBasePrice = parseFloat(cityPrices[0].price);
      } else {
        const [fallbackPrices] = await db.query(
          `SELECT price
           FROM menu_item_prices
           WHERE item_id = ? AND city_id IS NULL AND fulfillment_type = ?
           LIMIT 1`,
          [item_id, fulfillmentType],
        );
        if (fallbackPrices.length > 0) {
          itemBasePrice = parseFloat(fallbackPrices[0].price);
        }
      }
    }

    // Проверка варианта
    if (variant_id) {
      const [variants] = await db.query("SELECT id, name, price, is_active FROM item_variants WHERE id = ? AND item_id = ?", [variant_id, item_id]);

      if (variants.length === 0 || !variants[0].is_active) {
        throw new Error(`Variant ${variant_id} not found or inactive`);
      }

      const variant = variants[0];
      variantName = variant.name;
      itemBasePrice = parseFloat(variant.price);

      if (cityId) {
        const [cityVariantPrices] = await db.query(
          `SELECT price
           FROM menu_variant_prices
           WHERE variant_id = ? AND city_id = ? AND fulfillment_type = ?
           LIMIT 1`,
          [variant_id, cityId, fulfillmentType],
        );

        if (cityVariantPrices.length > 0) {
          itemBasePrice = parseFloat(cityVariantPrices[0].price);
        } else {
          const [fallbackVariantPrices] = await db.query(
            `SELECT price
             FROM menu_variant_prices
             WHERE variant_id = ? AND city_id IS NULL AND fulfillment_type = ?
             LIMIT 1`,
            [variant_id, fulfillmentType],
          );
          if (fallbackVariantPrices.length > 0) {
            itemBasePrice = parseFloat(fallbackVariantPrices[0].price);
          }
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
          throw new Error(`Modifier ${modId} not found or inactive`);
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
              throw new Error(`Modifier ${modifier.id} is not available in this city`);
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

  const bonusUsed = Math.min(bonusToUse, subtotal);
  const total = subtotal - bonusUsed;

  return {
    subtotal,
    bonusUsed,
    total,
    validatedItems,
  };
};

/**
 * Создание нового заказа
 */
export const createOrder = async (req, res, next) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      city_id,
      branch_id,
      order_type,
      items,
      payment_method,
      change_from,
      bonus_to_use = 0,
      comment,
      desired_time,
      timezone_offset,
      delivery_address_id,
      delivery_street,
      delivery_house,
      delivery_entrance,
      delivery_floor,
      delivery_apartment,
      delivery_intercom,
      delivery_comment,
      delivery_latitude,
      delivery_longitude,
    } = req.body;

    // Валидация основных полей
    if (!city_id || !order_type || !items || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        error: "city_id, order_type, and items are required",
      });
    }

    if (!["delivery", "pickup"].includes(order_type)) {
      await connection.rollback();
      return res.status(400).json({
        error: "order_type must be 'delivery' or 'pickup'",
      });
    }

    const settings = await getSystemSettings();
    const loyaltyLevels = await getLoyaltyLevelsFromDb();
    let loyaltyLevel = 1;

    if (settings.bonuses_enabled) {
      const [userData] = await db.query("SELECT current_loyalty_level_id FROM users WHERE id = ?", [req.user.id]);
      loyaltyLevel = userData[0]?.current_loyalty_level_id || 1;
    }

    const maxUsePercent = getRedeemPercentForLevel(loyaltyLevel, loyaltyLevels);

    if (!ensureOrderAccess(settings, order_type, res)) {
      await connection.rollback();
      return;
    }

    if (!["cash", "card"].includes(payment_method)) {
      await connection.rollback();
      return res.status(400).json({
        error: "payment_method must be 'cash' or 'card'",
      });
    }

    if (order_type === "pickup" && !branch_id) {
      await connection.rollback();
      return res.status(400).json({
        error: "branch_id is required for pickup orders",
      });
    }

    if (order_type === "pickup") {
      const openCheck = await ensureBranchIsOpen(connection, branch_id, city_id);
      if (!openCheck.ok) {
        await connection.rollback();
        return res.status(400).json({ error: openCheck.error });
      }
    }

    if (order_type === "delivery" && (!delivery_street || !delivery_house)) {
      await connection.rollback();
      return res.status(400).json({
        error: "delivery address is required for delivery orders",
      });
    }

    let deliveryCost = 0;
    let deliveryPolygon = null;
    let deliveryLatitude = null;
    let deliveryLongitude = null;

    // Обработка доставки
    if (order_type === "delivery") {
      try {
        const internalApiBaseUrl = resolveInternalApiBaseUrl(req);
        const providedLat = Number(delivery_latitude);
        const providedLng = Number(delivery_longitude);

        if (Number.isFinite(providedLat) && Number.isFinite(providedLng)) {
          deliveryLatitude = providedLat;
          deliveryLongitude = providedLng;
        } else if (delivery_address_id) {
          const [storedAddresses] = await connection.query("SELECT latitude, longitude FROM delivery_addresses WHERE id = ? AND user_id = ?", [
            delivery_address_id,
            req.user.id,
          ]);
          if (storedAddresses.length > 0) {
            deliveryLatitude = Number(storedAddresses[0]?.latitude);
            deliveryLongitude = Number(storedAddresses[0]?.longitude);
          }
        }

        // Геокодирование если нет координат
        if (!Number.isFinite(deliveryLatitude) || !Number.isFinite(deliveryLongitude)) {
          if (delivery_street && delivery_house) {
            const geocodeResponse = await axios.post(
              `${internalApiBaseUrl}/api/polygons/geocode`,
              { address: `${delivery_street}, ${delivery_house}` },
              { headers: { "Content-Type": "application/json" } },
            );

            if (geocodeResponse.data && geocodeResponse.data.lat && geocodeResponse.data.lng) {
              deliveryLatitude = Number(geocodeResponse.data.lat);
              deliveryLongitude = Number(geocodeResponse.data.lng);
            }
          }
        }

        const hasCoords = Number.isFinite(deliveryLatitude) && Number.isFinite(deliveryLongitude);
        if (!hasCoords) {
          await connection.rollback();
          return res.status(400).json({
            error: "Не удалось определить координаты адреса доставки",
          });
        }

        // Проверка зоны доставки
        const checkDeliveryZone = async (lat, lon) => {
          const response = await axios.post(
            `${internalApiBaseUrl}/api/polygons/check-delivery`,
            {
              latitude: lat,
              longitude: lon,
              city_id: city_id,
            },
            { headers: { "Content-Type": "application/json" } },
          );

          if (response.data && response.data.available && response.data.polygon) {
            return response.data.polygon;
          }
          return null;
        };

        deliveryPolygon = await checkDeliveryZone(deliveryLatitude, deliveryLongitude);

        if (!deliveryPolygon) {
          const swappedPolygon = await checkDeliveryZone(deliveryLongitude, deliveryLatitude);
          if (swappedPolygon) {
            [deliveryLatitude, deliveryLongitude] = [deliveryLongitude, deliveryLatitude];
            deliveryPolygon = swappedPolygon;
          }
        }

        if (!deliveryPolygon) {
          await connection.rollback();
          return res.status(400).json({
            error: "Доставка по этому адресу недоступна.",
          });
        }

        if (!deliveryPolygon.branch_id) {
          await connection.rollback();
          return res.status(400).json({ error: "Branch not found" });
        }

        const openCheck = await ensureBranchIsOpen(connection, deliveryPolygon.branch_id, city_id);
        if (!openCheck.ok) {
          await connection.rollback();
          return res.status(400).json({ error: openCheck.error });
        }

        deliveryCost = 0;
      } catch (geoError) {
        logger.error("Geocoding error", { error: geoError });
      }
    }

    const fulfillmentType = order_type === "pickup" ? "pickup" : "delivery";
    const effectiveBonusToUse = settings.bonuses_enabled ? bonus_to_use : 0;

    // Расчет стоимости заказа
    let { subtotal, bonusUsed, total, validatedItems } = await calculateOrderCost(items, {
      cityId: city_id,
      fulfillmentType,
      bonusToUse: effectiveBonusToUse,
    });

    // Валидация бонусов
    if (settings.bonuses_enabled && effectiveBonusToUse > 0) {
      const bonusValidation = await validateBonusUsage(req.user.id, effectiveBonusToUse, subtotal, maxUsePercent);
      if (!bonusValidation.valid) {
        await connection.rollback();
        return res.status(400).json({ error: bonusValidation.error });
      }
    }

    // Расчет стоимости доставки
    if (order_type === "delivery" && deliveryPolygon) {
      const amountForTariff = Math.floor(total);
      const { deliveryCost: resolvedCost } = await resolveDeliveryCost(deliveryPolygon.id, amountForTariff);
      deliveryCost = resolvedCost;
    }

    const finalTotal = total + deliveryCost;

    // Расчет начисленных бонусов
    let earnedBonuses = 0;
    if (settings.bonuses_enabled) {
      const baseAmount = subtotal - bonusUsed;
      earnedBonuses = calculateEarnedBonuses(Math.max(0, baseAmount), loyaltyLevel, loyaltyLevels);
    }

    const orderNumber = await generateOrderNumber(connection);
    const timezoneOffset = Number.isFinite(Number(timezone_offset)) ? Number(timezone_offset) : 0;
    const normalizedTimezoneOffset = Math.max(-840, Math.min(840, Math.trunc(timezoneOffset)));
    const resolvedBranchId = order_type === "delivery" ? deliveryPolygon?.branch_id || null : branch_id || null;

    if (order_type === "delivery" && !resolvedBranchId) {
      await connection.rollback();
      return res.status(400).json({ error: "Не удалось определить филиал доставки" });
    }

    // Создание/обновление адреса доставки
    let resolvedDeliveryAddressId = delivery_address_id || null;
    if (order_type === "delivery" && !resolvedDeliveryAddressId && deliveryLatitude && deliveryLongitude) {
      const [addressResult] = await connection.query(
        `INSERT INTO delivery_addresses
         (user_id, city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          city_id,
          delivery_street || "",
          delivery_house || "",
          delivery_entrance || null,
          delivery_apartment || null,
          delivery_intercom || null,
          delivery_comment || null,
          deliveryLatitude,
          deliveryLongitude,
          0,
        ],
      );
      resolvedDeliveryAddressId = addressResult.insertId;
    }

    // Создание заказа
    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (order_number, user_id, city_id, branch_id, order_type, status, 
        delivery_address_id, delivery_latitude, delivery_longitude, delivery_street, delivery_house, delivery_entrance, delivery_floor,
        delivery_apartment, delivery_intercom, delivery_comment, 
        payment_method, change_from, subtotal, delivery_cost, bonus_spent, total, 
        comment, desired_time, user_timezone_offset)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        req.user.id,
        city_id,
        resolvedBranchId,
        order_type,
        resolvedDeliveryAddressId,
        deliveryLatitude,
        deliveryLongitude,
        delivery_street || null,
        delivery_house || null,
        delivery_entrance || null,
        delivery_floor || null,
        delivery_apartment || null,
        delivery_intercom || null,
        delivery_comment || null,
        payment_method,
        change_from || null,
        subtotal,
        deliveryCost,
        bonusUsed,
        finalTotal,
        comment || null,
        desired_time || null,
        normalizedTimezoneOffset,
      ],
    );

    const orderId = orderResult.insertId;

    // Добавление товаров в заказ
    for (const item of validatedItems) {
      const [itemResult] = await connection.query(
        `INSERT INTO order_items 
         (order_id, item_id, item_name, variant_id, variant_name, item_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.item_id, item.item_name, item.variant_id || null, item.variant_name || null, item.item_price, item.quantity, item.subtotal],
      );

      const orderItemId = itemResult.insertId;

      // Добавление модификаторов
      for (const modifier of item.modifiers) {
        await connection.query(
          `INSERT INTO order_item_modifiers 
           (order_item_id, modifier_id, modifier_name, modifier_price, modifier_group_id, modifier_weight, modifier_weight_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderItemId,
            modifier.id,
            modifier.name,
            modifier.price,
            modifier.group_id || null,
            modifier.weight_value || null,
            modifier.weight_unit || null,
          ],
        );
      }
    }

    // Обработка бонусов
    if (settings.bonuses_enabled) {
      try {
        await spendBonuses(
          {
            id: orderId,
            user_id: req.user.id,
            order_number: orderNumber,
            total: finalTotal,
            subtotal,
            delivery_cost: deliveryCost,
            bonus_spent: bonusUsed,
          },
          connection,
        );
      } catch (bonusError) {
        await connection.rollback();
        return res.status(400).json({ error: bonusError.message });
      }
    }

    await connection.commit();

    // Получение созданного заказа
    const [orders] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    const order = orders[0];

    if (order?.branch_id) {
      const [branchCoords] = await db.query("SELECT latitude, longitude FROM branches WHERE id = ?", [order.branch_id]);
      order.branch_latitude = branchCoords[0]?.latitude || null;
      order.branch_longitude = branchCoords[0]?.longitude || null;
    }

    if (order?.delivery_address_id) {
      const [deliveryCoords] = await db.query("SELECT latitude, longitude FROM delivery_addresses WHERE id = ?", [order.delivery_address_id]);
      order.delivery_latitude = deliveryCoords[0]?.latitude || null;
      order.delivery_longitude = deliveryCoords[0]?.longitude || null;
    }

    const [orderItems] = await db.query(
      `SELECT oi.*, 
        (SELECT JSON_ARRAYAGG(
          JSON_OBJECT('modifier_id', oim.modifier_id, 'modifier_name', oim.modifier_name, 'modifier_price', oim.modifier_price)
        ) 
        FROM order_item_modifiers oim 
        WHERE oim.order_item_id = oi.id) as modifiers
      FROM order_items oi 
      WHERE oi.order_id = ?`,
      [orderId],
    );

    await logger.order.created(orderId, req.user.id, finalTotal);

    // WebSocket уведомление
    try {
      const { wsServer } = await import("../../index.js");
      wsServer.notifyNewOrder({
        ...order,
        bonuses_earned: earnedBonuses,
        city_id: city_id,
      });
    } catch (wsError) {
      // WebSocket errors are non-critical
    }

    // Telegram уведомление
    try {
      await addTelegramNotification({
        type: "new_order",
        priority: 1,
        data: {
          order_number: orderNumber,
          order_type: order_type,
          branch_name: branch_id ? (await db.query("SELECT name FROM branches WHERE id = ?", [branch_id]))[0]?.[0]?.name : null,
          delivery_street,
          delivery_house,
          delivery_apartment,
          delivery_entrance,
          total: finalTotal,
          items: orderItems.map((item) => ({
            item_name: item.item_name,
            variant_name: item.variant_name,
            quantity: item.quantity,
            subtotal: item.subtotal,
            modifiers: (() => {
              if (!item.modifiers) return [];
              if (Array.isArray(item.modifiers)) return item.modifiers;
              if (typeof item.modifiers === "string") {
                try {
                  return JSON.parse(item.modifiers);
                } catch (parseError) {
                  return [];
                }
              }
              return [];
            })(),
          })),
          payment_method,
          comment,
        },
      });
    } catch (queueError) {
      logger.error("Failed to queue Telegram notification", { error: queueError });
    }

    res.status(201).json({
      order: order,
      bonuses_earned: earnedBonuses,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};
