import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import db from "../../config/database.js";
import { parseTelegramUser, validateTelegramData } from "../../utils/telegram.js";
import { normalizePhone } from "../../utils/phone.js";
import { getSystemSettings } from "../../utils/settings.js";
import { grantRegistrationBonus } from "../loyalty/services/loyaltyService.js";
const router = express.Router();
function verifyTelegramAuth(data, botToken) {
  const { hash, ...userData } = data;
  const dataCheckString = Object.keys(userData)
    .sort()
    .map((key) => `${key}=${userData[key]}`)
    .join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return hmac === hash;
}
router.post("/telegram", async (req, res, next) => {
  try {
    const { initData } = req.body;
    let telegramPayload = req.body;
    if (initData) {
      const params = new URLSearchParams(initData);
      const parsedUser = parseTelegramUser(initData);
      if (!parsedUser) {
        return res.status(400).json({ error: "Telegram data is required" });
      }
      telegramPayload = {
        id: parsedUser.telegram_id,
        first_name: parsedUser.first_name,
        last_name: parsedUser.last_name,
        username: parsedUser.username,
        auth_date: Number(params.get("auth_date")),
        hash: params.get("hash"),
      };
    }
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = telegramPayload;
    if (!id || !hash) {
      return res.status(400).json({ error: "Telegram data is required" });
    }
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const isValid = initData ? validateTelegramData(initData, botToken) : verifyTelegramAuth(telegramPayload, botToken);
      if (!isValid) {
        return res.status(403).json({ error: "Invalid Telegram data" });
      }
    }
    const authAge = Date.now() / 1000 - Number(auth_date);
    if (!Number.isFinite(authAge)) {
      return res.status(400).json({ error: "Telegram data is required" });
    }
    if (authAge > 86400) {
      return res.status(403).json({ error: "Auth data is too old" });
    }
    const [users] = await db.query(
      `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
              u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at
       FROM users u
       WHERE u.telegram_id = ?`,
      [id],
    );
    let userId;
    let user;
    let isNewUser = false;
    if (users.length > 0) {
      userId = users[0].id;
      user = users[0];
      const updates = [];
      const values = [];
      if (first_name && users[0].first_name !== first_name) {
        updates.push("first_name = ?");
        values.push(first_name);
      }
      if (last_name && users[0].last_name !== last_name) {
        updates.push("last_name = ?");
        values.push(last_name);
      }
      if (updates.length > 0) {
        values.push(userId);
        await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
        const [updatedUsers] = await db.query(
          `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
                  u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at
           FROM users u
           WHERE u.id = ?`,
          [userId],
        );
        user = updatedUsers[0];
      }
      if (user.phone) {
        const normalizedPhone = normalizePhone(user.phone);
        if (normalizedPhone && normalizedPhone !== user.phone) {
          await db.query("UPDATE users SET phone = ? WHERE id = ?", [normalizedPhone, userId]);
          user.phone = normalizedPhone;
        }
      }
    } else {
      isNewUser = true;
      const [result] = await db.query("INSERT INTO users (telegram_id, phone, first_name, last_name) VALUES (?, ?, ?, ?)", [
        id,
        null,
        first_name || null,
        last_name || null,
      ]);
      userId = result.insertId;
      await db.query("UPDATE users SET current_loyalty_level_id = 1, loyalty_joined_at = NOW() WHERE id = ?", [userId]);
      const [newUser] = await db.query(
        `SELECT u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
                u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at
         FROM users u
         WHERE u.id = ?`,
        [userId],
      );
      user = newUser[0];
    }
    if (isNewUser) {
      try {
        const systemSettings = await getSystemSettings();
        if (systemSettings.bonuses_enabled) {
          await grantRegistrationBonus(userId, null);
        }
      } catch (bonusError) {
        console.error("Failed to grant registration bonus:", bonusError);
      }
    }
    const token = jwt.sign(
      {
        id: userId,
        telegram_id: id,
        type: "client",
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});
router.post("/eruda", async (req, res, next) => {
  try {
    const { initData } = req.body || {};
    if (!initData) {
      return res.json({ enabled: false });
    }
    const parsedUser = parseTelegramUser(initData);
    if (!parsedUser?.telegram_id) {
      return res.json({ enabled: false });
    }
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const isValid = validateTelegramData(initData, botToken);
      if (!isValid) {
        return res.json({ enabled: false });
      }
    }
    const [admins] = await db.query(
      `SELECT id, eruda_enabled, is_active
       FROM admin_users
       WHERE telegram_id = ?
       LIMIT 1`,
      [parsedUser.telegram_id],
    );
    if (admins.length === 0) {
      return res.json({ enabled: false });
    }
    const admin = admins[0];
    res.json({ enabled: Boolean(admin.is_active) && Boolean(admin.eruda_enabled) });
  } catch (error) {
    next(error);
  }
});
router.post("/admin/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const [users] = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active, branch_id, telegram_id, eruda_enabled
       FROM admin_users WHERE email = ?`,
      [email],
    );
    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const user = users[0];
    if (!user.is_active) {
      return res.status(403).json({ error: "Account is disabled" });
    }
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    let cities = [];
    if (user.role === "manager") {
      const [userCities] = await db.query(`SELECT city_id FROM admin_user_cities WHERE admin_user_id = ?`, [user.id]);
      cities = userCities.map((c) => c.city_id);
    }
    let branches = [];
    if (user.role === "manager") {
      const [userBranches] = await db.query(
        `SELECT b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id = ?`,
        [user.id],
      );
      branches = userBranches || [];
    }
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        cities: cities,
        type: "admin",
        branch_ids: branches.map((branch) => branch.id),
        branch_city_ids: branches.map((branch) => branch.city_id),
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    delete user.password_hash;
    res.json({
      token,
      user: {
        ...user,
        cities: cities,
        branch_ids: branches.map((branch) => branch.id),
        branch_city_ids: branches.map((branch) => branch.city_id),
        branches: branches,
      },
    });
  } catch (error) {
    next(error);
  }
});
export default router;
