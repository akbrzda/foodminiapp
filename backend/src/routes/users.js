import express from "express";
import db from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { normalizePhone } from "../utils/phone.js";
import { getSystemSettings } from "../utils/settings.js";
import { getLoyaltySettings } from "../utils/loyaltySettings.js";
import { grantRegistrationBonus } from "../utils/bonuses.js";
const router = express.Router();
router.post("/register", async (req, res, next) => {
  try {
    const { phone, telegram_id, first_name, last_name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    const [existingUsers] = await db.query("SELECT * FROM users WHERE phone = ?", [phone]);
    if (existingUsers.length > 0) {
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
      const [updatedUsers] = await db.query(
        "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, loyalty_level, total_spent, created_at, updated_at FROM users WHERE id = ?",
        [user.id],
      );
      return res.json({ user: updatedUsers[0] });
    }
    const [result] = await db.query("INSERT INTO users (phone, telegram_id, first_name, last_name) VALUES (?, ?, ?, ?)", [
      phone,
      telegram_id || null,
      first_name || null,
      last_name || null,
    ]);
    const [newUser] = await db.query(
      "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, loyalty_level, total_spent, created_at, updated_at FROM users WHERE id = ?",
      [result.insertId],
    );
    try {
      const systemSettings = await getSystemSettings();
      if (systemSettings.bonuses_enabled) {
        const loyaltySettings = await getLoyaltySettings();
        await grantRegistrationBonus(result.insertId, null, loyaltySettings);
      }
    } catch (bonusError) {
      console.error("Failed to grant registration bonus:", bonusError);
    }
    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});
router.get("/profile", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [users] = await db.query(
      "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, loyalty_level, total_spent, created_at, updated_at FROM users WHERE id = ?",
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
router.get("/state", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
      `SELECT user_id, selected_city_id, selected_branch_id, delivery_type, delivery_address, delivery_coords, delivery_details, cart, updated_at
       FROM user_states WHERE user_id = ?`,
      [userId],
    );
    if (rows.length === 0) {
      return res.json({ state: null });
    }
    const state = rows[0];
    const parseJson = (value) => {
      if (!value) return null;
      if (typeof value === "object") return value;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };
    res.json({
      state: {
        user_id: state.user_id,
        selected_city_id: state.selected_city_id,
        selected_branch_id: state.selected_branch_id,
        delivery_type: state.delivery_type,
        delivery_address: state.delivery_address,
        delivery_coords: parseJson(state.delivery_coords),
        delivery_details: parseJson(state.delivery_details),
        cart: parseJson(state.cart) || [],
        updated_at: state.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});
router.put("/state", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { selected_city_id, selected_branch_id, delivery_type, delivery_address, delivery_coords, delivery_details, cart } = req.body || {};
    await db.query(
      `INSERT INTO user_states
        (user_id, selected_city_id, selected_branch_id, delivery_type, delivery_address, delivery_coords, delivery_details, cart)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        selected_city_id = VALUES(selected_city_id),
        selected_branch_id = VALUES(selected_branch_id),
        delivery_type = VALUES(delivery_type),
        delivery_address = VALUES(delivery_address),
        delivery_coords = VALUES(delivery_coords),
        delivery_details = VALUES(delivery_details),
        cart = VALUES(cart),
        updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        selected_city_id || null,
        selected_branch_id || null,
        delivery_type || "delivery",
        delivery_address || "",
        delivery_coords ? JSON.stringify(delivery_coords) : null,
        delivery_details ? JSON.stringify(delivery_details) : null,
        cart ? JSON.stringify(cart) : JSON.stringify([]),
      ],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
router.put("/profile", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, email, date_of_birth, phone } = req.body;
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
    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      if (normalizedPhone.length > 20) {
        return res.status(400).json({ error: "Phone number is too long" });
      }
      const [existingUsers] = await db.query("SELECT id FROM users WHERE phone = ? AND id != ?", [normalizedPhone, userId]);
      if (existingUsers.length > 0) {
        return res.status(409).json({ error: "Phone number already in use" });
      }
      updates.push("phone = ?");
      values.push(normalizedPhone);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    values.push(userId);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
    const [updatedUsers] = await db.query(
      "SELECT id, telegram_id, phone, first_name, last_name, email, date_of_birth, bonus_balance, loyalty_level, total_spent, created_at, updated_at FROM users WHERE id = ?",
      [userId],
    );
    res.json({ user: updatedUsers[0] });
  } catch (error) {
    next(error);
  }
});
router.get("/addresses", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [addresses] = await db.query(
      `SELECT da.*, c.name as city_name 
       FROM delivery_addresses da
       LEFT JOIN cities c ON da.city_id = c.id
       WHERE da.user_id = ?
       ORDER BY da.is_default DESC, da.created_at DESC`,
      [userId],
    );
    res.json({ addresses });
  } catch (error) {
    next(error);
  }
});
router.post("/addresses", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default } = req.body;
    if (!city_id || !street || !house) {
      return res.status(400).json({
        error: "City, street, and house are required",
      });
    }
    const [cities] = await db.query("SELECT id FROM cities WHERE id = ? AND is_active = TRUE", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found or inactive" });
    }
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
      ],
    );
    const [newAddress] = await db.query(
      `SELECT da.*, c.name as city_name 
       FROM delivery_addresses da
       LEFT JOIN cities c ON da.city_id = c.id
       WHERE da.id = ?`,
      [result.insertId],
    );
    res.status(201).json({ address: newAddress[0] });
  } catch (error) {
    next(error);
  }
});
router.put("/addresses/:id", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    const { city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default } = req.body;
    const [addresses] = await db.query("SELECT id FROM delivery_addresses WHERE id = ? AND user_id = ?", [addressId, userId]);
    if (addresses.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }
    const updates = [];
    const values = [];
    if (city_id !== undefined) {
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
      [addressId],
    );
    res.json({ address: updatedAddress[0] });
  } catch (error) {
    next(error);
  }
});
router.delete("/addresses/:id", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
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
