import express from "express";
import axios from "axios";
import db from "../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";
import { calculateEarnedBonuses, validateBonusUsage, earnBonuses, useBonuses } from "../utils/bonuses.js";
import { logger, adminActionLogger } from "../utils/logger.js";
import { addTelegramNotification } from "../queues/config.js";
const router = express.Router();
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
async function calculateOrderCost(items, { cityId, fulfillmentType, bonusToUse = 0 } = {}) {
  let subtotal = 0;
  const validatedItems = [];
  for (const item of items) {
    const { item_id, variant_id, quantity, modifiers = [] } = item;
    if (!item_id || !quantity || quantity <= 0) {
      throw new Error("Invalid item data");
    }
    const [menuItems] = await db.query("SELECT id, name, price, is_active FROM menu_items WHERE id = ?", [item_id]);
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
    const { items, bonus_to_use = 0, delivery_cost = 0, order_type, delivery_polygon_id, city_id } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items are required" });
    }
    const fulfillmentType = order_type === "pickup" ? "pickup" : "delivery";
    const { subtotal, bonusUsed, total, validatedItems } = await calculateOrderCost(items, {
      cityId: city_id,
      fulfillmentType,
      bonusToUse: bonus_to_use,
    });
    if (order_type === "delivery" && delivery_polygon_id) {
      const [polygons] = await db.query("SELECT min_order_amount FROM delivery_polygons WHERE id = ?", [delivery_polygon_id]);
      const minOrderAmount = parseFloat(polygons[0]?.min_order_amount) || 0;
      if (minOrderAmount > 0 && subtotal < minOrderAmount) {
        return res.status(400).json({
          error: `Minimum order amount is ${minOrderAmount}`,
        });
      }
    }
    const bonusValidation = await validateBonusUsage(req.user.id, bonus_to_use, subtotal);
    if (!bonusValidation.valid) {
      return res.status(400).json({ error: bonusValidation.error });
    }
    const finalTotal = total + parseFloat(delivery_cost);
    const [userData] = await db.query("SELECT loyalty_level FROM users WHERE id = ?", [req.user.id]);
    const loyaltyLevel = userData[0]?.loyalty_level || 1;
    const earnedBonuses = calculateEarnedBonuses(finalTotal, loyaltyLevel);
    res.json({
      subtotal,
      delivery_cost: parseFloat(delivery_cost),
      bonus_used: bonusUsed,
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
      delivery_address_id,
      delivery_street,
      delivery_house,
      delivery_entrance,
      delivery_floor,
      delivery_apartment,
      delivery_intercom,
      delivery_comment,
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
    if (order_type === "delivery" && delivery_street && delivery_house) {
      try {
        const geocodeResponse = await axios.post(
          `${req.protocol}://${req.get("host")}/api/geocode`,
          { address: `${delivery_street}, ${delivery_house}` },
          { headers: { "Content-Type": "application/json" } },
        );
        if (geocodeResponse.data && geocodeResponse.data.lat && geocodeResponse.data.lng) {
          const checkResponse = await axios.post(
            `${req.protocol}://${req.get("host")}/api/polygons/check-delivery`,
            {
              latitude: geocodeResponse.data.lat,
              longitude: geocodeResponse.data.lng,
              city_id: city_id,
            },
            { headers: { "Content-Type": "application/json" } },
          );
          if (checkResponse.data && checkResponse.data.available && checkResponse.data.polygon) {
            deliveryPolygon = checkResponse.data.polygon;
            deliveryCost = parseFloat(deliveryPolygon.delivery_cost) || 0;
          } else {
            await connection.rollback();
            return res.status(400).json({
              error: "Delivery is not available to this address",
            });
          }
        }
      } catch (geoError) {
        console.error("Geocoding error:", geoError);
      }
    }
    const fulfillmentType = order_type === "pickup" ? "pickup" : "delivery";
    const { subtotal, bonusUsed, total, validatedItems } = await calculateOrderCost(items, {
      cityId: city_id,
      fulfillmentType,
      bonusToUse: bonus_to_use,
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
    if (bonus_to_use > 0) {
      const bonusValidation = await validateBonusUsage(req.user.id, bonus_to_use, subtotal);
      if (!bonusValidation.valid) {
        await connection.rollback();
        return res.status(400).json({ error: bonusValidation.error });
      }
    }
    const finalTotal = total + deliveryCost;
    const [userData] = await db.query("SELECT loyalty_level FROM users WHERE id = ?", [req.user.id]);
    const loyaltyLevel = userData[0]?.loyalty_level || 1;
    const earnedBonuses = calculateEarnedBonuses(finalTotal, loyaltyLevel);
    const orderNumber = await generateOrderNumber();
    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (order_number, user_id, city_id, branch_id, order_type, status, 
        delivery_address_id, delivery_street, delivery_house, delivery_entrance, delivery_floor,
        delivery_apartment, delivery_intercom, delivery_comment, 
        payment_method, change_from, subtotal, delivery_cost, bonus_used, total, 
        comment, desired_time)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        req.user.id,
        city_id,
        branch_id || null,
        order_type,
        delivery_address_id || null,
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
    if (bonusUsed > 0) {
      await useBonuses(req.user.id, orderId, bonusUsed, "Used for order", connection);
    }
    await connection.commit();
    const [orders] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    const order = orders[0];
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
      `SELECT o.*, c.name as city_name, b.name as branch_name, b.address as branch_address
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
    const [earnedRows] = await db.query("SELECT SUM(amount) as bonuses_earned FROM bonus_history WHERE order_id = ? AND type = 'earned'", [orderId]);
    order.bonuses_earned = parseFloat(earnedRows[0]?.bonuses_earned) || 0;
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
router.get("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const [orders] = await db.query(
      `SELECT o.*, 
             c.name as city_name, 
             b.name as branch_name, 
             b.address as branch_address,
             u.phone as user_phone,
             u.first_name as user_first_name,
             u.last_name as user_last_name
       FROM orders o
       LEFT JOIN cities c ON o.city_id = c.id
       LEFT JOIN branches b ON o.branch_id = b.id
       LEFT JOIN users u ON o.user_id = u.id
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
    const [earnedRows] = await db.query("SELECT SUM(amount) as bonuses_earned FROM bonus_history WHERE order_id = ? AND type = 'earned'", [orderId]);
    order.bonuses_earned = parseFloat(earnedRows[0]?.bonuses_earned) || 0;
    res.json({ order });
  } catch (error) {
    next(error);
  }
});
router.put(
  "/admin/:id/status",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  adminActionLogger("update_order_status", "order"),
  async (req, res, next) => {
    try {
      const orderId = req.params.id;
      const { status } = req.body;
      const validStatuses = ["pending", "confirmed", "preparing", "ready", "delivering", "completed", "cancelled"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Status must be one of: ${validStatuses.join(", ")}`,
        });
      }
      const [orders] = await db.query("SELECT city_id, order_type FROM orders WHERE id = ?", [orderId]);
      if (orders.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (req.user.role === "manager" && !req.user.cities.includes(orders[0].city_id)) {
        return res.status(403).json({
          error: "You do not have access to this city",
        });
      }
      const [oldOrderData] = await db.query("SELECT status, user_id, total, bonus_used, order_number, order_type FROM orders WHERE id = ?", [
        orderId,
      ]);
      const oldStatus = oldOrderData[0]?.status;
      const userId = oldOrderData[0]?.user_id;
      const orderTotal = parseFloat(oldOrderData[0]?.total) || 0;
      const bonusUsed = parseFloat(oldOrderData[0]?.bonus_used) || 0;
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
      if (status !== "cancelled" && oldStatus !== status) {
        if (oldStatus === "completed") {
          return res.status(400).json({
            error: "Cannot change status of a completed order",
          });
        }
      }
      await db.query("UPDATE orders SET status = ?, completed_at = ? WHERE id = ?", [status, status === "completed" ? new Date() : null, orderId]);
      if (status === "completed" && oldStatus !== "completed" && orderTotal > 0) {
        try {
          await earnBonuses(userId, orderId, orderTotal, "Bonus earned from completed order");
        } catch (bonusError) {
          console.error("Failed to earn bonuses:", bonusError);
        }
      }
      if (status === "cancelled" && oldStatus !== "cancelled") {
        try {
          const [users] = await db.query("SELECT bonus_balance, total_spent FROM users WHERE id = ?", [userId]);
          const currentBalance = parseFloat(users[0]?.bonus_balance) || 0;
          const currentTotalSpent = parseFloat(users[0]?.total_spent) || 0;
          let balanceAfter = currentBalance;
          if (bonusUsed > 0) {
            balanceAfter = currentBalance + bonusUsed;
            await db.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [balanceAfter, userId]);
            await db.query(
              `INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description)
               VALUES (?, ?, 'manual', ?, ?, ?)`,
              [userId, orderId, bonusUsed, balanceAfter, `Возврат бонусов за отмену заказа #${orderNumber}`],
            );
          }
          const [earnedRows] = await db.query("SELECT SUM(amount) as earned_total FROM bonus_history WHERE order_id = ? AND type = 'earned'", [
            orderId,
          ]);
          const earnedTotal = parseFloat(earnedRows[0]?.earned_total) || 0;
          if (earnedTotal > 0) {
            balanceAfter = Math.max(0, balanceAfter - earnedTotal);
            const updatedTotalSpent = Math.max(0, currentTotalSpent - orderTotal);
            await db.query("UPDATE users SET bonus_balance = ?, total_spent = ? WHERE id = ?", [balanceAfter, updatedTotalSpent, userId]);
            await db.query(
              `INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description)
               VALUES (?, ?, 'manual', ?, ?, ?)`,
              [userId, orderId, earnedTotal, balanceAfter, `Аннулирование бонусов за отмену заказа #${orderNumber}`],
            );
          }
        } catch (bonusError) {
          console.error("Failed to rollback bonuses for cancelled order:", bonusError);
        }
      }
      const [updatedOrders] = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
      await logger.order.statusChanged(orderId, oldStatus, status, req.user.id);
      try {
        const { wsServer } = await import("../index.js");
        wsServer.notifyOrderStatusUpdate(orderId, userId, status, oldStatus);
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
      next(error);
    }
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
