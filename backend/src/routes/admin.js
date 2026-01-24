import express from "express";
import bcrypt from "bcrypt";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { telegramQueue, imageQueue, getQueueStats, getFailedJobs, retryFailedJobs, cleanQueue } from "../queues/config.js";
import { getSystemSettings } from "../utils/settings.js";
import { getBonusHistory, applyManualBonusAdjustment } from "../utils/bonuses.js";
import { logLoyaltyEvent } from "../utils/loyaltyLogs.js";
const router = express.Router();
router.use(authenticateToken);
router.get("/users/admins", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [admins] = await db.query(
      `SELECT id, email, first_name, last_name, role
       FROM admin_users
       WHERE is_active = true
       ORDER BY first_name, last_name`,
    );
    res.json({ admins });
  } catch (error) {
    console.error("Ошибка получения списка администраторов:", error);
    next(error);
  }
});
router.get("/users", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { role, is_active } = req.query;
    let query = `
      SELECT au.id, au.email, au.first_name, au.last_name, au.role, 
             au.is_active, au.telegram_id, au.branch_id, au.created_at, au.updated_at
      FROM admin_users au
      WHERE 1=1
    `;
    const params = [];
    if (role) {
      query += " AND au.role = ?";
      params.push(role);
    }
    if (is_active !== undefined) {
      query += " AND au.is_active = ?";
      params.push(is_active === "true" || is_active === true);
    }
    query += " ORDER BY au.created_at DESC";
    const [users] = await db.query(query, params);
    for (let user of users) {
      if (user.role === "manager") {
        const [cities] = await db.query(
          `SELECT c.id, c.name 
           FROM admin_user_cities auc
           JOIN cities c ON auc.city_id = c.id
           WHERE auc.admin_user_id = ?`,
          [user.id],
        );
        user.cities = cities;
        const [branches] = await db.query(
          `SELECT b.id, b.name, b.city_id
           FROM admin_user_branches aub
           JOIN branches b ON aub.branch_id = b.id
           WHERE aub.admin_user_id = ?`,
          [user.id],
        );
        user.branches = branches || [];
      } else {
        user.cities = [];
        user.branches = [];
      }
    }
    res.json({ users });
  } catch (error) {
    next(error);
  }
});
router.get("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [users] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              telegram_id, branch_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [userId],
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = users[0];
    if (user.role === "manager") {
      const [cities] = await db.query(
        `SELECT c.id, c.name 
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id = ?`,
        [userId],
      );
      user.cities = cities;
      const [branches] = await db.query(
        `SELECT b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id = ?`,
        [userId],
      );
      user.branches = branches || [];
    } else {
      user.cities = [];
      user.branches = [];
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
router.get("/clients", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { search, city_id, limit = 50, offset = 0 } = req.query;
    let whereClause = "WHERE 1=1";
    const params = [];
    if (search) {
      whereClause += " AND (u.phone LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.user.role === "manager") {
      whereClause += " AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.city_id IN (?))";
      params.push(req.user.cities);
    } else if (city_id) {
      whereClause += " AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.city_id = ?)";
      params.push(city_id);
    }
    const query = `
      SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.bonus_balance,
             COALESCE(oc.orders_count, 0) as orders_count,
             lo.created_at as last_order_at,
             c.name as city_name
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as orders_count
        FROM orders
        GROUP BY user_id
      ) oc ON oc.user_id = u.id
      LEFT JOIN (
        SELECT o1.user_id, o1.created_at, o1.city_id
        FROM orders o1
        JOIN (
          SELECT user_id, MAX(created_at) as max_created_at
          FROM orders
          GROUP BY user_id
        ) o2 ON o2.user_id = o1.user_id AND o2.max_created_at = o1.created_at
      ) lo ON lo.user_id = u.id
      LEFT JOIN cities c ON c.id = lo.city_id
      ${whereClause}
      ORDER BY last_order_at DESC, u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));
    const [clients] = await db.query(query, params);
    res.json({ clients });
  } catch (error) {
    next(error);
  }
});
const ensureManagerClientAccess = async (req, userId) => {
  if (req.user.role !== "manager") return true;
  const [orders] = await db.query("SELECT id FROM orders WHERE user_id = ? AND city_id IN (?) LIMIT 1", [userId, req.user.cities]);
  return orders.length > 0;
};
router.get("/clients/:id", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }
    const [users] = await db.query(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.bonus_balance, u.created_at,
              c.name as city_name
       FROM users u
       LEFT JOIN orders o ON o.id = (
         SELECT id FROM orders WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN cities c ON c.id = o.city_id
       WHERE u.id = ?`,
      [userId],
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: users[0] });
  } catch (error) {
    next(error);
  }
});
router.put("/clients/:id", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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
    await db.query("UPDATE users SET phone = ?, first_name = ?, last_name = ?, email = ? WHERE id = ?", [
      phone || null,
      first_name || null,
      last_name || null,
      email || null,
      userId,
    ]);
    const [updated] = await db.query(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.bonus_balance, u.created_at,
              c.name as city_name
       FROM users u
       LEFT JOIN orders o ON o.id = (
         SELECT id FROM orders WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN cities c ON c.id = o.city_id
       WHERE u.id = ?`,
      [userId],
    );
    res.json({ user: updated[0] });
  } catch (error) {
    next(error);
  }
});
router.post("/clients/:id/bonuses", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const settings = await getSystemSettings();
    if (!settings.bonuses_enabled) {
      await connection.rollback();
      return res.status(403).json({ error: "Бонусная система отключена" });
    }
    const userId = req.params.id;
    const { amount, mode = "add" } = req.body;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      await connection.rollback();
      return res.status(403).json({ error: "You do not have access to this user" });
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      await connection.rollback();
      return res.status(400).json({ error: "Amount must be a number" });
    }
    const [users] = await connection.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "User not found" });
    }
    const currentBalance = parseFloat(users[0].bonus_balance) || 0;
    let newBalance = currentBalance;
    if (mode === "set") {
      newBalance = Math.max(0, parsedAmount);
    } else {
      newBalance = Math.max(0, currentBalance + parsedAmount);
    }
    const delta = newBalance - currentBalance;
    if (delta !== 0) {
      await applyManualBonusAdjustment({ userId, delta, connection });
    }
    await connection.commit();
    res.json({ balance: newBalance });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});
router.get("/clients/:id/orders", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    let whereClause = "WHERE o.user_id = ?";
    const params = [userId];
    if (req.user.role === "manager") {
      whereClause += " AND o.city_id IN (?)";
      params.push(req.user.cities);
    }
    const [orders] = await db.query(
      `
      SELECT o.id, o.order_number, o.total, o.status, o.created_at,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count,
             c.name as city_name, b.name as branch_name
      FROM orders o
      LEFT JOIN cities c ON o.city_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT 20
      `,
      params,
    );
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});
router.get("/clients/:id/bonuses", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    if (req.user.role === "manager") {
      const [orders] = await db.query("SELECT id FROM orders WHERE user_id = ? AND city_id IN (?) LIMIT 1", [userId, req.user.cities]);
      if (orders.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
    }
    const transactions = await getBonusHistory(userId, 50, 0);
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});
router.get("/loyalty/levels", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [levels] = await db.query(
      `SELECT 
         ll.id,
         ll.name,
         ll.level_number,
         ll.threshold_amount,
         ll.earn_percent,
         ll.max_spend_percent,
         ll.is_active,
         ll.sort_order,
         COUNT(DISTINCT u.id) as user_count
       FROM loyalty_levels ll
       LEFT JOIN users u ON u.current_loyalty_level_id = ll.id
       WHERE ll.deleted_at IS NULL
       GROUP BY ll.id
       ORDER BY ll.sort_order ASC, ll.level_number ASC`,
    );
    res.json({ levels });
  } catch (error) {
    next(error);
  }
});
router.post("/loyalty/levels", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active = true, sort_order = 0 } = req.body;
    if (!name || !level_number) {
      return res.status(400).json({ error: "name и level_number обязательны" });
    }
    const normalizedThreshold = Number(level_number) === 1 ? 0 : Math.max(0, Number(threshold_amount) || 0);
    const [result] = await db.query(
      `INSERT INTO loyalty_levels (name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        Number(level_number),
        normalizedThreshold,
        Number(earn_percent) || 0,
        Number(max_spend_percent) || 0,
        Boolean(is_active),
        Number(sort_order) || 0,
      ],
    );
    await logLoyaltyEvent({ eventType: "cron_execution", severity: "info", message: "Создан уровень лояльности" });
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    next(error);
  }
});
router.put("/loyalty/levels/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const levelId = req.params.id;
    const { name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order } = req.body;
    const normalizedThreshold = Number(level_number) === 1 ? 0 : Math.max(0, Number(threshold_amount) || 0);
    await db.query(
      `UPDATE loyalty_levels
       SET name = ?, level_number = ?, threshold_amount = ?, earn_percent = ?, max_spend_percent = ?, is_active = ?, sort_order = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        name,
        Number(level_number),
        normalizedThreshold,
        Number(earn_percent) || 0,
        Number(max_spend_percent) || 0,
        Boolean(is_active),
        Number(sort_order) || 0,
        levelId,
      ],
    );
    await logLoyaltyEvent({ eventType: "cron_execution", severity: "info", message: "Обновлен уровень лояльности" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
router.delete("/loyalty/levels/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const levelId = req.params.id;
    const [inUse] = await db.query("SELECT id FROM users WHERE current_loyalty_level_id = ? LIMIT 1", [levelId]);
    if (inUse.length > 0) {
      return res.status(400).json({ error: "Нельзя удалить уровень с активными пользователями" });
    }
    const [history] = await db.query("SELECT id FROM user_loyalty_levels WHERE level_id = ? LIMIT 1", [levelId]);
    if (history.length > 0) {
      return res.status(400).json({ error: "Нельзя удалить уровень с историей пользователей" });
    }
    await db.query("UPDATE loyalty_levels SET deleted_at = NOW(), is_active = FALSE WHERE id = ?", [levelId]);
    await logLoyaltyEvent({ eventType: "cron_execution", severity: "warning", message: "Удален уровень лояльности" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
router.get("/loyalty/logs", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, event_type, severity, user_id } = req.query;
    const filters = [];
    const params = [];
    if (event_type) {
      filters.push("event_type = ?");
      params.push(event_type);
    }
    if (severity) {
      filters.push("severity = ?");
      params.push(severity);
    }
    if (user_id) {
      filters.push("user_id = ?");
      params.push(user_id);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    params.push(Number(limit), Number(offset));
    const [logs] = await db.query(
      `SELECT id, event_type, severity, user_id, order_id, transaction_id, message, details, created_at
       FROM loyalty_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});
router.get("/loyalty/audit/duplicates", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT order_id, type, COUNT(*) as total
       FROM loyalty_transactions
       WHERE order_id IS NOT NULL
       GROUP BY order_id, type
       HAVING COUNT(*) > 1
       ORDER BY total DESC`,
    );
    res.json({ duplicates: rows });
  } catch (error) {
    next(error);
  }
});
router.get("/loyalty/audit/mismatches", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id as user_id, u.bonus_balance as user_balance,
              COALESCE(t.total_earned, 0) as total_earned,
              COALESCE(t.total_spent, 0) as total_spent,
              COALESCE(t.total_expired, 0) as total_expired
       FROM users u
       LEFT JOIN (
         SELECT
           user_id,
           SUM(
             CASE
               WHEN type IN ('earn', 'register_bonus', 'birthday_bonus', 'refund_spend') THEN amount
               WHEN type = 'adjustment' AND amount > 0 THEN amount
               ELSE 0
             END
           ) AS total_earned,
           SUM(
             CASE
               WHEN type IN ('spend', 'refund_earn') THEN amount
               WHEN type = 'adjustment' AND amount < 0 THEN ABS(amount)
               ELSE 0
             END
           ) AS total_spent,
           SUM(CASE WHEN type = 'expire' THEN amount ELSE 0 END) AS total_expired
         FROM loyalty_transactions
         WHERE status = 'completed'
         GROUP BY user_id
       ) t ON t.user_id = u.id`,
    );
    const mismatches = rows
      .map((row) => {
        const calculated = Math.max(0, Number(row.total_earned) - Number(row.total_spent) - Number(row.total_expired));
        return { ...row, calculated_balance: calculated };
      })
      .filter((row) => Number(row.user_balance) !== Number(row.calculated_balance));
    res.json({ mismatches });
  } catch (error) {
    next(error);
  }
});
router.get("/loyalty/users/:id/stats", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [rows] = await db.query(
      `SELECT us.*, ll.name as level_name, ll.level_number
       FROM user_loyalty_stats us
       LEFT JOIN users u ON u.id = us.user_id
       LEFT JOIN loyalty_levels ll ON ll.id = u.current_loyalty_level_id
       WHERE us.user_id = ?`,
      [userId],
    );
    res.json({ stats: rows[0] || null });
  } catch (error) {
    next(error);
  }
});
router.get("/loyalty/users/:id/levels", requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [rows] = await db.query(
      `SELECT ul.id, ul.reason, ul.total_spent_amount, ul.started_at, ul.ended_at,
              ll.name as level_name, ll.level_number
       FROM user_loyalty_levels ul
       JOIN loyalty_levels ll ON ll.id = ul.level_id
       WHERE ul.user_id = ?
       ORDER BY ul.started_at DESC`,
      [userId],
    );
    res.json({ levels: rows });
  } catch (error) {
    next(error);
  }
});
router.post("/users", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, role, telegram_id, cities, branch_ids } = req.body;
    if (!email || !password || !first_name || !last_name || !role) {
      return res.status(400).json({
        error: "Email, password, first_name, last_name, and role are required",
      });
    }
    const validRoles = ["admin", "manager", "ceo"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Must be one of: admin, manager, ceo",
      });
    }
    const [existingUsers] = await db.query("SELECT id FROM admin_users WHERE email = ?", [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }
    let managerBranchIds = [];
    if (role === "manager" && Array.isArray(branch_ids) && branch_ids.length > 0) {
      const [branches] = await db.query("SELECT id, city_id FROM branches WHERE id IN (?)", [branch_ids]);
      if (branches.length !== branch_ids.length) {
        return res.status(400).json({ error: "One or more branches not found" });
      }
      if (Array.isArray(cities) && cities.length > 0) {
        const citySet = new Set(cities);
        const invalidBranch = branches.find((branch) => !citySet.has(branch.city_id));
        if (invalidBranch) {
          return res.status(400).json({ error: "Branch city must be included in manager cities" });
        }
      }
      managerBranchIds = branch_ids;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO admin_users (email, password_hash, first_name, last_name, role, telegram_id, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, first_name, last_name, role, telegram_id || null, null],
    );
    const newUserId = result.insertId;
    if (role === "manager" && cities && cities.length > 0) {
      for (let cityId of cities) {
        await db.query("INSERT INTO admin_user_cities (admin_user_id, city_id) VALUES (?, ?)", [newUserId, cityId]);
      }
    }
    if (role === "manager" && managerBranchIds.length > 0) {
      for (let branchId of managerBranchIds) {
        await db.query("INSERT INTO admin_user_branches (admin_user_id, branch_id) VALUES (?, ?)", [newUserId, branchId]);
      }
    }
    const [newUser] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              telegram_id, branch_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [newUserId],
    );
    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});
router.put("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { email, password, first_name, last_name, role, telegram_id, is_active, cities, branch_ids } = req.body;
    const [existingUsers] = await db.query("SELECT id, role, branch_id FROM admin_users WHERE id = ?", [userId]);
    if (existingUsers.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const updates = [];
    const values = [];
    if (email !== undefined) {
      const [emailCheck] = await db.query("SELECT id FROM admin_users WHERE email = ? AND id != ?", [email, userId]);
      if (emailCheck.length > 0) {
        return res.status(400).json({ error: "Email already exists" });
      }
      updates.push("email = ?");
      values.push(email);
    }
    if (password !== undefined && password !== "") {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push("password_hash = ?");
      values.push(passwordHash);
    }
    if (first_name !== undefined) {
      updates.push("first_name = ?");
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push("last_name = ?");
      values.push(last_name);
    }
    if (role !== undefined) {
      const validRoles = ["admin", "manager", "ceo"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          error: "Invalid role. Must be one of: admin, manager, ceo",
        });
      }
      updates.push("role = ?");
      values.push(role);
    }
    if (telegram_id !== undefined) {
      const normalizedTelegramId = telegram_id === "" ? null : telegram_id;
      updates.push("telegram_id = ?");
      values.push(normalizedTelegramId);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    const finalRole = role || existingUsers[0].role;
    if (finalRole !== "manager") {
      updates.push("branch_id = ?");
      values.push(null);
    }
    if (updates.length > 0) {
      values.push(userId);
      await db.query(`UPDATE admin_users SET ${updates.join(", ")} WHERE id = ?`, values);
    }
    if (finalRole === "manager" && cities !== undefined) {
      await db.query("DELETE FROM admin_user_cities WHERE admin_user_id = ?", [userId]);
      if (cities && cities.length > 0) {
        for (let cityId of cities) {
          await db.query("INSERT INTO admin_user_cities (admin_user_id, city_id) VALUES (?, ?)", [userId, cityId]);
        }
      }
    }
    if (finalRole === "manager" && branch_ids !== undefined) {
      const branchList = Array.isArray(branch_ids) ? branch_ids : [];
      if (branchList.length > 0) {
        const [branches] = await db.query("SELECT id, city_id FROM branches WHERE id IN (?)", [branchList]);
        if (branches.length !== branchList.length) {
          return res.status(400).json({ error: "One or more branches not found" });
        }
        let cityIdsToCheck = cities;
        if (cityIdsToCheck === undefined) {
          const [currentCities] = await db.query("SELECT city_id FROM admin_user_cities WHERE admin_user_id = ?", [userId]);
          cityIdsToCheck = currentCities.map((city) => city.city_id);
        }
        if (Array.isArray(cityIdsToCheck) && cityIdsToCheck.length > 0) {
          const citySet = new Set(cityIdsToCheck);
          const invalidBranch = branches.find((branch) => !citySet.has(branch.city_id));
          if (invalidBranch) {
            return res.status(400).json({ error: "Branch city must be included in manager cities" });
          }
        }
      }
      await db.query("DELETE FROM admin_user_branches WHERE admin_user_id = ?", [userId]);
      for (let branchId of branchList) {
        await db.query("INSERT INTO admin_user_branches (admin_user_id, branch_id) VALUES (?, ?)", [userId, branchId]);
      }
    } else if (finalRole !== "manager") {
      await db.query("DELETE FROM admin_user_branches WHERE admin_user_id = ?", [userId]);
    }
    const [updatedUser] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              telegram_id, branch_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [userId],
    );
    const user = updatedUser[0];
    if (user.role === "manager") {
      const [userCities] = await db.query(
        `SELECT c.id, c.name 
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id = ?`,
        [userId],
      );
      user.cities = userCities;
      const [branches] = await db.query(
        `SELECT b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id = ?`,
        [userId],
      );
      user.branches = branches || [];
    } else {
      user.cities = [];
      user.branches = [];
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
router.delete("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [users] = await db.query("SELECT id FROM admin_users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (req.user.id === parseInt(userId)) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }
    await db.query("DELETE FROM admin_users WHERE id = ?", [userId]);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/queues", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [telegramStats, imageStats] = await Promise.all([getQueueStats(telegramQueue), getQueueStats(imageQueue)]);
    res.json({
      queues: {
        telegram: {
          name: "Telegram Notifications",
          ...telegramStats,
        },
        images: {
          name: "Image Processing",
          ...imageStats,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/queues/:queueType/failed", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    let queue;
    if (queueType === "telegram") {
      queue = telegramQueue;
    } else if (queueType === "images") {
      queue = imageQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue type. Must be 'telegram' or 'images'" });
    }
    const failedJobs = await getFailedJobs(queue, parseInt(offset), parseInt(offset) + parseInt(limit));
    res.json({
      queueType,
      failed: failedJobs,
      total: failedJobs.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});
router.post("/queues/:queueType/retry", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;
    let queue;
    if (queueType === "telegram") {
      queue = telegramQueue;
    } else if (queueType === "images") {
      queue = imageQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue type. Must be 'telegram' or 'images'" });
    }
    const retriedCount = await retryFailedJobs(queue);
    res.json({
      queueType,
      retriedCount,
      message: `Successfully retried ${retriedCount} failed jobs`,
    });
  } catch (error) {
    next(error);
  }
});
router.post("/queues/:queueType/clean", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;
    const { grace = 86400000 } = req.body;
    let queue;
    if (queueType === "telegram") {
      queue = telegramQueue;
    } else if (queueType === "images") {
      queue = imageQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue type. Must be 'telegram' or 'images'" });
    }
    const cleaned = await cleanQueue(queue, parseInt(grace));
    res.json({
      queueType,
      cleanedCount: cleaned.length,
      message: `Successfully cleaned ${cleaned.length} completed jobs`,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/logs", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { admin_id, action_type, object_type, date_from, date_to, page = 1, limit = 50 } = req.query;
    let whereClause = "WHERE 1=1";
    const params = [];
    if (admin_id) {
      whereClause += " AND al.admin_user_id = ?";
      params.push(admin_id);
    }
    if (action_type) {
      whereClause += " AND al.action = ?";
      params.push(action_type);
    }
    if (object_type) {
      whereClause += " AND al.entity_type = ?";
      params.push(object_type);
    }
    if (date_from) {
      whereClause += " AND al.created_at >= ?";
      params.push(date_from);
    }
    if (date_to) {
      whereClause += " AND al.created_at <= ?";
      params.push(`${date_to} 23:59:59`);
    }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [logs] = await db.query(
      `SELECT 
         al.id,
         al.action,
         al.entity_type as object_type,
         al.entity_id as object_id,
         al.description as details,
         al.ip_address,
         al.created_at,
         au.id as admin_id,
         CONCAT(au.first_name, ' ', au.last_name) as admin_name,
         au.email as admin_email
       FROM admin_action_logs al
       LEFT JOIN admin_users au ON al.admin_user_id = au.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)],
    );
    const [countResult] = await db.query(`SELECT COUNT(*) as total FROM admin_action_logs al ${whereClause}`, params);
    res.json({
      logs,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Ошибка получения логов:", error);
    next(error);
  }
});
export default router;
