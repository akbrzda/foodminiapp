import express from "express";
import axios from "axios";
import db from "../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";
import {
  calculateEarnedBonuses,
  validateBonusUsage,
  earnBonuses,
  spendBonuses,
  cancelOrderBonuses,
  removeEarnedBonuses,
  redeliveryEarnBonuses,
  getLoyaltyLevelsFromDb,
  getRedeemPercentForLevel,
} from "../utils/bonuses.js";
import { logger, adminActionLogger } from "../utils/logger.js";
import { addTelegramNotification } from "../queues/config.js";
import { getSystemSettings } from "../utils/settings.js";
const router = express.Router();

const getTimeZoneOffset = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  const utcTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (utcTime - date.getTime()) / 60000;
};

const zonedTimeToUtc = (localDateTime, timeZone) => {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = localDateTime;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTimeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
};

const getShiftWindowUtc = (timeZone, now = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  const localHour = Number(parts.hour);
  const localDate = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
  const shiftStartDate = (() => {
    if (localHour >= 5) {
      return localDate;
    }
    const base = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
    base.setUTCDate(base.getUTCDate() - 1);
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
  })();
  const shiftEndDateBase = new Date(Date.UTC(shiftStartDate.year, shiftStartDate.month - 1, shiftStartDate.day));
  shiftEndDateBase.setUTCDate(shiftEndDateBase.getUTCDate() + 1);
  const shiftEndDate = {
    year: shiftEndDateBase.getUTCFullYear(),
    month: shiftEndDateBase.getUTCMonth() + 1,
    day: shiftEndDateBase.getUTCDate(),
  };
  const startUtc = zonedTimeToUtc({ ...shiftStartDate, hour: 5 }, timeZone);
  const endUtc = zonedTimeToUtc({ ...shiftEndDate, hour: 5 }, timeZone);
  return { startUtc, endUtc };
};
const ensureOrderAccess = (settings, orderType, res) => {
  if (!settings.orders_enabled) {
    res.status(403).json({ error: "Прием заказов временно отключен" });
    return false;
  }
  if (orderType === "delivery" && !settings.delivery_enabled) {
    res.status(400).json({ error: "Доставка временно отключена" });
    return false;
  }
  if (orderType === "pickup" && !settings.pickup_enabled) {
    res.status(400).json({ error: "Самовывоз временно отключен" });
    return false;
  }
  return true;
};
async function generateOrderNumber() {
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    const orderNumber = Math.floor(1000 + Math.random() * 9000).toString();
    const [existing] = await db.query("SELECT id FROM orders WHERE order_number = ?", [orderNumber]);
    if (existing.length === 0) {
      return orderNumber;
    }
    attempts++;
  }
  throw new Error("Failed to generate unique order number");
}
const sumSubtotal = (items) => items.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
async function calculateOrderCost(items, { cityId, fulfillmentType, bonusToUse = 0 } = {}) {
  let subtotal = 0;
  const validatedItems = [];
  for (const item of items) {
    const { item_id, variant_id, quantity, modifiers = [] } = item;
    if (!item_id || !quantity || quantity <= 0) {
      throw new Error("Invalid item data");
    }
    const [menuItems] = await db.query("SELECT id, name, price, is_active, category_id FROM menu_items WHERE id = ?", [item_id]);
    if (menuItems.length === 0 || !menuItems[0].is_active) {
      throw new Error(`Item ${item_id} not found or inactive`);
    }
    const menuItem = menuItems[0];
    let itemBasePrice = 0;
    let variantName = null;
    if (variant_id) {
      const [variants] = await db.query("SELECT id, name, price, is_active FROM item_variants WHERE id = ? AND item_id = ?", [variant_id, item_id]);
      if (variants.length === 0 || !variants[0].is_active) {
        throw new Error(`Variant ${variant_id} not found or inactive`);
      }
      const variant = variants[0];
      if (fulfillmentType) {
        const [variantPrices] = await db.query(
          `SELECT price FROM menu_variant_prices
           WHERE variant_id = ?
             AND (city_id = ? OR city_id IS NULL)
             AND fulfillment_type = ?
           ORDER BY city_id DESC
           LIMIT 1`,
          [variant_id, cityId || null, fulfillmentType],
        );
        itemBasePrice = variantPrices.length > 0 ? parseFloat(variantPrices[0].price) : NaN;
      } else {
        itemBasePrice = parseFloat(variant.price);
      }
      if (!Number.isFinite(itemBasePrice)) {
        itemBasePrice = parseFloat(variant.price);
      }
      variantName = variant.name;
    } else {
      if (fulfillmentType) {
        const [itemPrices] = await db.query(
          `SELECT price FROM menu_item_prices
           WHERE item_id = ?
             AND (city_id = ? OR city_id IS NULL)
             AND fulfillment_type = ?
           ORDER BY city_id DESC
           LIMIT 1`,
          [item_id, cityId || null, fulfillmentType],
        );
        itemBasePrice = itemPrices.length > 0 ? parseFloat(itemPrices[0].price) : NaN;
      } else {
        itemBasePrice = parseFloat(menuItem.price);
      }
      if (!Number.isFinite(itemBasePrice)) {
        itemBasePrice = parseFloat(menuItem.price);
      }
      if (itemBasePrice <= 0) {
        throw new Error(`Item ${item_id} has no price and no variant specified`);
      }
    }
    const validatedModifiers = [];
    let modifiersTotal = 0;
    if (modifiers && Array.isArray(modifiers) && modifiers.length > 0) {
      for (const modId of modifiers) {
        const [newModifiers] = await db.query(
          "SELECT m.id, m.name, m.price, m.is_active, m.group_id, mg.type, mg.is_required FROM modifiers m JOIN modifier_groups mg ON m.group_id = mg.id WHERE m.id = ? AND m.is_active = TRUE",
          [modId],
        );
        if (newModifiers.length > 0) {
          const modifier = newModifiers[0];
          let modifierPrice = parseFloat(modifier.price);
          if (variant_id) {
            const [variantModifierPrices] = await db.query(
              `SELECT price FROM menu_modifier_variant_prices
               WHERE modifier_id = ? AND variant_id = ?
               LIMIT 1`,
              [modifier.id, variant_id],
            );
            if (variantModifierPrices.length > 0) {
              modifierPrice = parseFloat(variantModifierPrices[0].price);
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
          });
        } else {
          const [oldModifiers] = await db.query("SELECT id, name, price, is_active FROM menu_modifiers WHERE id = ? AND item_id = ?", [
            modId,
            item_id,
          ]);
          if (oldModifiers.length === 0 || !oldModifiers[0].is_active) {
            throw new Error(`Modifier ${modId} not found or inactive`);
          }
          const modifier = oldModifiers[0];
          const modifierPrice = parseFloat(modifier.price);
          modifiersTotal += modifierPrice;
          validatedModifiers.push({
            id: modifier.id,
            name: modifier.name,
            price: modifierPrice,
            old_system: true,
          });
        }
      }
    }
    const unitPrice = itemBasePrice + modifiersTotal;
    const itemSubtotal = unitPrice * quantity;
    subtotal += itemSubtotal;
    validatedItems.push({
      item_id: menuItem.id,
      category_id: menuItem.category_id,
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
}
router.post("/calculate", authenticateToken, async (req, res, next) => {
  try {
    const { items, bonus_to_use = 0, delivery_cost = 0, order_type, delivery_polygon_id, city_id, timezone_offset } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items are required" });
    }
    if (order_type && !["delivery", "pickup"].includes(order_type)) {
      return res.status(400).json({ error: "order_type must be 'delivery' or 'pickup'" });
    }
    const settings = await getSystemSettings();
    const loyaltyLevels = await getLoyaltyLevelsFromDb();
    let loyaltyLevel = 1;
    if (settings.bonuses_enabled) {
      const [userData] = await db.query("SELECT current_loyalty_level_id FROM users WHERE id = ?", [req.user.id]);
      loyaltyLevel = userData[0]?.current_loyalty_level_id || 1;
    }
    const maxUsePercent = getRedeemPercentForLevel(loyaltyLevel, loyaltyLevels);
    const orderType = order_type === "pickup" ? "pickup" : "delivery";
    if (!ensureOrderAccess(settings, orderType, res)) return;
    const effectiveBonusToUse = settings.bonuses_enabled ? bonus_to_use : 0;
    const fulfillmentType = orderType;
    let { subtotal, bonusUsed, total, validatedItems } = await calculateOrderCost(items, {
      cityId: city_id,
      fulfillmentType,
      bonusToUse: effectiveBonusToUse,
    });
    if (orderType === "delivery" && delivery_polygon_id) {
      const [polygons] = await db.query("SELECT min_order_amount FROM delivery_polygons WHERE id = ?", [delivery_polygon_id]);
      const minOrderAmount = parseFloat(polygons[0]?.min_order_amount) || 0;
      if (minOrderAmount > 0 && subtotal < minOrderAmount) {
        return res.status(400).json({
          error: `Minimum order amount is ${minOrderAmount}`,
        });
      }
    }
    if (settings.bonuses_enabled && effectiveBonusToUse > 0) {
      const bonusValidation = await validateBonusUsage(req.user.id, effectiveBonusToUse, subtotal, maxUsePercent);
      if (!bonusValidation.valid) {
        return res.status(400).json({ error: bonusValidation.error });
      }
    }
    const finalTotal = total + parseFloat(delivery_cost);
    let earnedBonuses = 0;
    if (settings.bonuses_enabled) {
      const baseAmount = subtotal - bonusUsed;
      earnedBonuses = calculateEarnedBonuses(Math.max(0, baseAmount), loyaltyLevel, loyaltyLevels);
    }
    res.json({
      subtotal,
      delivery_cost: parseFloat(delivery_cost),
      bonus_spent: bonusUsed,
      total: finalTotal,
      bonuses_to_earn: earnedBonuses,
      items: validatedItems,
    });
  } catch (error) {
    next(error);
  }
});
router.post("/", authenticateToken, async (req, res, next) => {
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
    if (order_type === "delivery") {
      try {
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
        if (!Number.isFinite(deliveryLatitude) || !Number.isFinite(deliveryLongitude)) {
          if (delivery_street && delivery_house) {
          const geocodeResponse = await axios.post(
            `${req.protocol}://${req.get("host")}/api/polygons/geocode`,
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
        const checkDeliveryZone = async (lat, lon) => {
          const response = await axios.post(
            `${req.protocol}://${req.get("host")}/api/polygons/check-delivery`,
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
            error: "Delivery is not available to this address",
          });
        }
        deliveryCost = parseFloat(deliveryPolygon.delivery_cost) || 0;
      } catch (geoError) {
        console.error("Geocoding error:", geoError);
      }
    }
    const fulfillmentType = order_type === "pickup" ? "pickup" : "delivery";
    const effectiveBonusToUse = settings.bonuses_enabled ? bonus_to_use : 0;
    let { subtotal, bonusUsed, total, validatedItems } = await calculateOrderCost(items, {
      cityId: city_id,
      fulfillmentType,
      bonusToUse: effectiveBonusToUse,
    });
    if (order_type === "delivery" && deliveryPolygon) {
      const minOrderAmount = parseFloat(deliveryPolygon.min_order_amount) || 0;
      if (minOrderAmount > 0 && subtotal < minOrderAmount) {
        await connection.rollback();
        return res.status(400).json({
          error: `Minimum order amount is ${minOrderAmount}`,
        });
      }
    }
    if (settings.bonuses_enabled && effectiveBonusToUse > 0) {
      const bonusValidation = await validateBonusUsage(req.user.id, effectiveBonusToUse, subtotal, maxUsePercent);
      if (!bonusValidation.valid) {
        await connection.rollback();
        return res.status(400).json({ error: bonusValidation.error });
      }
    }
    const finalTotal = total + deliveryCost;
    let earnedBonuses = 0;
    if (settings.bonuses_enabled) {
      const baseAmount = subtotal - bonusUsed;
      earnedBonuses = calculateEarnedBonuses(Math.max(0, baseAmount), loyaltyLevel, loyaltyLevels);
    }
    const orderNumber = await generateOrderNumber();
    const timezoneOffset = Number.isFinite(Number(timezone_offset)) ? Number(timezone_offset) : 0;
    const normalizedTimezoneOffset = Math.max(-840, Math.min(840, Math.trunc(timezoneOffset)));
    const resolvedBranchId = order_type === "delivery" ? deliveryPolygon?.branch_id || null : branch_id || null;
    if (order_type === "delivery" && !resolvedBranchId) {
      await connection.rollback();
      return res.status(400).json({ error: "Не удалось определить филиал доставки" });
    }
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
    for (const item of validatedItems) {
      const [itemResult] = await connection.query(
        `INSERT INTO order_items 
         (order_id, item_id, item_name, variant_id, variant_name, item_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.item_id, item.item_name, item.variant_id || null, item.variant_name || null, item.item_price, item.quantity, item.subtotal],
      );
      const orderItemId = itemResult.insertId;
      for (const modifier of item.modifiers) {
        if (modifier.old_system) {
          await connection.query(
            `INSERT INTO order_item_modifiers 
             (order_item_id, modifier_id, modifier_name, modifier_price, old_modifier_id)
             VALUES (?, ?, ?, ?, ?)`,
            [orderItemId, null, modifier.name, modifier.price, modifier.id],
          );
        } else {
          await connection.query(
            `INSERT INTO order_item_modifiers 
             (order_item_id, modifier_id, modifier_name, modifier_price, modifier_group_id)
             VALUES (?, ?, ?, ?, ?)`,
            [orderItemId, modifier.id, modifier.name, modifier.price, modifier.group_id || null],
          );
        }
      }
    }
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
    try {
      const { wsServer } = await import("../index.js");
      wsServer.notifyNewOrder({
        ...order,
        bonuses_earned: earnedBonuses,
        city_id: city_id,
      });
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }
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
      console.error("Failed to queue Telegram notification:", queueError);
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
});
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    let query = `
            SELECT o.*, 
              o.total as total_amount,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count,
              (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
              c.name as city_name, 
              b.name as branch_name
      FROM orders o
      LEFT JOIN cities c ON o.city_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.user_id = ?
    `;
    const params = [req.user.id];
    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }
    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));
    const [orders] = await db.query(query, params);
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const [orders] = await db.query(
      `SELECT o.*,
              (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
              c.name as city_name, b.name as branch_name, b.address as branch_address
       FROM orders o
       LEFT JOIN cities c ON o.city_id = c.id
       LEFT JOIN branches b ON o.branch_id = b.id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, req.user.id],
    );
    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = orders[0];
    const [items] = await db.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
    for (const item of items) {
      const [modifiers] = await db.query(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`, [item.id]);
      item.modifiers = modifiers;
    }
    order.items = items;
    const [spendRows] = await db.query("SELECT status, amount FROM loyalty_transactions WHERE order_id = ? AND type = 'spend'", [orderId]);
    if (spendRows.length > 0) {
      const hasPending = spendRows.some((row) => row.status === "pending");
      const hasCompleted = spendRows.some((row) => row.status === "completed");
      const allCancelled = spendRows.every((row) => row.status === "cancelled");
      order.bonus_spend_status = allCancelled ? "cancelled" : hasPending ? "pending" : hasCompleted ? "completed" : "pending";
      order.bonus_spend_amount = spendRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
    } else {
      order.bonus_spend_status = null;
      order.bonus_spend_amount = 0;
    }
    const [earnRows] = await db.query(
      "SELECT amount, expires_at, status FROM loyalty_transactions WHERE order_id = ? AND type = 'earn' ORDER BY created_at DESC LIMIT 1",
      [orderId],
    );
    order.bonus_earn_expires_at = earnRows[0]?.expires_at || null;
    order.bonus_earn_status = earnRows[0]?.status || null;
    res.json({ order });
  } catch (error) {
    next(error);
  }
});
router.post("/:id/repeat", authenticateToken, async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const [orders] = await db.query(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, req.user.id]);
    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const [items] = await db.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
    const orderItems = [];
    for (const item of items) {
      const [modifiers] = await db.query(`SELECT modifier_id, old_modifier_id FROM order_item_modifiers WHERE order_item_id = ?`, [item.id]);
      const modifierIds = modifiers.map((m) => m.modifier_id || m.old_modifier_id).filter((id) => id !== null);
      orderItems.push({
        item_id: item.item_id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        modifiers: modifierIds,
      });
    }
    res.json({
      order_data: {
        city_id: orders[0].city_id,
        branch_id: orders[0].branch_id,
        order_type: orders[0].order_type,
        items: orderItems,
        delivery_street: orders[0].delivery_street,
        delivery_house: orders[0].delivery_house,
        delivery_entrance: orders[0].delivery_entrance,
        delivery_floor: orders[0].delivery_floor,
        delivery_apartment: orders[0].delivery_apartment,
        delivery_intercom: orders[0].delivery_intercom,
      },
    });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/all", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_id, status, order_type, date_from, date_to, search, limit = 50, offset = 0 } = req.query;
    let query = `
         SELECT o.*, 
           (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
           c.name as city_name, 
           b.name as branch_name,
           u.phone as user_phone,
           u.first_name as user_first_name,
           u.last_name as user_last_name
        FROM orders o
        LEFT JOIN cities c ON o.city_id = c.id
        LEFT JOIN branches b ON o.branch_id = b.id
        LEFT JOIN users u ON o.user_id = u.id
        WHERE 1=1
      `;
    const params = [];
    if (req.user.role === "manager") {
      query += " AND o.city_id IN (?)";
      params.push(req.user.cities);
    } else if (city_id) {
      query += " AND o.city_id = ?";
      params.push(city_id);
    }
    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }
    if (order_type) {
      query += " AND o.order_type = ?";
      params.push(order_type);
    }
    if (date_from) {
      query += " AND o.created_at >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND o.created_at <= ?";
      params.push(date_to);
    }
    if (search) {
      query += " AND (o.order_number LIKE ? OR u.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));
    const [orders] = await db.query(query, params);
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/shift", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { branch_id, order_type, search } = req.query;
    if (!branch_id) {
      return res.status(400).json({ error: "branch_id is required" });
    }
    const [branches] = await db.query(
      `SELECT b.id, b.city_id, c.timezone
       FROM branches b
       JOIN cities c ON b.city_id = c.id
       WHERE b.id = ?`,
      [branch_id],
    );
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }
    const branch = branches[0];
    if (req.user.role === "manager" && !req.user.cities.includes(branch.city_id)) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }
    const timeZone = branch.timezone || "UTC";
    const { startUtc, endUtc } = getShiftWindowUtc(timeZone, new Date());
    let query = `
         SELECT o.*,
           c.name as city_name,
           c.timezone as city_timezone,
           CASE
             WHEN o.order_type = 'delivery' THEN DATE_ADD(o.created_at, INTERVAL (IFNULL(b.prep_time, 0) + IFNULL(b.assembly_time, 0) + IFNULL(dp.delivery_time, 0)) MINUTE)
             WHEN o.order_type = 'pickup' THEN DATE_ADD(o.created_at, INTERVAL (IFNULL(b.prep_time, 0) + IFNULL(b.assembly_time, 0)) MINUTE)
             ELSE NULL
           END as deadline_time,
           b.name as branch_name,
           b.latitude as branch_latitude,
           b.longitude as branch_longitude,
           u.phone as user_phone,
           u.first_name as user_first_name,
           u.last_name as user_last_name,
           COALESCE(da.latitude, o.delivery_latitude) as delivery_latitude,
           COALESCE(da.longitude, o.delivery_longitude) as delivery_longitude
        FROM orders o
        LEFT JOIN cities c ON o.city_id = c.id
        LEFT JOIN branches b ON o.branch_id = b.id
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN delivery_addresses da ON o.delivery_address_id = da.id
        LEFT JOIN delivery_polygons dp
          ON dp.branch_id = o.branch_id
         AND dp.is_active = TRUE
         AND COALESCE(da.latitude, o.delivery_latitude) IS NOT NULL
         AND COALESCE(da.longitude, o.delivery_longitude) IS NOT NULL
         AND ST_Contains(
           dp.polygon,
           ST_GeomFromText(
             CONCAT('POINT(', COALESCE(da.longitude, o.delivery_longitude), ' ', COALESCE(da.latitude, o.delivery_latitude), ')'),
             4326
           )
         )
        WHERE o.branch_id = ?
          AND o.created_at >= ?
          AND o.created_at < ?
      `;
    const params = [branch_id, startUtc, endUtc];
    if (order_type) {
      query += " AND o.order_type = ?";
      params.push(order_type);
    }
    if (search) {
      query +=
        " AND (o.order_number LIKE ? OR u.phone LIKE ? OR CONCAT_WS(' ', o.delivery_street, o.delivery_house, o.delivery_apartment, o.delivery_entrance, o.delivery_floor) LIKE ?)";
      const searchValue = `%${search}%`;
      params.push(searchValue, searchValue, searchValue);
    }
    query += " ORDER BY o.created_at DESC";
    const [orders] = await db.query(query, params);
    const orderIds = orders.map((order) => order.id);
    const itemsByOrder = new Map();
    if (orderIds.length > 0) {
      const [items] = await db.query(
        `SELECT oi.*, oim.modifier_id, oim.modifier_name, oim.modifier_price, oim.order_item_id
         FROM order_items oi
         LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
         WHERE oi.order_id IN (?)`,
        [orderIds],
      );
      const itemsMap = new Map();
      items.forEach((row) => {
        if (!itemsMap.has(row.id)) {
          itemsMap.set(row.id, { ...row, modifiers: [] });
        }
        if (row.modifier_id || row.modifier_name) {
          itemsMap.get(row.id).modifiers.push({
            modifier_id: row.modifier_id,
            modifier_name: row.modifier_name,
            modifier_price: row.modifier_price,
          });
        }
      });
      itemsMap.forEach((item) => {
        if (!itemsByOrder.has(item.order_id)) {
          itemsByOrder.set(item.order_id, []);
        }
        itemsByOrder.get(item.order_id).push(item);
      });
    }
    const enrichedOrders = orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
    }));
    res.json({
      orders: enrichedOrders,
      shift: {
        start_at: startUtc.toISOString(),
        end_at: endUtc.toISOString(),
        timezone: timeZone,
      },
    });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/count", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_id, status, order_type, date_from, date_to, search } = req.query;
    let query = `
        SELECT COUNT(*) as total
        FROM orders o
        LEFT JOIN cities c ON o.city_id = c.id
        LEFT JOIN branches b ON o.branch_id = b.id
        LEFT JOIN users u ON o.user_id = u.id
        WHERE 1=1
      `;
    const params = [];
    if (req.user.role === "manager") {
      query += " AND o.city_id IN (?)";
      params.push(req.user.cities);
    } else if (city_id) {
      query += " AND o.city_id = ?";
      params.push(city_id);
    }
    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }
    if (order_type) {
      query += " AND o.order_type = ?";
      params.push(order_type);
    }
    if (date_from) {
      query += " AND o.created_at >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND o.created_at <= ?";
      params.push(date_to);
    }
    if (search) {
      query += " AND (o.order_number LIKE ? OR u.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    const [rows] = await db.query(query, params);
    res.json({ total: rows[0]?.total || 0 });
  } catch (error) {
    next(error);
  }
});
router.get("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const [orders] = await db.query(
      `SELECT o.*, 
              (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
              c.name as city_name, 
              b.name as branch_name, 
              b.address as branch_address,
              u.phone as user_phone,
              u.first_name as user_first_name,
              u.last_name as user_last_name,
              ll.name as loyalty_level_name,
              ll.earn_percentage as loyalty_earn_percentage,
              ll.max_spend_percentage as loyalty_max_spend_percentage
       FROM orders o
       LEFT JOIN cities c ON o.city_id = c.id
       LEFT JOIN branches b ON o.branch_id = b.id
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN loyalty_levels ll ON u.current_loyalty_level_id = ll.id
       WHERE o.id = ?`,
      [orderId],
    );
    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = orders[0];
    if (req.user.role === "manager" && !req.user.cities.includes(order.city_id)) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }
    const [items] = await db.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
    for (const item of items) {
      const [modifiers] = await db.query(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`, [item.id]);
      item.modifiers = modifiers;
    }
    order.items = items;
    const [spendRows] = await db.query("SELECT status, amount FROM loyalty_transactions WHERE order_id = ? AND type = 'spend'", [orderId]);
    if (spendRows.length > 0) {
      const hasPending = spendRows.some((row) => row.status === "pending");
      const hasCompleted = spendRows.some((row) => row.status === "completed");
      const allCancelled = spendRows.every((row) => row.status === "cancelled");
      order.bonus_spend_status = allCancelled ? "cancelled" : hasPending ? "pending" : hasCompleted ? "completed" : "pending";
      order.bonus_spend_amount = spendRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
    } else {
      order.bonus_spend_status = null;
      order.bonus_spend_amount = 0;
    }
    const [earnRows] = await db.query(
      "SELECT amount, expires_at, status FROM loyalty_transactions WHERE order_id = ? AND type = 'earn' ORDER BY created_at DESC LIMIT 1",
      [orderId],
    );
    order.bonus_earn_expires_at = earnRows[0]?.expires_at || null;
    order.bonus_earn_status = earnRows[0]?.status || null;
    const bonusBase = Math.max(0, (parseFloat(order.subtotal) || 0) - (parseFloat(order.bonus_spent) || 0));
    order.bonus_base_amount = bonusBase;
    order.bonus_earn_percent = order.loyalty_earn_percentage ?? null;
    order.bonus_level_name = order.loyalty_level_name || null;
    res.json({ order });
  } catch (error) {
    next(error);
  }
});
const handleOrderStatusUpdate = async (req, res, next, forcedStatus = null) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const orderId = req.params.id;
    const status = forcedStatus || req.body.status;
    const validStatuses = ["pending", "confirmed", "preparing", "ready", "delivering", "completed", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }
    const [orders] = await connection.query("SELECT city_id, order_type FROM orders WHERE id = ?", [orderId]);
    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found" });
    }
    if (req.user.role === "manager" && !req.user.cities.includes(orders[0].city_id)) {
      await connection.rollback();
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }
    const [oldOrderData] = await connection.query(
      "SELECT status, user_id, total, subtotal, delivery_cost, bonus_spent, order_number, order_type, bonus_earn_amount, branch_id FROM orders WHERE id = ?",
      [orderId],
    );
    const oldStatus = oldOrderData[0]?.status;
    const userId = oldOrderData[0]?.user_id;
    const orderTotal = parseFloat(oldOrderData[0]?.total) || 0;
    const subtotal = parseFloat(oldOrderData[0]?.subtotal) || 0;
    const deliveryCost = parseFloat(oldOrderData[0]?.delivery_cost) || 0;
    const bonusUsed = parseFloat(oldOrderData[0]?.bonus_spent) || 0;
    const bonusEarnAmount = parseFloat(oldOrderData[0]?.bonus_earn_amount) || 0;
    const orderNumber = oldOrderData[0]?.order_number;
    const statusOrder = {
      pending: 0,
      confirmed: 1,
      preparing: 2,
      ready: 3,
      delivering: 3,
      completed: 4,
      cancelled: -1,
    };
    const oldStatusIndex = statusOrder[oldStatus];
    const newStatusIndex = statusOrder[status];
    if (oldStatusIndex === undefined || newStatusIndex === undefined) {
      await connection.rollback();
      return res.status(400).json({
        error: "Invalid status transition",
      });
    }
    if (status !== "cancelled" && oldStatus !== status && oldStatus === "completed") {
    }
    const settings = await getSystemSettings();
    const loyaltyLevels = await getLoyaltyLevelsFromDb(connection);
    const orderData = {
      id: orderId,
      user_id: userId,
      order_number: orderNumber,
      total: orderTotal,
      subtotal,
      delivery_cost: deliveryCost,
      bonus_spent: bonusUsed,
      bonus_earn_amount: bonusEarnAmount,
    };
    await connection.query("UPDATE orders SET status = ?, completed_at = ? WHERE id = ?", [
      status,
      status === "completed" ? new Date() : null,
      orderId,
    ]);
    if (settings.bonuses_enabled && oldStatus === "completed" && status !== "completed" && status !== "cancelled") {
      try {
        await removeEarnedBonuses(orderData, connection, loyaltyLevels);
      } catch (bonusError) {
        await connection.rollback();
        return res.status(400).json({ error: bonusError.message });
      }
    }
    if (settings.bonuses_enabled && status === "completed" && oldStatus !== "completed" && orderTotal > 0) {
      try {
        await connection.query(
          "UPDATE loyalty_transactions SET status = 'completed' WHERE order_id = ? AND type = 'spend' AND status = 'pending'",
          [orderId],
        );
        if (orderData.bonus_earn_amount && orderData.bonus_earn_amount > 0) {
          await redeliveryEarnBonuses(orderData, connection, loyaltyLevels);
        } else {
          await earnBonuses(orderData, connection, loyaltyLevels);
        }
      } catch (bonusError) {
        console.error("Failed to earn bonuses:", bonusError);
      }
    }
    if (settings.bonuses_enabled && status === "cancelled" && oldStatus !== "cancelled") {
      try {
        await cancelOrderBonuses(orderData, connection, loyaltyLevels);
      } catch (bonusError) {
        console.error("Failed to refund bonuses for cancelled order:", bonusError);
      }
    }
    await connection.commit();
    const [updatedOrders] = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    await logger.order.statusChanged(orderId, oldStatus, status, req.user.id);
    try {
      const { wsServer } = await import("../index.js");
      wsServer.notifyOrderStatusUpdate(orderId, userId, status, oldStatus, oldOrderData[0]?.branch_id || null);
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }
    try {
      const { sendTelegramNotification, formatOrderStatusMessage } = await import("../utils/telegram.js");
      const [users] = await db.query("SELECT telegram_id FROM users WHERE id = ?", [userId]);
      if (users.length > 0 && users[0].telegram_id) {
        const orderNumber = updatedOrders[0].order_number;
        const orderType = updatedOrders[0].order_type;
        const message = formatOrderStatusMessage(orderNumber, status, orderType);
        await sendTelegramNotification(users[0].telegram_id, message);
      }
    } catch (telegramError) {
      console.error("Failed to send Telegram notification:", telegramError);
    }
    res.json({ order: updatedOrders[0] });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

router.put(
  "/admin/:id/status",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  adminActionLogger("update_order_status", "order"),
  async (req, res, next) => {
    await handleOrderStatusUpdate(req, res, next);
  },
);

router.put(
  "/admin/:id/cancel",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  adminActionLogger("cancel_order", "order"),
  async (req, res, next) => {
    await handleOrderStatusUpdate(req, res, next, "cancelled");
  },
);
router.get("/admin/stats", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_id, date_from, date_to } = req.query;
    let whereClause = "WHERE 1=1";
    const params = [];
    if (req.user.role === "manager") {
      whereClause += " AND city_id IN (?)";
      params.push(req.user.cities);
    } else if (city_id) {
      whereClause += " AND city_id = ?";
      params.push(city_id);
    }
    if (date_from) {
      whereClause += " AND created_at >= ?";
      params.push(date_from);
    }
    if (date_to) {
      whereClause += " AND created_at <= ?";
      params.push(date_to);
    }
    const [totalStats] = await db.query(
      `SELECT 
           COUNT(*) as total_orders,
           SUM(total) as total_revenue,
           AVG(total) as average_order_value
         FROM orders ${whereClause}`,
      params,
    );
    const [statusStats] = await db.query(
      `SELECT status, COUNT(*) as count
         FROM orders ${whereClause}
         GROUP BY status`,
      params,
    );
    const [typeStats] = await db.query(
      `SELECT order_type, COUNT(*) as count
         FROM orders ${whereClause}
         GROUP BY order_type`,
      params,
    );
    res.json({
      total: totalStats[0],
      by_status: statusStats,
      by_type: typeStats,
    });
  } catch (error) {
    next(error);
  }
});
export default router;
