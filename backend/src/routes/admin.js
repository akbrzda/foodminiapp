import express from "express";
import bcrypt from "bcrypt";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { telegramQueue, imageQueue, getQueueStats, getFailedJobs, retryFailedJobs, cleanQueue } from "../queues/config.js";

const router = express.Router();

// Применить аутентификацию и проверку роли ко всем роутам админ-панели
router.use(authenticateToken);

// Получить список администраторов для фильтра (упрощенный) - ВАЖНО: должно быть перед /users/:id
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

// Получить список администраторов (только для admin и ceo)
router.get("/users", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { role, is_active } = req.query;

    let query = `
      SELECT au.id, au.email, au.first_name, au.last_name, au.role, 
             au.is_active, au.telegram_id, au.created_at, au.updated_at
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

    // Для каждого менеджера получаем привязанные города
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
      } else {
        user.cities = [];
      }
    }

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// Получить информацию об администраторе
router.get("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;

    const [users] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              telegram_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];

    // Если это менеджер, получаем привязанные города
    if (user.role === "manager") {
      const [cities] = await db.query(
        `SELECT c.id, c.name 
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id = ?`,
        [userId],
      );
      user.cities = cities;
    } else {
      user.cities = [];
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// ===== Клиенты (админ-панель) =====
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
             COUNT(o.id) as orders_count,
             last_order.created_at as last_order_at,
             c.name as city_name
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      LEFT JOIN orders last_order ON last_order.id = (
        SELECT id FROM orders WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      )
      LEFT JOIN cities c ON c.id = last_order.city_id
      ${whereClause}
      GROUP BY u.id
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
  try {
    const userId = req.params.id;
    const { amount, mode = "add", description } = req.body;

    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      return res.status(400).json({ error: "Amount must be a number" });
    }

    const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentBalance = parseFloat(users[0].bonus_balance) || 0;
    let newBalance = currentBalance;

    if (mode === "set") {
      newBalance = Math.max(0, parsedAmount);
    } else {
      newBalance = Math.max(0, currentBalance + parsedAmount);
    }

    await db.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);

    await db.query("INSERT INTO bonus_history (user_id, order_id, type, amount, balance_after, description) VALUES (?, NULL, 'manual', ?, ?, ?)", [
      userId,
      parsedAmount,
      newBalance,
      description || (mode === "set" ? "Ручная установка бонусов" : "Ручное изменение бонусов"),
    ]);

    res.json({ balance: newBalance });
  } catch (error) {
    next(error);
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

    const [transactions] = await db.query(
      `SELECT id, order_id, type, amount, balance_after, description, created_at
       FROM bonus_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );

    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});

// Создать администратора (только для admin и ceo)
router.post("/users", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, role, telegram_id, cities } = req.body;

    if (!email || !password || !first_name || !last_name || !role) {
      return res.status(400).json({
        error: "Email, password, first_name, last_name, and role are required",
      });
    }

    // Проверяем валидность роли
    const validRoles = ["admin", "manager", "ceo"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Must be one of: admin, manager, ceo",
      });
    }

    // Проверяем существование email
    const [existingUsers] = await db.query("SELECT id FROM admin_users WHERE email = ?", [email]);

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // Создаем пользователя
    const [result] = await db.query(
      `INSERT INTO admin_users (email, password_hash, first_name, last_name, role, telegram_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, first_name, last_name, role, telegram_id || null],
    );

    const newUserId = result.insertId;

    // Если это менеджер, привязываем города
    if (role === "manager" && cities && cities.length > 0) {
      for (let cityId of cities) {
        await db.query("INSERT INTO admin_user_cities (admin_user_id, city_id) VALUES (?, ?)", [newUserId, cityId]);
      }
    }

    // Получаем созданного пользователя
    const [newUser] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              telegram_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [newUserId],
    );

    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить администратора (только для admin и ceo)
router.put("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { email, password, first_name, last_name, role, telegram_id, is_active, cities } = req.body;

    // Проверяем существование пользователя
    const [existingUsers] = await db.query("SELECT id, role FROM admin_users WHERE id = ?", [userId]);

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const updates = [];
    const values = [];

    if (email !== undefined) {
      // Проверяем уникальность email
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

    if (updates.length > 0) {
      values.push(userId);
      await db.query(`UPDATE admin_users SET ${updates.join(", ")} WHERE id = ?`, values);
    }

    // Обновляем привязку городов для менеджера
    const finalRole = role || existingUsers[0].role;
    if (finalRole === "manager" && cities !== undefined) {
      // Удаляем все существующие привязки
      await db.query("DELETE FROM admin_user_cities WHERE admin_user_id = ?", [userId]);

      // Добавляем новые привязки
      if (cities && cities.length > 0) {
        for (let cityId of cities) {
          await db.query("INSERT INTO admin_user_cities (admin_user_id, city_id) VALUES (?, ?)", [userId, cityId]);
        }
      }
    }

    // Получаем обновленного пользователя
    const [updatedUser] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              telegram_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [userId],
    );

    const user = updatedUser[0];

    // Если это менеджер, получаем привязанные города
    if (user.role === "manager") {
      const [userCities] = await db.query(
        `SELECT c.id, c.name 
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id = ?`,
        [userId],
      );
      user.cities = userCities;
    } else {
      user.cities = [];
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Удалить администратора (только для admin и ceo)
router.delete("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;

    // Проверяем существование пользователя
    const [users] = await db.query("SELECT id FROM admin_users WHERE id = ?", [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Не разрешаем удалять самого себя
    if (req.user.id === parseInt(userId)) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    await db.query("DELETE FROM admin_users WHERE id = ?", [userId]);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// ==================== API мониторинга очередей ====================

/**
 * Получить статистику всех очередей
 * GET /api/admin/queues
 */
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

/**
 * Получить список failed задач конкретной очереди
 * GET /api/admin/queues/:queueType/failed
 */
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

/**
 * Повторить failed задачи конкретной очереди
 * POST /api/admin/queues/:queueType/retry
 */
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

/**
 * Очистить completed задачи конкретной очереди
 * POST /api/admin/queues/:queueType/clean
 */
router.post("/queues/:queueType/clean", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { queueType } = req.params;
    const { grace = 86400000 } = req.body; // По умолчанию 24 часа

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

/**
 * Получить логи действий администраторов
 * GET /api/admin/logs
 * Доступ: только admin и ceo
 * Query params:
 *   - admin_id: фильтр по конкретному администратору
 *   - action_type: фильтр по действию (create, update, delete)
 *   - object_type: фильтр по типу объекта
 *   - date_from, date_to: фильтр по дате
 *   - page, limit: пагинация
 */
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

    // Получаем логи с информацией об администраторе
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

    // Получаем общее количество
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
