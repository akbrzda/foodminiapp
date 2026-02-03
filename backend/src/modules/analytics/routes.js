import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
const router = express.Router();
router.use(authenticateToken);
router.use(requireRole("admin", "manager", "ceo"));
router.get("/dashboard", async (req, res, next) => {
  try {
    const { period = "today", city_id, branch_id, date_from, date_to, base_date } = req.query;
    const toDateString = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const parseDate = (value) => {
      if (!value) return null;
      const [year, month, day] = value.split("-").map(Number);
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day);
    };
    const addDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };
    const getRange = () => {
      const today = new Date();
      const baseDate = parseDate(base_date) || today;
      const baseStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
      if (period === "custom") {
        const fromDate = parseDate(date_from);
        const toDate = parseDate(date_to);
        if (!fromDate || !toDate) {
          return { error: "date_from and date_to are required for custom period" };
        }
        if (toDate < fromDate) {
          return { error: "date_to must be greater than or equal to date_from" };
        }
        const start = fromDate;
        const end = addDays(toDate, 1);
        const rangeDays = Math.round((end - start) / (24 * 60 * 60 * 1000));
        return {
          start,
          end,
          compareStart: addDays(start, -rangeDays),
          compareEnd: start,
          rangeDays,
        };
      }
      if (period === "week") {
        const weekday = baseStart.getDay();
        const diffToMonday = (weekday + 6) % 7;
        const start = addDays(baseStart, -diffToMonday);
        const end = addDays(start, 7);
        return {
          start,
          end,
          compareStart: addDays(start, -7),
          compareEnd: start,
          rangeDays: 7,
        };
      }
      if (period === "month") {
        const start = new Date(baseStart.getFullYear(), baseStart.getMonth(), 1);
        const end = new Date(baseStart.getFullYear(), baseStart.getMonth() + 1, 1);
        return {
          start,
          end,
          compareStart: new Date(start.getFullYear(), start.getMonth() - 1, 1),
          compareEnd: start,
          rangeDays: Math.round((end - start) / (24 * 60 * 60 * 1000)),
        };
      }
      if (period === "year") {
        const start = new Date(baseStart.getFullYear(), 0, 1);
        const end = new Date(baseStart.getFullYear() + 1, 0, 1);
        return {
          start,
          end,
          compareStart: new Date(baseStart.getFullYear() - 1, 0, 1),
          compareEnd: start,
          rangeDays: Math.round((end - start) / (24 * 60 * 60 * 1000)),
        };
      }
      const start = baseStart;
      const end = addDays(baseStart, 1);
      return {
        start,
        end,
        compareStart: addDays(start, -7),
        compareEnd: addDays(end, -7),
        rangeDays: 1,
      };
    };
    const range = getRange();
    if (range.error) {
      return res.status(400).json({ error: range.error });
    }
    const filterParams = [];
    let filterSql = "";
    const parsedCityId = city_id ? Number(city_id) : null;
    const parsedBranchId = branch_id ? Number(branch_id) : null;
    if (req.user.role === "manager") {
      const branchIds = Array.isArray(req.user.branch_ids) ? req.user.branch_ids : [];
      if (branchIds.length > 0) {
        if (parsedBranchId && !branchIds.includes(parsedBranchId)) {
          return res.status(403).json({ error: "You do not have access to this branch" });
        }
        if (parsedBranchId) {
          filterSql += " AND o.branch_id = ?";
          filterParams.push(parsedBranchId);
        } else {
          filterSql += " AND o.branch_id IN (?)";
          filterParams.push(branchIds);
        }
        if (parsedCityId) {
          const cityIds = Array.isArray(req.user.branch_city_ids) ? req.user.branch_city_ids : [];
          if (cityIds.length > 0 && !cityIds.includes(parsedCityId)) {
            return res.status(403).json({ error: "You do not have access to this city" });
          }
          filterSql += " AND o.city_id = ?";
          filterParams.push(parsedCityId);
        }
      } else if (Array.isArray(req.user.cities) && req.user.cities.length > 0) {
        if (parsedCityId && !req.user.cities.includes(parsedCityId)) {
          return res.status(403).json({ error: "You do not have access to this city" });
        }
        if (parsedCityId) {
          filterSql += " AND o.city_id = ?";
          filterParams.push(parsedCityId);
        } else {
          filterSql += " AND o.city_id IN (?)";
          filterParams.push(req.user.cities);
        }
      }
    } else {
      if (parsedCityId) {
        filterSql += " AND o.city_id = ?";
        filterParams.push(parsedCityId);
      }
      if (parsedBranchId) {
        filterSql += " AND o.branch_id = ?";
        filterParams.push(parsedBranchId);
      }
    }
    const dateFilter = "o.created_at >= ? AND o.created_at < ?";
    const paramsCurrent = [toDateString(range.start), toDateString(range.end), ...filterParams];
    const paramsPrevious = [toDateString(range.compareStart), toDateString(range.compareEnd), ...filterParams];
    const [orderStatsCurrent] = await db.query(
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
      WHERE ${dateFilter}${filterSql}`,
      paramsCurrent,
    );
    const [orderStatsPrevious] = await db.query(
      `SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue
      FROM orders o
      WHERE ${dateFilter}${filterSql}`,
      paramsPrevious,
    );
    const [discountsCurrent] = await db.query(
      `SELECT COALESCE(SUM(bonus_spent), 0) as total_discounts
      FROM orders o
      WHERE ${dateFilter}${filterSql}`,
      paramsCurrent,
    );
    const [discountsPrevious] = await db.query(
      `SELECT COALESCE(SUM(bonus_spent), 0) as total_discounts
      FROM orders o
      WHERE ${dateFilter}${filterSql}`,
      paramsPrevious,
    );
    const [customerStatsCurrent] = await db.query(
      `SELECT 
        COUNT(DISTINCT customer_type.user_id) as total_customers,
        COUNT(CASE WHEN customer_type.order_count = 1 THEN 1 END) as new_customers,
        COUNT(CASE WHEN customer_type.order_count > 1 THEN 1 END) as returning_customers
      FROM (
        SELECT 
          o.user_id,
          COUNT(*) as order_count
        FROM orders o
        WHERE ${dateFilter}${filterSql}
        GROUP BY o.user_id
      ) as customer_type`,
      paramsCurrent,
    );
    const [customerStatsPrevious] = await db.query(
      `SELECT 
        COUNT(DISTINCT o.user_id) as total_customers
      FROM orders o
      WHERE ${dateFilter}${filterSql}`,
      paramsPrevious,
    );
    const compareMetric = (current, previous) => {
      const change = current - previous;
      const percent = previous === 0 ? null : (change / previous) * 100;
      return { current, previous, change, percent };
    };
    const comparisons = {
      orders: compareMetric(orderStatsCurrent[0].total_orders, orderStatsPrevious[0].total_orders),
      revenue: compareMetric(orderStatsCurrent[0].total_revenue, orderStatsPrevious[0].total_revenue),
      customers: compareMetric(customerStatsCurrent[0].total_customers, customerStatsPrevious[0].total_customers),
      discounts: compareMetric(discountsCurrent[0].total_discounts, discountsPrevious[0].total_discounts),
    };
    const [orderTypes] = await db.query(
      `SELECT 
        order_type,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders o
      WHERE ${dateFilter}${filterSql}
      GROUP BY order_type`,
      paramsCurrent,
    );
    const [paymentMethods] = await db.query(
      `SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders o
      WHERE ${dateFilter}${filterSql}
      GROUP BY payment_method`,
      paramsCurrent,
    );
    const [topItems] = await db.query(
      `SELECT 
        mi.name,
        COUNT(oi.id) as orders_count,
        SUM(oi.quantity) as total_quantity,
        COALESCE(SUM(oi.subtotal), 0) as revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      WHERE ${dateFilter}${filterSql}
      GROUP BY mi.id, mi.name
      ORDER BY revenue DESC
      LIMIT 10`,
      paramsCurrent,
    );
    let groupBy = "day";
    if (period === "today") {
      groupBy = "hour";
    } else if (range.rangeDays > 120) {
      groupBy = "month";
    } else if (range.rangeDays > 31) {
      groupBy = "week";
    }
    const groupBySql = {
      hour: 'DATE_FORMAT(o.created_at, "%Y-%m-%d %H:00:00")',
      day: "DATE(o.created_at)",
      week: 'DATE_FORMAT(o.created_at, "%Y-%u")',
      month: 'DATE_FORMAT(o.created_at, "%Y-%m")',
    }[groupBy];
    const [series] = await db.query(
      `SELECT 
        ${groupBySql} as period,
        COUNT(*) as orders_count,
        COALESCE(SUM(o.total), 0) as revenue,
        COALESCE(AVG(o.total), 0) as avg_order_value
      FROM orders o
      WHERE ${dateFilter}${filterSql}
      GROUP BY period
      ORDER BY period`,
      paramsCurrent,
    );
    res.json({
      period,
      date_from: toDateString(range.start),
      date_to: toDateString(addDays(range.end, -1)),
      compare_from: toDateString(range.compareStart),
      compare_to: toDateString(addDays(range.compareEnd, -1)),
      orders: orderStatsCurrent[0],
      discounts: discountsCurrent[0],
      customers: customerStatsCurrent[0],
      comparisons,
      orderTypes,
      paymentMethods,
      topItems,
      series: {
        group_by: groupBy,
        points: series,
      },
    });
  } catch (error) {
    next(error);
  }
});
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
      params,
    );
    res.json({ report });
  } catch (error) {
    next(error);
  }
});
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
      params,
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});
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
        u.current_loyalty_level_id,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value,
        MAX(o.created_at) as last_order_date
      FROM users u
      JOIN orders o ON u.id = o.user_id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.status != 'cancelled'${dateFilter}${cityFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.phone, u.current_loyalty_level_id
      ORDER BY ${orderBy}
      LIMIT 100`,
      params,
    );
    res.json({ customers });
  } catch (error) {
    next(error);
  }
});
export default router;
