import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import db from "../../config/database.js";
import redis from "../../config/redis.js";
import {
  JWT_ISSUER,
  JWT_AUDIENCE_CLIENT,
  JWT_AUDIENCE_ADMIN,
  JWT_AUDIENCE_REFRESH_CLIENT,
  JWT_AUDIENCE_REFRESH_ADMIN,
  JWT_ACCESS_AUDIENCES,
  JWT_REFRESH_AUDIENCES,
  extractBearerToken,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  getJwtSecret,
} from "../../config/auth.js";
import { parseTelegramUser, validateTelegramData } from "../../utils/telegram.js";
import { normalizePhone } from "../../utils/phone.js";
import { decryptPhone } from "../../utils/encryption.js";
import { getSystemSettings } from "../../utils/settings.js";
import { grantRegistrationBonus } from "../loyalty/services/loyaltyService.js";
import { addToBlacklist, isBlacklisted } from "../../middleware/tokenBlacklist.js";
import { authenticateToken } from "../../middleware/auth.js";
import { logger } from "../../utils/logger.js";
import { authLimiter, createLimiter, strictAuthLimiter, telegramAuthLimiter } from "../../middleware/rateLimiter.js";

const router = express.Router();
const CLIENT_ACCESS_TOKEN_TTL = "15m";
const CLIENT_ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000;
const ADMIN_ACCESS_TOKEN_TTL = "15m";
const ADMIN_ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000;
const CLIENT_REFRESH_TOKEN_TTL = "7d";
const CLIENT_REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const ADMIN_REFRESH_TOKEN_TTL = "7d";
const ADMIN_REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const WS_TICKET_PREFIX = "ws_ticket";
const WS_TICKET_TTL_SECONDS = 45;
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 10 * 60;
const ADMIN_LOGIN_BLOCK_LIMIT = 5;
const ADMIN_LOGIN_BLOCK_WINDOW_SECONDS = 15 * 60;

const getRequiredBotToken = () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  return typeof botToken === "string" && botToken.trim().length > 0 ? botToken.trim() : null;
};

// Helper функция для установки secure cookie
function setAuthCookie(res, token, maxAge = 7 * 24 * 60 * 60 * 1000) {
  res.cookie("access_token", token, getAuthCookieOptions(maxAge));
}
function setRefreshCookie(res, token, maxAge = 30 * 24 * 60 * 60 * 1000) {
  res.cookie("refresh_token", token, getAuthCookieOptions(maxAge));
}
function signAccessToken(payload, audience, expiresIn) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn,
    issuer: JWT_ISSUER,
    audience,
    algorithm: "HS256",
  });
}
function signRefreshToken(payload, audience, expiresIn) {
  return jwt.sign({ ...payload, token_type: "refresh" }, getJwtSecret(), {
    expiresIn,
    issuer: JWT_ISSUER,
    audience,
    algorithm: "HS256",
  });
}
function getTokenTtlSeconds(decodedToken) {
  const now = Math.floor(Date.now() / 1000);
  const seconds = Number(decodedToken?.exp) - now;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
}
const buildAdminLoginAttemptKey = (email, ip) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedIp = String(ip || "unknown").trim();
  return `auth:admin:attempts:${normalizedEmail}:${normalizedIp}`;
};

const getAdminLoginAttempts = async (email, ip) => {
  const key = buildAdminLoginAttemptKey(email, ip);
  const value = await redis.get(key);
  return Number.parseInt(value || "0", 10) || 0;
};

const registerAdminLoginFailure = async (email, ip) => {
  const key = buildAdminLoginAttemptKey(email, ip);
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, ADMIN_LOGIN_BLOCK_WINDOW_SECONDS);
  }
  return attempts;
};

const clearAdminLoginFailures = async (email, ip) => {
  const key = buildAdminLoginAttemptKey(email, ip);
  await redis.del(key);
};

// Применяем rate limiting на все auth endpoints
router.post("/telegram", telegramAuthLimiter, async (req, res, next) => {
  try {
    const { initData } = req.body || {};
    if (!initData || typeof initData !== "string") {
      return res.status(400).json({ error: "Telegram initData is required" });
    }
    const params = new URLSearchParams(initData);
    const parsedUser = parseTelegramUser(initData);
    if (!parsedUser) {
      return res.status(400).json({ error: "Telegram data is required" });
    }
    const { telegram_id: id, first_name, last_name, username } = parsedUser;
    const auth_date = Number(params.get("auth_date"));
    const hash = params.get("hash");
    if (!id || !hash) {
      return res.status(400).json({ error: "Telegram data is required" });
    }
    const botToken = getRequiredBotToken();
    if (!botToken) {
      return res.status(500).json({ error: "Server misconfiguration: TELEGRAM_BOT_TOKEN is required" });
    }
    const isValid = validateTelegramData(initData, botToken);
    if (!isValid) {
      return res.status(403).json({ error: "Invalid Telegram data" });
    }
    const authAge = Date.now() / 1000 - Number(auth_date);
    if (!Number.isFinite(authAge)) {
      return res.status(400).json({ error: "Telegram data is required" });
    }
    if (authAge > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
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
        try {
          const decryptedPhone = decryptPhone(user.phone);
          const normalizedPhone = normalizePhone(decryptedPhone);
          if (normalizedPhone && normalizedPhone !== user.phone) {
            await db.query("UPDATE users SET phone = ? WHERE id = ?", [normalizedPhone, userId]);
            user.phone = normalizedPhone;
          }
        } catch (phoneError) {
          // Если телефон в неизвестном формате, не трогаем его при входе.
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
        // Registration bonus errors are non-critical
      }
    }
    const authPayload = {
      id: userId,
      telegram_id: id,
      type: "client",
    };
    const accessToken = signAccessToken(authPayload, JWT_AUDIENCE_CLIENT, CLIENT_ACCESS_TOKEN_TTL);
    const refreshToken = signRefreshToken(authPayload, JWT_AUDIENCE_REFRESH_CLIENT, CLIENT_REFRESH_TOKEN_TTL);

    // Устанавливаем cookie с токеном
    setAuthCookie(res, accessToken, CLIENT_ACCESS_TOKEN_COOKIE_MAX_AGE);
    setRefreshCookie(res, refreshToken, CLIENT_REFRESH_TOKEN_COOKIE_MAX_AGE);

    // Логируем успешный вход
    await logger.auth.login(userId, "client", req.ip);

    res.json({ user });
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
    const botToken = getRequiredBotToken();
    if (!botToken) {
      return res.status(500).json({ error: "Server misconfiguration: TELEGRAM_BOT_TOKEN is required" });
    }
    const isValid = validateTelegramData(initData, botToken);
    if (!isValid) {
      return res.json({ enabled: false });
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
router.post("/admin/login", authLimiter, strictAuthLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (email) {
      const attempts = await getAdminLoginAttempts(email, req.ip);
      if (attempts >= ADMIN_LOGIN_BLOCK_LIMIT) {
        await logger.auth.loginFailed(email, "Too many failed attempts", req.ip);
        return res.status(429).json({ error: "Слишком много неудачных попыток. Попробуйте позже" });
      }
    }
    if (!email || !password) {
      await logger.auth.loginFailed(email || "unknown", "Missing credentials", req.ip);
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [users] = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active, branch_id, telegram_id, eruda_enabled
       FROM admin_users WHERE email = ?`,
      [email],
    );

    if (users.length === 0) {
      await registerAdminLoginFailure(email, req.ip);
      await logger.auth.loginFailed(email, "User not found", req.ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    if (!user.is_active) {
      await registerAdminLoginFailure(email, req.ip);
      await logger.auth.loginFailed(email, "Account disabled", req.ip);
      return res.status(403).json({ error: "Account is disabled" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      await registerAdminLoginFailure(email, req.ip);
      await logger.auth.loginFailed(email, "Invalid password", req.ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    await clearAdminLoginFailures(email, req.ip);

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

    const authPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      cities: cities,
      type: "admin",
      branch_ids: branches.map((branch) => branch.id),
      branch_city_ids: branches.map((branch) => branch.city_id),
    };
    const accessToken = signAccessToken(authPayload, JWT_AUDIENCE_ADMIN, ADMIN_ACCESS_TOKEN_TTL);
    const refreshToken = signRefreshToken(authPayload, JWT_AUDIENCE_REFRESH_ADMIN, ADMIN_REFRESH_TOKEN_TTL);

    // Устанавливаем cookie с токеном
    setAuthCookie(res, accessToken, ADMIN_ACCESS_TOKEN_COOKIE_MAX_AGE);
    setRefreshCookie(res, refreshToken, ADMIN_REFRESH_TOKEN_COOKIE_MAX_AGE);

    // Логируем успешный вход
    await logger.auth.login(user.id, user.role, req.ip);

    delete user.password_hash;

    res.json({
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

router.post("/ws-ticket", authenticateToken, createLimiter, async (req, res, next) => {
  try {
    if (req.user?.type === "client") {
      const [users] = await db.query("SELECT id FROM users WHERE id = ? LIMIT 1", [req.user.id]);
      if (users.length === 0) {
        return res.status(401).json({ error: "User account not found" });
      }
    }
    if (req.user?.type === "admin") {
      const [admins] = await db.query("SELECT id, is_active FROM admin_users WHERE id = ? LIMIT 1", [req.user.id]);
      if (admins.length === 0 || !admins[0].is_active) {
        return res.status(401).json({ error: "Admin account not found or inactive" });
      }
    }
    const ticket = crypto.randomBytes(32).toString("hex");
    const redisKey = `${WS_TICKET_PREFIX}:${ticket}`;
    const payload = JSON.stringify({
      id: req.user.id,
      role: req.user.role || null,
      cities: req.user.cities || [],
      city_ids: req.user.city_ids || [],
      type: req.user.type || "client",
      issued_at: Date.now(),
    });
    await redis.set(redisKey, payload, "EX", WS_TICKET_TTL_SECONDS);
    res.json({
      ticket,
      expires_in: WS_TICKET_TTL_SECONDS,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", authLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }
    if (await isBlacklisted(refreshToken)) {
      return res.status(401).json({ error: "Refresh token has been revoked" });
    }
    const decoded = jwt.verify(refreshToken, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_REFRESH_AUDIENCES,
    });

    let nextAccessToken;
    let nextRefreshToken;
    let accessMaxAge;
    let refreshMaxAge;

    if (decoded?.type === "client") {
      const [users] = await db.query(
        `SELECT id, telegram_id
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [decoded.id],
      );
      if (users.length === 0) {
        return res.status(401).json({ error: "User account not found" });
      }
      const user = users[0];
      const payload = {
        id: user.id,
        telegram_id: user.telegram_id || decoded.telegram_id,
        type: "client",
      };
      nextAccessToken = signAccessToken(payload, JWT_AUDIENCE_CLIENT, CLIENT_ACCESS_TOKEN_TTL);
      nextRefreshToken = signRefreshToken(payload, JWT_AUDIENCE_REFRESH_CLIENT, CLIENT_REFRESH_TOKEN_TTL);
      accessMaxAge = CLIENT_ACCESS_TOKEN_COOKIE_MAX_AGE;
      refreshMaxAge = CLIENT_REFRESH_TOKEN_COOKIE_MAX_AGE;
    } else if (decoded?.type === "admin") {
      const [admins] = await db.query(
        `SELECT id, email, role, is_active
         FROM admin_users
         WHERE id = ?
         LIMIT 1`,
        [decoded.id],
      );
      if (admins.length === 0 || !admins[0].is_active) {
        return res.status(401).json({ error: "Admin account not found or inactive" });
      }
      const admin = admins[0];
      let cities = [];
      if (admin.role === "manager") {
        const [userCities] = await db.query(`SELECT city_id FROM admin_user_cities WHERE admin_user_id = ?`, [admin.id]);
        cities = userCities.map((c) => c.city_id);
      }
      let branches = [];
      if (admin.role === "manager") {
        const [userBranches] = await db.query(
          `SELECT b.id, b.city_id
           FROM admin_user_branches aub
           JOIN branches b ON aub.branch_id = b.id
           WHERE aub.admin_user_id = ?`,
          [admin.id],
        );
        branches = userBranches || [];
      }
      const payload = {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        cities,
        type: "admin",
        branch_ids: branches.map((branch) => branch.id),
        branch_city_ids: branches.map((branch) => branch.city_id),
      };
      nextAccessToken = signAccessToken(payload, JWT_AUDIENCE_ADMIN, ADMIN_ACCESS_TOKEN_TTL);
      nextRefreshToken = signRefreshToken(payload, JWT_AUDIENCE_REFRESH_ADMIN, ADMIN_REFRESH_TOKEN_TTL);
      accessMaxAge = ADMIN_ACCESS_TOKEN_COOKIE_MAX_AGE;
      refreshMaxAge = ADMIN_REFRESH_TOKEN_COOKIE_MAX_AGE;
    } else {
      return res.status(403).json({ error: "Invalid refresh token payload" });
    }

    await addToBlacklist(refreshToken, getTokenTtlSeconds(decoded));
    setAuthCookie(res, nextAccessToken, accessMaxAge);
    setRefreshCookie(res, nextRefreshToken, refreshMaxAge);
    res.json({ ok: true });
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

router.get("/session", authenticateToken, async (req, res, next) => {
  try {
    if (req.user?.type !== "admin") {
      return res.status(403).json({ error: "Invalid session type" });
    }
    const [admins] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, branch_id, telegram_id, eruda_enabled
       FROM admin_users
       WHERE id = ?
       LIMIT 1`,
      [req.user.id],
    );
    if (admins.length === 0 || !admins[0].is_active) {
      return res.status(401).json({ error: "Admin account not found or inactive" });
    }
    const admin = admins[0];
    let cities = [];
    let branches = [];
    if (admin.role === "manager") {
      const [userCities] = await db.query(`SELECT city_id FROM admin_user_cities WHERE admin_user_id = ?`, [admin.id]);
      cities = userCities.map((city) => city.city_id);
      const [userBranches] = await db.query(
        `SELECT b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id = ?`,
        [admin.id],
      );
      branches = userBranches || [];
    }
    res.json({
      user: {
        ...admin,
        cities,
        branch_ids: branches.map((branch) => branch.id),
        branch_city_ids: branches.map((branch) => branch.city_id),
        branches,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint для выхода из системы
router.post("/logout", async (req, res, next) => {
  try {
    // Получаем токен
    const token = req.cookies?.access_token || extractBearerToken(req.headers["authorization"]);
    const refreshToken = req.cookies?.refresh_token;

    if (token) {
      try {
        // Добавляем токен в blacklist только если он корректный
        const decoded = jwt.verify(token, getJwtSecret(), {
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_ACCESS_AUDIENCES,
        });
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        await addToBlacklist(token, expiresIn > 0 ? expiresIn : 1);
      } catch (tokenError) {
        // Для logout не критично: даже при невалидном токене нужно очистить cookie.
      }
    }
    if (refreshToken) {
      try {
        const decodedRefresh = jwt.verify(refreshToken, getJwtSecret(), {
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_REFRESH_AUDIENCES,
        });
        await addToBlacklist(refreshToken, getTokenTtlSeconds(decodedRefresh));
      } catch (refreshTokenError) {
        // Для logout не критично: даже при невалидном refresh токене нужно очистить cookie.
      }
    }

    // Удаляем cookie
    const clearOptions = getClearAuthCookieOptions();
    res.clearCookie("access_token", clearOptions);
    res.clearCookie("refresh_token", clearOptions);

    res.json({ message: "Logout successful" });
  } catch (error) {
    next(error);
  }
});

export default router;
