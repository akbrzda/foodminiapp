import express from "express";
import db from "../../config/database.js";
import { extractBearerToken } from "../../config/auth.js";
import { authenticateToken } from "../../middleware/auth.js";
import { normalizePhone } from "../../utils/phone.js";
import { getSystemSettings } from "../../utils/settings.js";
import { grantRegistrationBonus } from "../loyalty/services/loyaltyService.js";
import { addToBlacklist } from "../../middleware/tokenBlacklist.js";
import { clearAuthCookies, getAccessTokenCandidates } from "../auth/auth.cookies.js";
import { logger } from "../../utils/logger.js";
import { processPremiumBonusClientSync } from "../integrations/services/syncProcessors.js";
import {
  encryptEmail,
  encryptAddress,
  decryptUserData,
  decryptAddressData,
} from "../../utils/encryption.js";
import { validateEmail, validatePhone, validateName, validateBirthdate, validateAddress } from "../../utils/validation.js";
const router = express.Router();
router.post("/register", async (req, res, next) => {
  try {
    const { phone, first_name, last_name } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Валидация телефона
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const normalizedPhone = normalizePhone(phoneValidation.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Invalid phone format" });
    }

    const systemSettings = await getSystemSettings();
    const pbAutoSyncEnabled = systemSettings.premiumbonus_enabled && systemSettings.premiumbonus_auto_sync_enabled !== false;
    const pbSyncStatus = pbAutoSyncEnabled ? "pending" : "synced";
    const loyaltyMode = systemSettings.premiumbonus_enabled ? "premiumbonus" : "local";

    const [existingUsers] = await db.query("SELECT * FROM users WHERE phone = ?", [normalizedPhone]);

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      const updates = [];
      const values = [];
      if (first_name && user.first_name !== first_name) {
        updates.push("first_name = ?");
        values.push(first_name);
      }
      if (last_name && user.last_name !== last_name) {
        updates.push("last_name = ?");
        values.push(last_name);
      }
      if (user.registration_type !== "miniapp") {
        updates.push("registration_type = 'miniapp'");
      }
      if (systemSettings.premiumbonus_enabled) {
        updates.push(`pb_sync_status = '${pbAutoSyncEnabled ? "pending" : "synced"}'`);
        updates.push(`loyalty_mode = '${loyaltyMode}'`);
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
      if (pbAutoSyncEnabled) {
        try {
          await processPremiumBonusClientSync(user.id, "register-existing");
        } catch (pbError) {
          logger.warn("Не удалось синхронизировать существующего клиента с PremiumBonus", {
            userId: user.id,
            error: pbError?.message || String(pbError),
          });
        }
      }
      return res.json({ user: decryptedUser });
    }

    const [result] = await db.query(
      "INSERT INTO users (phone, telegram_id, registration_type, bot_registered_at, first_name, last_name, loyalty_mode, pb_sync_status) VALUES (?, ?, 'miniapp', NULL, ?, ?, ?, ?)",
      [normalizedPhone, null, first_name || null, last_name || null, loyaltyMode, pbSyncStatus],
    );

    await db.query("UPDATE users SET current_loyalty_level_id = 1, loyalty_joined_at = NOW() WHERE id = ?", [result.insertId]);

    const [newUser] = await db.query(
      `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = ?`,
      [result.insertId],
    );

    try {
      if (systemSettings.bonuses_enabled && !systemSettings.premiumbonus_enabled) {
        await grantRegistrationBonus(result.insertId, null);
      }
      if (pbAutoSyncEnabled) {
        try {
          await processPremiumBonusClientSync(result.insertId, "register-new");
        } catch (pbError) {
          logger.warn("Не удалось синхронизировать нового клиента с PremiumBonus", {
            userId: result.insertId,
            error: pbError?.message || String(pbError),
          });
        }
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
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at, u.pb_client_id
       FROM users u
       WHERE u.id = ?`,
      [userId],
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const systemSettings = await getSystemSettings();
    const pbAutoSyncEnabled = systemSettings.premiumbonus_enabled && systemSettings.premiumbonus_auto_sync_enabled !== false;
    if (pbAutoSyncEnabled && users[0].pb_client_id) {
      try {
        await processPremiumBonusClientSync(userId, "profile-get");
      } catch (pbError) {
        logger.warn("Не удалось синхронизировать клиента с PremiumBonus при открытии профиля", {
          userId,
          error: pbError?.message || String(pbError),
        });
      }
    }

    const [freshUsers] = await db.query(
      `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = ?`,
      [userId],
    );
    if (freshUsers.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Дешифрование перед отправкой клиенту
    const decryptedUser = decryptUserData(freshUsers[0]);
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
    const [currentUsers] = await db.query("SELECT id, phone, pb_client_id FROM users WHERE id = ? LIMIT 1", [userId]);
    if (currentUsers.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const currentUser = currentUsers[0];
    const hadPhoneBeforeUpdate = Boolean(String(currentUser.phone || "").trim());

    const updates = [];
    const values = [];
    let shouldGrantRegistrationBonus = false;
    let isPhoneChanged = false;

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

      const normalizedPhone = normalizePhone(phoneValidation.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: "Invalid phone format" });
      }

      const [existingUsers] = await db.query("SELECT id FROM users WHERE phone = ? AND id != ?", [normalizedPhone, userId]);

      if (existingUsers.length > 0) {
        return res.status(409).json({ error: "Phone number already in use" });
      }

      updates.push("phone = ?");
      values.push(normalizedPhone);
      shouldGrantRegistrationBonus = !hadPhoneBeforeUpdate;
      isPhoneChanged = normalizedPhone !== String(currentUser.phone || "").trim();
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(userId);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    const systemSettings = await getSystemSettings();
    if (shouldGrantRegistrationBonus && systemSettings.bonuses_enabled && !systemSettings.premiumbonus_enabled) {
      try {
        await grantRegistrationBonus(userId, null);
      } catch (bonusError) {
        logger.error("Failed to grant registration bonus after phone confirmation", { userId, error: bonusError });
      }
    }

    if (systemSettings.premiumbonus_enabled) {
      const pbAutoSyncEnabled = systemSettings.premiumbonus_auto_sync_enabled !== false;
      if (isPhoneChanged) {
        // Блокируем автоперепривязку PB при неподтвержденной смене телефона.
        await db.query("UPDATE users SET pb_sync_status = ?, pb_sync_error = ?, loyalty_mode = ? WHERE id = ?", [
          "pending",
          "Требуется подтверждение нового номера телефона перед синхронизацией PremiumBonus",
          "premiumbonus",
          userId,
        ]);
      } else {
        await db.query("UPDATE users SET pb_sync_status = ?, pb_sync_error = ?, loyalty_mode = ? WHERE id = ?", [
          pbAutoSyncEnabled ? "pending" : "synced",
          null,
          "premiumbonus",
          userId,
        ]);
      }
      if (pbAutoSyncEnabled && !isPhoneChanged) {
        try {
          await processPremiumBonusClientSync(userId, "profile-update");
        } catch (pbError) {
          logger.warn("Не удалось синхронизировать профиль клиента с PremiumBonus", {
            userId,
            error: pbError?.message || String(pbError),
          });
        }
      }
    }

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
router.delete("/me", authenticateToken, async (req, res, next) => {
  try {
    if (req.user?.type && req.user.type !== "client") {
      return res.status(403).json({ error: "Only client account can be deleted here" });
    }
    const userId = req.user.id;
    const [users] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const token =
      getAccessTokenCandidates(req)[0] || extractBearerToken(req.headers["authorization"]);
    if (token) {
      await addToBlacklist(token);
    }
    await db.query("DELETE FROM users WHERE id = ?", [userId]);
    clearAuthCookies(res);
    res.json({ message: "Account deleted successfully" });
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
    if (comment) {
      const commentValidation = validateAddress(comment);
      if (!commentValidation.valid) {
        return res.status(400).json({ error: `Comment: ${commentValidation.error}` });
      }
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
      if (street) {
        const streetValidation = validateAddress(street);
        if (!streetValidation.valid) {
          return res.status(400).json({ error: `Street: ${streetValidation.error}` });
        }
        updates.push("street = ?");
        values.push(encryptAddress(streetValidation.address));
      } else {
        return res.status(400).json({ error: "Street cannot be empty" });
      }
    }
    if (house !== undefined) {
      if (house) {
        const houseValidation = validateAddress(house);
        if (!houseValidation.valid) {
          return res.status(400).json({ error: `House: ${houseValidation.error}` });
        }
        updates.push("house = ?");
        values.push(encryptAddress(houseValidation.address));
      } else {
        return res.status(400).json({ error: "House cannot be empty" });
      }
    }
    if (entrance !== undefined) {
      updates.push("entrance = ?");
      values.push(entrance || null);
    }
    if (apartment !== undefined) {
      updates.push("apartment = ?");
      values.push(apartment || null);
    }
    if (intercom !== undefined) {
      updates.push("intercom = ?");
      values.push(intercom || null);
    }
    if (comment !== undefined) {
      if (comment) {
        const commentValidation = validateAddress(comment);
        if (!commentValidation.valid) {
          return res.status(400).json({ error: `Comment: ${commentValidation.error}` });
        }
      }
      updates.push("comment = ?");
      values.push(comment ? encryptAddress(comment) : null);
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
    const decryptedAddress = decryptAddressData(updatedAddress[0]);
    res.json({ address: decryptedAddress });
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
