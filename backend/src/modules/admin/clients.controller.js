import express from "express";
import db from "../../config/database.js";
import { requireRole } from "../../middleware/auth.js";
import { getSystemSettings } from "../../utils/settings.js";
import { decryptUserData, encryptEmail } from "../../utils/encryption.js";
import { normalizePhone } from "../../utils/phone.js";
import { validateEmail, validatePhone } from "../../utils/validation.js";
import loyaltyAdapter from "../integrations/adapters/loyaltyAdapter.js";

const clientsRouter = express.Router();

const getManagerCityIds = (req) => {
  if (req.user?.role !== "manager") return null;
  if (!Array.isArray(req.user.cities)) return [];
  return req.user.cities.filter((cityId) => Number.isInteger(cityId));
};

const ensureManagerClientAccess = async (req, userId) => {
  if (req.user.role !== "manager") return true;
  const cityIds = getManagerCityIds(req);
  if (!cityIds || cityIds.length === 0) return false;
  const [orders] = await db.query("SELECT id FROM orders WHERE user_id = ? AND city_id IN (?) LIMIT 1", [userId, cityIds]);
  return orders.length > 0;
};

clientsRouter.get("/clients", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const {
      search,
      city_id,
      phone_filter,
      orders_count_from,
      orders_count_to,
      birthday_from,
      birthday_to,
      registration_from,
      registration_to,
      total_orders_sum_from,
      total_orders_sum_to,
      avg_check_from,
      avg_check_to,
      loyalty_balance_from,
      loyalty_balance_to,
      last_order_days_from,
      last_order_days_to,
      limit = 50,
      offset = 0,
    } = req.query;

    const toNumberOrNull = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : null;
    };

    let whereClause = "WHERE 1=1";
    const params = [];
    let ordersAggregateScopeClause = "";
    const ordersAggregateScopeParams = [];
    const requestedCityId = city_id !== undefined && city_id !== null && city_id !== "" ? Number(city_id) : null;
    const normalizedPhoneFilter = String(phone_filter || "with_phone")
      .trim()
      .toLowerCase();

    if (!["with_phone", "without_phone", "all"].includes(normalizedPhoneFilter)) {
      return res.status(400).json({ error: "Invalid phone_filter" });
    }

    if (normalizedPhoneFilter === "without_phone") {
      whereClause += " AND (u.phone IS NULL OR TRIM(u.phone) = '')";
    } else if (normalizedPhoneFilter === "with_phone") {
      whereClause += " AND (u.phone IS NOT NULL AND TRIM(u.phone) <> '')";
    }

    if (requestedCityId !== null && (!Number.isInteger(requestedCityId) || requestedCityId <= 0)) {
      return res.status(400).json({ error: "Invalid city_id" });
    }

    if (search) {
      whereClause += " AND (u.phone LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.json({ clients: [] });
      }
      const managerScopedCityIds = requestedCityId !== null ? [requestedCityId] : cityIds;
      if (requestedCityId !== null && !cityIds.includes(requestedCityId)) {
        return res.json({ clients: [] });
      }
      whereClause += " AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.city_id IN (?))";
      params.push(managerScopedCityIds);
      ordersAggregateScopeClause = "WHERE o.city_id IN (?)";
      ordersAggregateScopeParams.push(managerScopedCityIds);
    } else if (requestedCityId !== null) {
      whereClause += " AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.city_id = ?)";
      params.push(requestedCityId);
      ordersAggregateScopeClause = "WHERE o.city_id = ?";
      ordersAggregateScopeParams.push(requestedCityId);
    }

    const ordersCountFrom = toNumberOrNull(orders_count_from);
    if (ordersCountFrom !== null) {
      whereClause += " AND COALESCE(oa.orders_count, 0) >= ?";
      params.push(ordersCountFrom);
    }
    const ordersCountTo = toNumberOrNull(orders_count_to);
    if (ordersCountTo !== null) {
      whereClause += " AND COALESCE(oa.orders_count, 0) <= ?";
      params.push(ordersCountTo);
    }

    if (birthday_from) {
      whereClause += " AND u.date_of_birth >= ?";
      params.push(birthday_from);
    }
    if (birthday_to) {
      whereClause += " AND u.date_of_birth <= ?";
      params.push(birthday_to);
    }

    if (registration_from) {
      whereClause += " AND DATE(u.created_at) >= ?";
      params.push(registration_from);
    }
    if (registration_to) {
      whereClause += " AND DATE(u.created_at) <= ?";
      params.push(registration_to);
    }

    const totalSumFrom = toNumberOrNull(total_orders_sum_from);
    if (totalSumFrom !== null) {
      whereClause += " AND COALESCE(oa.total_orders_sum, 0) >= ?";
      params.push(totalSumFrom);
    }
    const totalSumTo = toNumberOrNull(total_orders_sum_to);
    if (totalSumTo !== null) {
      whereClause += " AND COALESCE(oa.total_orders_sum, 0) <= ?";
      params.push(totalSumTo);
    }

    const avgCheckFrom = toNumberOrNull(avg_check_from);
    if (avgCheckFrom !== null) {
      whereClause += " AND COALESCE(oa.avg_check, 0) >= ?";
      params.push(avgCheckFrom);
    }
    const avgCheckTo = toNumberOrNull(avg_check_to);
    if (avgCheckTo !== null) {
      whereClause += " AND COALESCE(oa.avg_check, 0) <= ?";
      params.push(avgCheckTo);
    }

    const loyaltyFrom = toNumberOrNull(loyalty_balance_from);
    if (loyaltyFrom !== null) {
      whereClause += " AND COALESCE(u.loyalty_balance, 0) >= ?";
      params.push(loyaltyFrom);
    }
    const loyaltyTo = toNumberOrNull(loyalty_balance_to);
    if (loyaltyTo !== null) {
      whereClause += " AND COALESCE(u.loyalty_balance, 0) <= ?";
      params.push(loyaltyTo);
    }

    const lastOrderDaysFrom = toNumberOrNull(last_order_days_from);
    if (lastOrderDaysFrom !== null) {
      whereClause += " AND oa.last_order_at IS NOT NULL AND TIMESTAMPDIFF(DAY, DATE(oa.last_order_at), CURDATE()) >= ?";
      params.push(lastOrderDaysFrom);
    }
    const lastOrderDaysTo = toNumberOrNull(last_order_days_to);
    if (lastOrderDaysTo !== null) {
      whereClause += " AND oa.last_order_at IS NOT NULL AND TIMESTAMPDIFF(DAY, DATE(oa.last_order_at), CURDATE()) <= ?";
      params.push(lastOrderDaysTo);
    }

    const query = `
      SELECT
             u.id, u.phone, u.first_name, u.last_name, u.email, u.telegram_id,
             u.date_of_birth, u.created_at as registration_date,
             u.loyalty_balance, u.pb_client_id,
             COALESCE(oa.orders_count, 0) as orders_count,
             COALESCE(oa.total_orders_sum, 0) as total_orders_sum,
             COALESCE(oa.avg_check, 0) as avg_check,
             oa.last_order_at,
             TIMESTAMPDIFF(DAY, DATE(oa.last_order_at), CURDATE()) as last_order_days,
             c.name as city_name
      FROM users u
      LEFT JOIN (
        SELECT
          o.user_id,
          SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as orders_count,
          SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as total_orders_sum,
          AVG(CASE WHEN o.status = 'completed' THEN o.total ELSE NULL END) as avg_check,
          MAX(o.created_at) as last_order_at,
          SUBSTRING_INDEX(GROUP_CONCAT(o.city_id ORDER BY o.created_at DESC), ',', 1) as last_order_city_id
        FROM orders o
        ${ordersAggregateScopeClause}
        GROUP BY o.user_id
      ) oa ON oa.user_id = u.id
      LEFT JOIN cities c ON c.id = oa.last_order_city_id
      ${whereClause}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...ordersAggregateScopeParams, ...params, parseInt(limit, 10), parseInt(offset, 10)];
    const [clients] = await db.query(query, queryParams);
    const decryptedClients = clients.map((client) => decryptUserData(client));
    res.json({ clients: decryptedClients });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get("/clients/:id", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }

    const settings = await getSystemSettings();
    const loyaltyMode = String(settings?.integration_mode?.loyalty || "local")
      .trim()
      .toLowerCase();

    if (settings.premiumbonus_enabled && loyaltyMode === "external") {
      try {
        await loyaltyAdapter.getUserBalance(Number(userId));
      } catch (error) {
        // В режиме буфера не блокируем ответ админки при недоступности PB.
      }
    }

    let orderScopeClause = "";
    const orderScopeParams = [];
    let latestOrderScopeClause = "";
    const latestOrderScopeParams = [];

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
      orderScopeClause = "WHERE o.city_id IN (?)";
      orderScopeParams.push(cityIds);
      latestOrderScopeClause = "AND city_id IN (?)";
      latestOrderScopeParams.push(cityIds);
    }

    const [users] = await db.query(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.telegram_id, u.loyalty_balance, u.pb_client_id, u.created_at, u.date_of_birth,
              COALESCE(oa.total_orders_sum, 0) as total_orders_sum,
              COALESCE(oa.avg_check, 0) as avg_check,
              c.name as city_name
       FROM users u
       LEFT JOIN (
         SELECT o.user_id,
                SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as total_orders_sum,
                AVG(CASE WHEN o.status = 'completed' THEN o.total ELSE NULL END) as avg_check
         FROM orders o
         ${orderScopeClause}
         GROUP BY o.user_id
       ) oa ON oa.user_id = u.id
       LEFT JOIN orders o ON o.id = (
         SELECT id FROM orders WHERE user_id = u.id ${latestOrderScopeClause} ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN cities c ON c.id = o.city_id
       WHERE u.id = ?`,
      [...orderScopeParams, ...latestOrderScopeParams, userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const favoritesParams = [userId];
    let favoritesWhereClause = "WHERE o.user_id = ? AND o.status != 'cancelled'";

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
      favoritesWhereClause += " AND o.city_id IN (?)";
      favoritesParams.push(cityIds);
    }

    const [favoriteDishes, favoriteCategories] = await Promise.all([
      db.query(
        `
        SELECT
          COALESCE(
            NULLIF(
              TRIM(
                MAX(CASE WHEN oi.item_name IS NOT NULL AND TRIM(oi.item_name) != '' THEN oi.item_name ELSE NULL END)
              ),
              ''
            ),
            CONCAT('Блюдо #', COALESCE(MAX(oi.item_id), MAX(oi.id)))
          ) as name,
          SUM(oi.quantity) as total_quantity,
          COUNT(DISTINCT oi.order_id) as orders_count,
          MAX(o.created_at) as last_ordered_at
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        ${favoritesWhereClause}
        GROUP BY CASE
          WHEN oi.item_id IS NOT NULL THEN CONCAT('id:', oi.item_id)
          ELSE CONCAT('name:', LOWER(TRIM(COALESCE(oi.item_name, ''))))
        END
        ORDER BY total_quantity DESC, orders_count DESC, last_ordered_at DESC
        LIMIT 5
        `,
        favoritesParams
      ),
      db.query(
        `
        SELECT
          mc.id,
          mc.name,
          COUNT(DISTINCT o.id) as orders_count,
          SUM(oi.quantity) as total_quantity,
          MAX(o.created_at) as last_ordered_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_item_categories mic ON mic.item_id = oi.item_id
        JOIN menu_categories mc ON mc.id = mic.category_id
        ${favoritesWhereClause}
        GROUP BY mc.id, mc.name
        ORDER BY total_quantity DESC, orders_count DESC, last_ordered_at DESC
        LIMIT 5
        `,
        favoritesParams
      ),
    ]);

    const decryptedUser = decryptUserData(users[0]);
    res.json({
      user: decryptedUser,
      favorites: {
        dishes: favoriteDishes[0] || [],
        categories: favoriteCategories[0] || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.put("/clients/:id", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { phone, first_name, last_name, email } = req.body;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    let normalizedPhone = null;
    if (phone !== undefined) {
      const hasPhoneValue = String(phone || "").trim().length > 0;
      if (hasPhoneValue) {
        const phoneValidation = validatePhone(phone);
        if (!phoneValidation.valid) {
          return res.status(400).json({ error: phoneValidation.error });
        }

        normalizedPhone = normalizePhone(phoneValidation.phone);
        if (!normalizedPhone) {
          return res.status(400).json({ error: "Invalid phone format" });
        }

        const [existingUsers] = await db.query("SELECT id FROM users WHERE phone = ? AND id != ?", [normalizedPhone, userId]);
        if (existingUsers.length > 0) {
          return res.status(409).json({ error: "Phone number already in use" });
        }
      }
    }

    let encryptedEmail = null;
    if (email !== undefined) {
      const hasEmailValue = String(email || "").trim().length > 0;
      if (hasEmailValue) {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          return res.status(400).json({ error: emailValidation.error });
        }
        encryptedEmail = encryptEmail(emailValidation.email);
      }
    }

    await db.query("UPDATE users SET phone = ?, first_name = ?, last_name = ?, email = ? WHERE id = ?", [
      normalizedPhone,
      first_name || null,
      last_name || null,
      encryptedEmail,
      userId,
    ]);

    let orderScopeClause = "";
    const orderScopeParams = [];
    let latestOrderScopeClause = "";
    const latestOrderScopeParams = [];

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
      orderScopeClause = "WHERE o.city_id IN (?)";
      orderScopeParams.push(cityIds);
      latestOrderScopeClause = "AND city_id IN (?)";
      latestOrderScopeParams.push(cityIds);
    }

    const [updated] = await db.query(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.telegram_id, u.loyalty_balance, u.pb_client_id, u.created_at, u.date_of_birth,
              COALESCE(oa.total_orders_sum, 0) as total_orders_sum,
              COALESCE(oa.avg_check, 0) as avg_check,
              c.name as city_name
       FROM users u
       LEFT JOIN (
         SELECT o.user_id,
                SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as total_orders_sum,
                AVG(CASE WHEN o.status = 'completed' THEN o.total ELSE NULL END) as avg_check
         FROM orders o
         ${orderScopeClause}
         GROUP BY o.user_id
       ) oa ON oa.user_id = u.id
       LEFT JOIN orders o ON o.id = (
         SELECT id FROM orders WHERE user_id = u.id ${latestOrderScopeClause} ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN cities c ON c.id = o.city_id
       WHERE u.id = ?`,
      [...orderScopeParams, ...latestOrderScopeParams, userId]
    );

    const decryptedUser = decryptUserData(updated[0]);
    res.json({ user: decryptedUser });
  } catch (error) {
    next(error);
  }
});

clientsRouter.delete("/clients/:id", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await db.query("DELETE FROM users WHERE id = ?", [userId]);
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get("/clients/:id/orders", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const statusGroup = String(req.query.status_group || "active")
      .trim()
      .toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const statusGroups = {
      active: ["pending", "confirmed", "preparing", "ready", "delivering"],
      completed: ["completed"],
      cancelled: ["cancelled"],
    };

    const selectedStatuses = statusGroups[statusGroup] || statusGroups.active;
    let baseWhereClause = "WHERE o.user_id = ?";
    const baseParams = [userId];

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
      baseWhereClause += " AND o.city_id IN (?)";
      baseParams.push(cityIds);
    }

    const whereClause = `${baseWhereClause} AND o.status IN (?)`;

    const [[orders], [totalRows], [summaryRows]] = await Promise.all([
      db.query(
        `
        SELECT o.id, o.order_number, o.total, o.status, o.created_at,
               (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count,
               c.name as city_name, b.name as branch_name
        FROM orders o
        LEFT JOIN cities c ON o.city_id = c.id
        LEFT JOIN branches b ON o.branch_id = b.id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
        `,
        [...baseParams, selectedStatuses, limit, offset]
      ),
      db.query(
        `
        SELECT COUNT(*) as total
        FROM orders o
        ${whereClause}
        `,
        [...baseParams, selectedStatuses]
      ),
      db.query(
        `
        SELECT
          SUM(CASE WHEN o.status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivering') THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM orders o
        ${baseWhereClause}
        `,
        baseParams
      ),
    ]);

    const total = Number(totalRows[0]?.total || 0);
    const summary = summaryRows[0] || {};

    res.json({
      orders,
      summary: {
        active: Number(summary.active || 0),
        completed: Number(summary.completed || 0),
        cancelled: Number(summary.cancelled || 0),
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default clientsRouter;
