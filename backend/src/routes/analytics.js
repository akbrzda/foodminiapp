import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole("admin", "manager", "ceo"));

// Получить общую статистику
router.get("/dashboard", async (req, res, next) => {
  try {
    const { period = "today", city_id, branch_id } = req.query;

    let dateFilter = "";
    const params = [];

    // Определяем временной период
    switch (period) {
      case "today":
        dateFilter = "DATE(o.created_at) = CURDATE()";
        break;
      case "yesterday":
        dateFilter = "DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
        break;
      case "week":
        dateFilter = "o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
        break;
      case "month":
        dateFilter = "o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
        break;
      default:
        dateFilter = "DATE(o.created_at) = CURDATE()";
    }

    let cityFilter = "";
    let branchFilter = "";

    // Фильтры
    if (city_id) {
      cityFilter = " AND b.city_id = ?";
      params.push(city_id);
    }
    if (branch_id) {
      branchFilter = " AND o.branch_id = ?";
      params.push(branch_id);
    }

    // Общая статистика заказов
    const [orderStats] = await db.query(
      `SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
        COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_orders,
        COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_orders,
        COUNT(CASE WHEN status = 'delivering' THEN 1 END) as delivering_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE ${dateFilter}${cityFilter}${branchFilter}`,
      params
    );

    // Статистика по типам заказов
    const [orderTypes] = await db.query(
      `SELECT 
        order_type,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE ${dateFilter}${cityFilter}${branchFilter}
      GROUP BY order_type`,
      params
    );

    // Статистика по способам оплаты
    const [paymentMethods] = await db.query(
      `SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE ${dateFilter}${cityFilter}${branchFilter}
      GROUP BY payment_method`,
      params
    );

    // Статистика по филиалам
    const branchParams = [...params];
    const [branchStats] = await db.query(
      `SELECT 
        b.id,
        b.name,
        c.name as city_name,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total), 0) as revenue
      FROM branches b
      LEFT JOIN cities c ON b.city_id = c.id
      LEFT JOIN orders o ON o.branch_id = b.id AND ${dateFilter}
      WHERE 1=1${cityFilter}${branchFilter ? " AND b.id = ?" : ""}
      GROUP BY b.id, b.name, c.name
      ORDER BY revenue DESC
      LIMIT 10`,
      branchFilter ? branchParams : params
    );

    // Топ позиций меню
    const [topItems] = await db.query(
      `SELECT 
        mi.name,
        COUNT(oi.id) as orders_count,
        SUM(oi.quantity) as total_quantity,
        COALESCE(SUM(oi.subtotal), 0) as revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE ${dateFilter}${cityFilter}${branchFilter}
      GROUP BY mi.id, mi.name
      ORDER BY revenue DESC
      LIMIT 10`,
      params
    );

    // Динамика заказов по дням (для графика)
    const [dailyStats] = await db.query(
      `SELECT 
        DATE(o.created_at) as date,
        COUNT(*) as orders_count,
        COALESCE(SUM(o.total), 0) as revenue
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)${cityFilter}${branchFilter}
      GROUP BY DATE(o.created_at)
      ORDER BY date`,
      params
    );

    // Статистика клиентов
    const [customerStats] = await db.query(
      `SELECT 
        COUNT(DISTINCT customer_type.user_id) as total_customers,
        COUNT(CASE WHEN customer_type.order_count = 1 THEN 1 END) as new_customers,
        COUNT(CASE WHEN customer_type.order_count > 1 THEN 1 END) as returning_customers
      FROM (
        SELECT 
          o.user_id,
          COUNT(*) as order_count
        FROM orders o
        LEFT JOIN branches b ON o.branch_id = b.id
        WHERE ${dateFilter}${cityFilter}${branchFilter}
        GROUP BY o.user_id
      ) as customer_type`,
      params
    );

    res.json({
      period,
      orders: orderStats[0],
      orderTypes: orderTypes,
      paymentMethods: paymentMethods,
      branches: branchStats,
      topItems: topItems,
      dailyStats: dailyStats,
      customers: customerStats[0],
    });
  } catch (error) {
    next(error);
  }
});

// Отчет по продажам за период
router.get("/sales-report", async (req, res, next) => {
  try {
    const { date_from, date_to, city_id, branch_id, group_by = "day" } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: "date_from and date_to are required" });
    }

    const params = [date_from, date_to];
    let cityFilter = "";
    let branchFilter = "";

    if (city_id) {
      cityFilter = " AND b.city_id = ?";
      params.push(city_id);
    }
    if (branch_id) {
      branchFilter = " AND o.branch_id = ?";
      params.push(branch_id);
    }

    // Группировка по периодам
    let dateGrouping = "";
    switch (group_by) {
      case "hour":
        dateGrouping = 'DATE_FORMAT(o.created_at, "%Y-%m-%d %H:00:00")';
        break;
      case "day":
        dateGrouping = "DATE(o.created_at)";
        break;
      case "week":
        dateGrouping = 'DATE_FORMAT(o.created_at, "%Y-%u")';
        break;
      case "month":
        dateGrouping = 'DATE_FORMAT(o.created_at, "%Y-%m")';
        break;
      default:
        dateGrouping = "DATE(o.created_at)";
    }

    const [report] = await db.query(
      `SELECT 
        ${dateGrouping} as period,
        COUNT(*) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as revenue,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value,
        COUNT(CASE WHEN o.order_type = 'delivery' THEN 1 END) as delivery_orders,
        COUNT(CASE WHEN o.order_type = 'pickup' THEN 1 END) as pickup_orders
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
        AND o.status != 'cancelled'${cityFilter}${branchFilter}
      GROUP BY period
      ORDER BY period`,
      params
    );

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

// Отчет по популярным позициям
router.get("/popular-items", async (req, res, next) => {
  try {
    const { date_from, date_to, city_id, category_id, limit = 20 } = req.query;

    const params = [];
    let dateFilter = "";
    let cityFilter = "";
    let categoryFilter = "";

    if (date_from && date_to) {
      dateFilter = " AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)";
      params.push(date_from, date_to);
    }

    if (city_id) {
      cityFilter = " AND b.city_id = ?";
      params.push(city_id);
    }

    if (category_id) {
      categoryFilter = " AND mi.category_id = ?";
      params.push(category_id);
    }

    params.push(parseInt(limit));

    const [items] = await db.query(
      `SELECT 
        mi.id,
        mi.name,
        mc.name as category_name,
        COUNT(DISTINCT oi.order_id) as orders_count,
        SUM(oi.quantity) as total_quantity,
        COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
        COALESCE(AVG(oi.price), 0) as avg_price
      FROM order_items oi
      JOIN menu_items mi ON oi.item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.status != 'cancelled'${dateFilter}${cityFilter}${categoryFilter}
      GROUP BY mi.id, mi.name, mc.name
      ORDER BY revenue DESC
      LIMIT ?`,
      params
    );

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// Отчет по клиентам
router.get("/customer-report", async (req, res, next) => {
  try {
    const { date_from, date_to, city_id, sort_by = "revenue" } = req.query;

    const params = [];
    let dateFilter = "";
    let cityFilter = "";

    if (date_from && date_to) {
      dateFilter = " AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)";
      params.push(date_from, date_to);
    }

    if (city_id) {
      cityFilter = " AND b.city_id = ?";
      params.push(city_id);
    }

    let orderBy = "total_revenue DESC";
    if (sort_by === "orders") {
      orderBy = "orders_count DESC";
    }

    const [customers] = await db.query(
      `SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.phone,
        u.loyalty_level,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value,
        MAX(o.created_at) as last_order_date
      FROM users u
      JOIN orders o ON u.id = o.user_id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.status != 'cancelled'${dateFilter}${cityFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.phone, u.loyalty_level
      ORDER BY ${orderBy}
      LIMIT 100`,
      params
    );

    res.json({ customers });
  } catch (error) {
    next(error);
  }
});

export default router;
