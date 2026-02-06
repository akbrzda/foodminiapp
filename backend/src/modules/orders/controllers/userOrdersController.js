import db from "../../../config/database.js";

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

    // Получение товаров заказа
    const [items] = await db.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);

    for (const item of items) {
      const [modifiers] = await db.query(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`, [item.id]);
      item.modifiers = modifiers;
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

    res.json({ order });
  } catch (error) {
    next(error);
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
};
