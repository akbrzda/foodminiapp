import express from "express";
import db from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Регистрация/получение пользователя по номеру телефона
router.post("/register", async (req, res, next) => {
  try {
    const { phone, telegram_id, first_name, last_name } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Проверяем существует ли пользователь
    const [existingUsers] = await db.query("SELECT * FROM users WHERE phone = ?", [phone]);

    if (existingUsers.length > 0) {
      // Обновляем данные если они изменились
      const user = existingUsers[0];
      const updates = [];
      const values = [];

      if (telegram_id && user.telegram_id !== telegram_id) {
        updates.push("telegram_id = ?");
        values.push(telegram_id);
      }
      if (first_name && user.first_name !== first_name) {
        updates.push("first_name = ?");
        values.push(first_name);
      }
      if (last_name && user.last_name !== last_name) {
        updates.push("last_name = ?");
        values.push(last_name);
      }

      if (updates.length > 0) {
        values.push(user.id);
        await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
      }

      // Получаем обновленные данные
      const [updatedUsers] = await db.query(
        "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, created_at, updated_at FROM users WHERE id = ?",
        [user.id]
      );

      return res.json({ user: updatedUsers[0] });
    }

    // Создаем нового пользователя
    const [result] = await db.query("INSERT INTO users (phone, telegram_id, first_name, last_name) VALUES (?, ?, ?, ?)", [
      phone,
      telegram_id || null,
      first_name || null,
      last_name || null,
    ]);

    const [newUser] = await db.query(
      "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, created_at, updated_at FROM users WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});

// Получить профиль пользователя
router.get("/profile", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [users] = await db.query(
      "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, created_at, updated_at FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: users[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить профиль пользователя
router.put("/profile", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, email, date_of_birth } = req.body;

    const updates = [];
    const values = [];

    if (first_name !== undefined) {
      updates.push("first_name = ?");
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push("last_name = ?");
      values.push(last_name);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      values.push(email);
    }
    if (date_of_birth !== undefined) {
      updates.push("date_of_birth = ?");
      values.push(date_of_birth);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(userId);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedUsers] = await db.query(
      "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, created_at, updated_at FROM users WHERE id = ?",
      [userId]
    );

    res.json({ user: updatedUsers[0] });
  } catch (error) {
    next(error);
  }
});

// Получить адреса доставки
router.get("/addresses", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [addresses] = await db.query(
      `SELECT da.*, c.name as city_name 
       FROM delivery_addresses da
       LEFT JOIN cities c ON da.city_id = c.id
       WHERE da.user_id = ?
       ORDER BY da.is_default DESC, da.created_at DESC`,
      [userId]
    );

    res.json({ addresses });
  } catch (error) {
    next(error);
  }
});

// Добавить адрес доставки
router.post("/addresses", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default } = req.body;

    if (!city_id || !street || !house) {
      return res.status(400).json({
        error: "City, street, and house are required",
      });
    }

    // Проверяем существует ли город
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ? AND is_active = TRUE", [city_id]);

    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found or inactive" });
    }

    // Если это адрес по умолчанию, убираем флаг с других адресов
    if (is_default) {
      await db.query("UPDATE delivery_addresses SET is_default = FALSE WHERE user_id = ?", [userId]);
    }

    const [result] = await db.query(
      `INSERT INTO delivery_addresses 
       (user_id, city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        city_id,
        street,
        house,
        entrance || null,
        apartment || null,
        intercom || null,
        comment || null,
        latitude || null,
        longitude || null,
        is_default || false,
      ]
    );

    const [newAddress] = await db.query(
      `SELECT da.*, c.name as city_name 
       FROM delivery_addresses da
       LEFT JOIN cities c ON da.city_id = c.id
       WHERE da.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ address: newAddress[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить адрес доставки
router.put("/addresses/:id", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    const { city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default } = req.body;

    // Проверяем что адрес принадлежит пользователю
    const [addresses] = await db.query("SELECT id FROM delivery_addresses WHERE id = ? AND user_id = ?", [addressId, userId]);

    if (addresses.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    const updates = [];
    const values = [];

    if (city_id !== undefined) {
      // Проверяем существует ли город
      const [cities] = await db.query("SELECT id FROM cities WHERE id = ? AND is_active = TRUE", [city_id]);
      if (cities.length === 0) {
        return res.status(404).json({ error: "City not found or inactive" });
      }
      updates.push("city_id = ?");
      values.push(city_id);
    }
    if (street !== undefined) {
      updates.push("street = ?");
      values.push(street);
    }
    if (house !== undefined) {
      updates.push("house = ?");
      values.push(house);
    }
    if (entrance !== undefined) {
      updates.push("entrance = ?");
      values.push(entrance);
    }
    if (apartment !== undefined) {
      updates.push("apartment = ?");
      values.push(apartment);
    }
    if (intercom !== undefined) {
      updates.push("intercom = ?");
      values.push(intercom);
    }
    if (comment !== undefined) {
      updates.push("comment = ?");
      values.push(comment);
    }
    if (latitude !== undefined) {
      updates.push("latitude = ?");
      values.push(latitude);
    }
    if (longitude !== undefined) {
      updates.push("longitude = ?");
      values.push(longitude);
    }
    if (is_default !== undefined) {
      // Если устанавливаем адрес по умолчанию, убираем флаг с других адресов
      if (is_default) {
        await db.query("UPDATE delivery_addresses SET is_default = FALSE WHERE user_id = ?", [userId]);
      }
      updates.push("is_default = ?");
      values.push(is_default);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(addressId);
    await db.query(`UPDATE delivery_addresses SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedAddress] = await db.query(
      `SELECT da.*, c.name as city_name 
       FROM delivery_addresses da
       LEFT JOIN cities c ON da.city_id = c.id
       WHERE da.id = ?`,
      [addressId]
    );

    res.json({ address: updatedAddress[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить адрес доставки
router.delete("/addresses/:id", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;

    // Проверяем что адрес принадлежит пользователю
    const [addresses] = await db.query("SELECT id FROM delivery_addresses WHERE id = ? AND user_id = ?", [addressId, userId]);

    if (addresses.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    await db.query("DELETE FROM delivery_addresses WHERE id = ?", [addressId]);

    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
