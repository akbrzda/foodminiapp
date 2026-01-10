import express from "express";
import bcrypt from "bcrypt";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Применить аутентификацию и проверку роли ко всем роутам админ-панели
router.use(authenticateToken);

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
          [user.id]
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
      [userId]
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
        [userId]
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
      [email, passwordHash, first_name, last_name, role, telegram_id || null]
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
      [newUserId]
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

    if (password !== undefined) {
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
      updates.push("telegram_id = ?");
      values.push(telegram_id);
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
      [userId]
    );

    const user = updatedUser[0];

    // Если это менеджер, получаем привязанные города
    if (user.role === "manager") {
      const [userCities] = await db.query(
        `SELECT c.id, c.name 
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id = ?`,
        [userId]
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

export default router;
