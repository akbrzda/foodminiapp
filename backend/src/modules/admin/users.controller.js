import express from "express";
import bcrypt from "bcrypt";
import db from "../../config/database.js";
import redis from "../../config/redis.js";
import { requireRole } from "../../middleware/auth.js";
import { logger } from "../../utils/logger.js";

const usersRouter = express.Router();

const ADMIN_LOGIN_ATTEMPTS_PREFIX = "auth:admin:attempts";
const AUTH_SHIELD_STRIKES_PREFIX = "auth_shield:strikes";
const AUTH_SHIELD_BAN_PREFIX = "auth_shield:ban";

const getRequestIp = (req) => req?.ip || req?.connection?.remoteAddress || null;
const getRequestUserAgent = (req) => req?.get?.("user-agent") || null;

const scanKeys = async (pattern) => {
  const keys = [];
  let cursor = "0";
  do {
    const [nextCursor, chunk] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (Array.isArray(chunk) && chunk.length > 0) {
      keys.push(...chunk);
    }
  } while (cursor !== "0");
  return keys;
};

const parseAttemptKeyIp = (key, email) => {
  const suffix = `${email}:`;
  const index = key.indexOf(suffix);
  if (index === -1) return null;
  return key.slice(index + suffix.length) || null;
};

const logSecurityResetAction = async ({ actorId, targetUserId, resetType, description, req }) => {
  try {
    await db.query(
      `INSERT INTO admin_action_logs (admin_user_id, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actorId,
        "auth_limits_reset",
        "admin_user",
        targetUserId,
        `${description} (тип: ${resetType})`,
        getRequestIp(req),
        getRequestUserAgent(req),
      ]
    );
  } catch (error) {
    logger.system.warn("Не удалось записать событие сброса лимитов в admin_action_logs", {
      actor_id: actorId,
      target_user_id: targetUserId,
      error: error.message,
    });
  }
};

usersRouter.get("/users/admins", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const [admins] = await db.query(
      `SELECT id, email, first_name, last_name, role
       FROM admin_users
       WHERE is_active = true
       ORDER BY first_name, last_name`
    );
    res.json({ admins });
  } catch (error) {
    logger.error("Ошибка получения списка администраторов", { error });
    next(error);
  }
});

usersRouter.get("/users", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { role, is_active } = req.query;
    let query = `
      SELECT au.id, au.email, au.first_name, au.last_name, au.role,
             au.is_active, au.branch_id, au.created_at, au.updated_at
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
          [user.id]
        );
        user.cities = cities;
        const [branches] = await db.query(
          `SELECT b.id, b.name, b.city_id
           FROM admin_user_branches aub
           JOIN branches b ON aub.branch_id = b.id
           WHERE aub.admin_user_id = ?`,
          [user.id]
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

usersRouter.get("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [users] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active,
              branch_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [userId]
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
        [userId]
      );
      user.cities = cities;
      const [branches] = await db.query(
        `SELECT b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id = ?`,
        [userId]
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

usersRouter.get("/users/:id/security", requireRole("admin"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const [users] = await db.query("SELECT id, email FROM admin_users WHERE id = ? LIMIT 1", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = users[0];

    const attemptKeys = await scanKeys(`${ADMIN_LOGIN_ATTEMPTS_PREFIX}:${user.email}:*`);
    const attemptsByIp = [];
    for (const key of attemptKeys) {
      const ip = parseAttemptKeyIp(key, user.email);
      if (!ip) continue;
      const [attemptsValue, attemptsTtl, strikesValue, strikesTtl, banTtl] = await Promise.all([
        redis.get(key),
        redis.ttl(key),
        redis.get(`${AUTH_SHIELD_STRIKES_PREFIX}:${ip}`),
        redis.ttl(`${AUTH_SHIELD_STRIKES_PREFIX}:${ip}`),
        redis.ttl(`${AUTH_SHIELD_BAN_PREFIX}:${ip}`),
      ]);
      attemptsByIp.push({
        ip,
        login_attempts: Number(attemptsValue || 0),
        login_attempts_ttl_seconds: attemptsTtl > 0 ? attemptsTtl : 0,
        shield_strikes: Number(strikesValue || 0),
        shield_strikes_ttl_seconds: strikesTtl > 0 ? strikesTtl : 0,
        is_banned: banTtl > 0,
        ban_ttl_seconds: banTtl > 0 ? banTtl : 0,
      });
    }

    const [authLogs] = await db.query(
      `SELECT id, action, description, ip_address, created_at
       FROM admin_action_logs
       WHERE admin_user_id = ?
         AND entity_type = 'auth'
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    );

    res.json({
      user: { id: user.id, email: user.email },
      limits: {
        attempts_by_ip: attemptsByIp.sort((a, b) => b.login_attempts - a.login_attempts),
      },
      auth_logs: authLogs || [],
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/users/:id/security/reset", requireRole("admin"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const ip = typeof req.body?.ip === "string" ? req.body.ip.trim() : "";
    const resetType = ["attempts", "ban", "all"].includes(req.body?.type) ? req.body.type : "all";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const [users] = await db.query("SELECT id, email FROM admin_users WHERE id = ? LIMIT 1", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = users[0];

    let deletedAttempts = 0;
    let deletedStrikes = 0;
    let deletedBans = 0;
    const touchedIps = new Set();

    if (ip) {
      touchedIps.add(ip);
      if (resetType === "attempts" || resetType === "all") {
        const attemptsKey = `${ADMIN_LOGIN_ATTEMPTS_PREFIX}:${user.email}:${ip}`;
        deletedAttempts += await redis.del(attemptsKey);
        deletedStrikes += await redis.del(`${AUTH_SHIELD_STRIKES_PREFIX}:${ip}`);
      }
      if (resetType === "ban" || resetType === "all") {
        deletedBans += await redis.del(`${AUTH_SHIELD_BAN_PREFIX}:${ip}`);
      }
    } else {
      const attemptKeys = await scanKeys(`${ADMIN_LOGIN_ATTEMPTS_PREFIX}:${user.email}:*`);
      for (const key of attemptKeys) {
        const keyIp = parseAttemptKeyIp(key, user.email);
        if (keyIp) touchedIps.add(keyIp);
      }
      if (attemptKeys.length > 0 && (resetType === "attempts" || resetType === "all")) {
        deletedAttempts += await redis.del(...attemptKeys);
      }
      for (const keyIp of touchedIps) {
        if (resetType === "attempts" || resetType === "all") {
          deletedStrikes += await redis.del(`${AUTH_SHIELD_STRIKES_PREFIX}:${keyIp}`);
        }
        if (resetType === "ban" || resetType === "all") {
          deletedBans += await redis.del(`${AUTH_SHIELD_BAN_PREFIX}:${keyIp}`);
        }
      }
    }

    await logSecurityResetAction({
      actorId: req.user.id,
      targetUserId: user.id,
      resetType,
      description: ip
        ? `Сброс auth-лимитов для пользователя ${user.email} по IP ${ip}`
        : `Сброс auth-лимитов для пользователя ${user.email} по всем IP`,
      req,
    });

    res.json({
      message: "Лимиты авторизации успешно сброшены",
      result: {
        deleted_login_attempt_keys: deletedAttempts,
        deleted_shield_strike_keys: deletedStrikes,
        deleted_shield_ban_keys: deletedBans,
        affected_ips: Array.from(touchedIps),
      },
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/users", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, role, cities, branch_ids } = req.body;

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

    if (req.user.role === "ceo" && role === "admin") {
      return res.status(403).json({ error: "CEO не может создавать администраторов" });
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

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.query(
      `INSERT INTO admin_users (email, password_hash, first_name, last_name, role, branch_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, first_name, last_name, role, null]
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
              branch_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [newUserId]
    );

    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});

usersRouter.put("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { email, password, first_name, last_name, role, is_active, cities, branch_ids } = req.body;
    const [existingUsers] = await db.query("SELECT id, role, branch_id FROM admin_users WHERE id = ?", [userId]);

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    if (req.user.role === "ceo" && existingUsers[0].role === "admin") {
      return res.status(403).json({ error: "CEO не может изменять администраторов" });
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
      const passwordHash = await bcrypt.hash(password, 12);
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
      if (req.user.role === "ceo" && role === "admin") {
        return res.status(403).json({ error: "CEO не может назначать роль администратора" });
      }
      updates.push("role = ?");
      values.push(role);
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
              branch_id, created_at, updated_at
       FROM admin_users WHERE id = ?`,
      [userId]
    );

    const user = updatedUser[0];
    if (user.role === "manager") {
      const [userCities] = await db.query(
        `SELECT c.id, c.name
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id = ?`,
        [userId]
      );
      user.cities = userCities;

      const [branches] = await db.query(
        `SELECT b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id = ?`,
        [userId]
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

usersRouter.delete("/users/:id", requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [users] = await db.query("SELECT id, role FROM admin_users WHERE id = ?", [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    if (req.user.role === "ceo" && users[0].role === "admin") {
      return res.status(403).json({ error: "CEO не может удалять администраторов" });
    }

    if (req.user.id === parseInt(userId, 10)) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    await db.query("DELETE FROM admin_users WHERE id = ?", [userId]);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default usersRouter;
