import express from "express";
import db from "../../config/database.js";
import { authenticateToken } from "../../middleware/auth.js";
import { normalizePhone } from "../../utils/phone.js";
import { getSystemSettings } from "../../utils/settings.js";
import { grantRegistrationBonus } from "../loyalty/services/loyaltyService.js";
import {
  encryptEmail,
  encryptPhone,
  encryptAddress,
  decryptEmail,
  decryptPhone,
  decryptAddress,
  decryptUserData,
  decryptAddressData,
} from "../../utils/encryption.js";
import { validateEmail, validatePhone, validateName, validateBirthdate, validateAddress } from "../../utils/validation.js";
const router = express.Router();
router.post("/register", async (req, res, next) => {
  try {
    const { phone, telegram_id, first_name, last_name } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Валидация телефона
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    // Шифрование телефона для поиска
    const encryptedPhone = encryptPhone(phoneValidation.phone);

    const [existingUsers] = await db.query("SELECT * FROM users WHERE phone = ?", [encryptedPhone]);

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
        `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
                u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at
         FROM users u
         WHERE u.id = ?`,
        [user.id],
      );

      // Дешифрование перед отправкой клиенту
      const decryptedUser = decryptUserData(updatedUsers[0]);
      return res.json({ user: decryptedUser });
    }

    const [result] = await db.query("INSERT INTO users (phone, telegram_id, first_name, last_name) VALUES (?, ?, ?, ?)", [
      encryptedPhone,
      telegram_id || null,
      first_name || null,
      last_name || null,
    ]);

    await db.query("UPDATE users SET current_loyalty_level_id = 1, loyalty_joined_at = NOW() WHERE id = ?", [result.insertId]);

    const [newUser] = await db.query(
      `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = ?`,
      [result.insertId],
    );

    try {
      const systemSettings = await getSystemSettings();
      if (systemSettings.bonuses_enabled) {
        await grantRegistrationBonus(result.insertId, null);
      }
    } catch (bonusError) {
      logger.error("Failed to grant registration bonus", { error: bonusError });
    }

    const decryptedUser = decryptUserData(newUser[0]);
    res.status(201).json({ user: decryptedUser });
  } catch (error) {
    next(error);
  }
});
router.get("/profile", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [users] = await db.query(
      `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = ?`,
      [userId],
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Дешифрование перед отправкой клиенту
    const decryptedUser = decryptUserData(users[0]);
    res.json({ user: decryptedUser });
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
      const nameValidation = validateName(first_name);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
      }
      updates.push("first_name = ?");
      values.push(nameValidation.name);
    }

    if (last_name !== undefined) {
      const nameValidation = validateName(last_name);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
      }
      updates.push("last_name = ?");
      values.push(nameValidation.name);
    }

    if (email !== undefined) {
      if (email) {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          return res.status(400).json({ error: emailValidation.error });
        }
        const encryptedEmail = encryptEmail(emailValidation.email);
        updates.push("email = ?");
        values.push(encryptedEmail);
      } else {
        updates.push("email = ?");
        values.push(null);
      }
    }

    if (date_of_birth !== undefined) {
      const birthdateValidation = validateBirthdate(date_of_birth);
      if (!birthdateValidation.valid) {
        return res.status(400).json({ error: birthdateValidation.error });
      }
      updates.push("date_of_birth = ?");
      values.push(birthdateValidation.birthdate);
    }

    if (phone !== undefined) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({ error: phoneValidation.error });
      }

      const encryptedPhone = encryptPhone(phoneValidation.phone);

      const [existingUsers] = await db.query("SELECT id FROM users WHERE phone = ? AND id != ?", [encryptedPhone, userId]);

      if (existingUsers.length > 0) {
        return res.status(409).json({ error: "Phone number already in use" });
      }

      updates.push("phone = ?");
      values.push(encryptedPhone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(userId);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedUsers] = await db.query(
      `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = ?`,
      [userId],
    );

    const decryptedUser = decryptUserData(updatedUsers[0]);
    res.json({ user: decryptedUser });
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

    // Дешифрование адресов перед отправкой
    const decryptedAddresses = addresses.map((addr) => decryptAddressData(addr));

    res.json({ addresses: decryptedAddresses });
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

    // Валидация адреса
    const streetValidation = validateAddress(street);
    if (!streetValidation.valid) {
      return res.status(400).json({ error: `Street: ${streetValidation.error}` });
    }

    const houseValidation = validateAddress(house);
    if (!houseValidation.valid) {
      return res.status(400).json({ error: `House: ${houseValidation.error}` });
    }

    const [cities] = await db.query("SELECT id FROM cities WHERE id = ? AND is_active = TRUE", [city_id]);
    if (cities.length === 0) {
      return res.status(404).json({ error: "City not found or inactive" });
    }

    if (is_default) {
      await db.query("UPDATE delivery_addresses SET is_default = FALSE WHERE user_id = ?", [userId]);
    }

    // Шифрование адресных данных
    const encryptedStreet = encryptAddress(streetValidation.address);
    const encryptedHouse = encryptAddress(houseValidation.address);
    const encryptedComment = comment ? encryptAddress(comment) : null;

    const [result] = await db.query(
      `INSERT INTO delivery_addresses 
       (user_id, city_id, street, house, entrance, apartment, intercom, comment, latitude, longitude, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        city_id,
        encryptedStreet,
        encryptedHouse,
        entrance || null,
        apartment || null,
        intercom || null,
        encryptedComment,
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

    const decryptedAddress = decryptAddressData(newAddress[0]);
    res.status(201).json({ address: decryptedAddress });
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
