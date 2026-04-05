import db from "../../../config/database.js";
import { addTelegramNotification } from "../../../queues/config.js";
import { getRatingWindowDeadline, isOrderRatingWindowOpen } from "../services/orderRatingReminderService.js";
import { getUserNpsStatus } from "../../users/services/npsService.js";

const ORDER_RATING_COMMENT_MAX_LENGTH = 1000;

const toPositiveInteger = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const normalizeRatingComment = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
};

const serializeOrderRating = (row) => {
  if (!row) return null;
  const ratingValue = Number(row.rating);
  if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) return null;
  return {
    rating: ratingValue,
    comment: row.comment || null,
    created_at: row.created_at || null,
  };
};

const resolveNpsPrompt = async (userId) => {
  try {
    return await getUserNpsStatus(userId, { requireCompletedOrder: true });
  } catch (error) {
    return null;
  }
};

/**
 * Получение списка заказов пользователя
 */
export const getUserOrders = async (req, res, next) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    let query = `
      SELECT o.*, 
        o.total as total_amount,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count,
        (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
        r.rating as user_rating,
        r.comment as user_rating_comment,
        r.created_at as user_rating_created_at,
        c.name as city_name, 
        b.name as branch_name
      FROM orders o
      LEFT JOIN cities c ON o.city_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN order_ratings r ON r.order_id = o.id AND r.user_id = o.user_id
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
};

/**
 * Получение детальной информации о заказе
 */
export const getUserOrderById = async (req, res, next) => {
  try {
    const orderId = req.params.id;

    const [orders] = await db.query(
      `SELECT o.*,
        (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
        r.rating as user_rating,
        r.comment as user_rating_comment,
        r.created_at as user_rating_created_at,
        c.name as city_name, b.name as branch_name, b.address as branch_address
       FROM orders o
       LEFT JOIN cities c ON o.city_id = c.id
       LEFT JOIN branches b ON o.branch_id = b.id
       LEFT JOIN order_ratings r ON r.order_id = o.id AND r.user_id = o.user_id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, req.user.id],
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orders[0];

    // Получение товаров заказа
    const [items] = await db.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
    const itemIds = items.map((item) => item.id).filter(Boolean);
    let modifiersByItemId = new Map();

    if (itemIds.length > 0) {
      const [modifierRows] = await db.query(`SELECT * FROM order_item_modifiers WHERE order_item_id IN (?)`, [itemIds]);
      modifiersByItemId = modifierRows.reduce((acc, modifier) => {
        if (!acc.has(modifier.order_item_id)) {
          acc.set(modifier.order_item_id, []);
        }
        acc.get(modifier.order_item_id).push(modifier);
        return acc;
      }, new Map());
    }

    for (const item of items) {
      item.modifiers = modifiersByItemId.get(item.id) || [];
    }

    order.items = items;

    // История статусов
    const [statusHistory] = await db.query(
      `SELECT osh.id, osh.old_status, osh.new_status, osh.changed_by_type, osh.changed_at,
        au.first_name as admin_first_name, au.last_name as admin_last_name
       FROM order_status_history osh
       LEFT JOIN admin_users au ON au.id = osh.changed_by_admin_id
       WHERE osh.order_id = ?
       ORDER BY osh.changed_at ASC, osh.id ASC`,
      [orderId],
    );

    order.status_history = statusHistory || [];

    // Информация о бонусах
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

    const ratingData = serializeOrderRating({
      rating: order.user_rating,
      comment: order.user_rating_comment,
      created_at: order.user_rating_created_at,
    });
    const ratingDeadline = getRatingWindowDeadline(order.completed_at);
    const canRateOrder = order.status === "completed" && !ratingData && isOrderRatingWindowOpen(order.completed_at);

    order.user_rating = ratingData?.rating || null;
    order.user_rating_comment = ratingData?.comment || null;
    order.user_rating_created_at = ratingData?.created_at || null;
    order.can_rate_order = canRateOrder;
    order.rating_deadline_at = ratingDeadline ? ratingDeadline.toISOString() : null;
    order.nps_prompt = null;

    if (order.user_rating) {
      order.nps_prompt = await resolveNpsPrompt(req.user.id);
    }

    res.json({ order });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение оценки по заказу текущего пользователя
 */
export const getUserOrderRating = async (req, res, next) => {
  try {
    const orderId = toPositiveInteger(req.params.id);
    if (!orderId) {
      return res.status(400).json({ error: "Некорректный order_id" });
    }

    const [orderRows] = await db.query(
      "SELECT id, status, completed_at FROM orders WHERE id = ? AND user_id = ? LIMIT 1",
      [orderId, req.user.id],
    );
    const order = orderRows[0] || null;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const [ratingRows] = await db.query(
      "SELECT rating, comment, created_at FROM order_ratings WHERE order_id = ? AND user_id = ? LIMIT 1",
      [orderId, req.user.id],
    );

    const rating = serializeOrderRating(ratingRows[0] || null);
    const ratingDeadline = getRatingWindowDeadline(order.completed_at);
    const canRateOrder = order.status === "completed" && !rating && isOrderRatingWindowOpen(order.completed_at);

    return res.json({
      rating,
      can_rate_order: canRateOrder,
      rating_deadline_at: ratingDeadline ? ratingDeadline.toISOString() : null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Выставление оценки по заказу текущего пользователя
 */
export const createUserOrderRating = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const orderId = toPositiveInteger(req.params.id);
    if (!orderId) {
      return res.status(400).json({ error: "Некорректный order_id" });
    }

    const ratingValue = Number(req.body?.rating);
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ error: "Оценка должна быть числом от 1 до 5" });
    }

    const comment = normalizeRatingComment(req.body?.comment);
    if (req.body?.comment !== undefined && req.body?.comment !== null && typeof req.body.comment !== "string") {
      return res.status(400).json({ error: "Комментарий должен быть строкой" });
    }
    if (comment && comment.length > ORDER_RATING_COMMENT_MAX_LENGTH) {
      return res.status(400).json({ error: `Комментарий не должен превышать ${ORDER_RATING_COMMENT_MAX_LENGTH} символов` });
    }

    await connection.beginTransaction();

    const [orderRows] = await connection.query(
      "SELECT id, status, completed_at, order_number, city_id FROM orders WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
      [orderId, req.user.id],
    );
    const order = orderRows[0] || null;

    if (!order) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "completed") {
      await connection.rollback();
      return res.status(409).json({ error: "Оценка доступна только для завершенного заказа" });
    }

    if (!isOrderRatingWindowOpen(order.completed_at)) {
      await connection.rollback();
      return res.status(409).json({ error: "Время для оценки заказа истекло (24 часа)" });
    }

    const [existingRows] = await connection.query(
      "SELECT id FROM order_ratings WHERE order_id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
      [orderId, req.user.id],
    );
    if (existingRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: "Оценка для этого заказа уже выставлена" });
    }

    await connection.query(
      "INSERT INTO order_ratings (order_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
      [orderId, req.user.id, ratingValue, comment],
    );

    const [ratingRows] = await connection.query(
      "SELECT rating, comment, created_at FROM order_ratings WHERE order_id = ? AND user_id = ? LIMIT 1",
      [orderId, req.user.id],
    );

    await connection.commit();

    try {
      const createdAt = ratingRows[0]?.created_at ? new Date(ratingRows[0].created_at) : new Date();
      const formattedTime = Number.isNaN(createdAt.getTime())
        ? new Date().toLocaleString("ru-RU")
        : createdAt.toLocaleString("ru-RU", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
      const commentPart = comment ? `\n💬 Комментарий: ${comment}` : "\n💬 Комментарий: —";
      const message = `⭐ Новая оценка заказа #${order.order_number}\n\nОценка: ${ratingValue}/5${commentPart}\n🕒 Время: ${formattedTime}`;

      await addTelegramNotification({
        type: "custom",
        priority: 2,
        data: {
          message,
          city_id: order.city_id || null,
        },
      });
    } catch (notificationError) {
      // Ошибка уведомления о новой оценке не должна ломать ответ клиенту
    }

    return res.status(201).json({
      rating: serializeOrderRating(ratingRows[0] || null),
      nps_prompt: await resolveNpsPrompt(req.user.id),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      // Ошибка rollback не должна скрывать исходную ошибку
    }
    next(error);
  } finally {
    connection.release();
  }
};

/**
 * Повторить заказ
 */
export const repeatOrder = async (req, res, next) => {
  try {
    const orderId = req.params.id;

    const [orders] = await db.query(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, req.user.id]);

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const [items] = await db.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
    const itemIds = items.map((item) => item.id).filter(Boolean);
    let modifierIdsByItemId = new Map();

    if (itemIds.length > 0) {
      const [modifierRows] = await db.query(`SELECT order_item_id, modifier_id FROM order_item_modifiers WHERE order_item_id IN (?)`, [itemIds]);
      modifierIdsByItemId = modifierRows.reduce((acc, modifier) => {
        if (!acc.has(modifier.order_item_id)) {
          acc.set(modifier.order_item_id, []);
        }
        if (modifier.modifier_id !== null) {
          acc.get(modifier.order_item_id).push(modifier.modifier_id);
        }
        return acc;
      }, new Map());
    }

    const orderItems = [];

    for (const item of items) {
      const modifierIds = modifierIdsByItemId.get(item.id) || [];

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
};
