import express from "express";
import bcrypt from "bcrypt";
import db from "../../config/database.js";
import redis from "../../config/redis.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { telegramQueue, imageQueue, getQueueStats, getFailedJobs, retryFailedJobs, cleanQueue } from "../../queues/config.js";
import { getSystemSettings } from "../../utils/settings.js";
import { logger } from "../../utils/logger.js";
import { decryptUserData, encryptEmail, encryptPhone } from "../../utils/encryption.js";
import loyaltyAdapter from "../integrations/adapters/loyaltyAdapter.js";
import { getRoleByCode, getRolePermissions, resolveAdminPermissions, resolveScopeRole, SYSTEM_ROLE_DEFINITIONS } from "../access/index.js";
const router = express.Router();
router.use(authenticateToken);
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
      [actorId, "auth_limits_reset", "admin_user", targetUserId, `${description} (тип: ${resetType})`, getRequestIp(req), getRequestUserAgent(req)],
    );
  } catch (error) {
    logger.system.warn("Не удалось записать событие сброса лимитов в admin_action_logs", {
      actor_id: actorId,
      target_user_id: targetUserId,
      error: error.message,
    });
  }
};
const getManagerCityIds = (req) => {
  if (req.user?.role !== "manager") return null;
  if (!Array.isArray(req.user.cities)) return [];
  return req.user.cities.filter((cityId) => Number.isInteger(cityId));
};

const ACCESS_TABLE_MISSING_CODES = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR"]);
const SYSTEM_SCOPE_ROLES = new Set(["admin", "manager", "ceo"]);

const isAccessSchemaMissingError = (error) => {
  if (!error) return false;
  return ACCESS_TABLE_MISSING_CODES.has(error.code);
};

const incrementUserPermissionVersion = async (executor, userId) => {
  await executor.query(
    `UPDATE admin_users
     SET permission_version = permission_version + 1
     WHERE id = ?`,
    [userId],
  );
};

const incrementRoleUsersPermissionVersion = async (executor, roleCode) => {
  await executor.query(
    `UPDATE admin_users
     SET permission_version = permission_version + 1
     WHERE role = ?`,
    [roleCode],
  );
};

const resolveRoleContext = async (roleCode, { requireActive = false } = {}) => {
  const normalizedCode = String(roleCode || "")
    .trim()
    .toLowerCase();
  if (!normalizedCode) return null;

  const dbRole = await getRoleByCode(db, normalizedCode);
  if (!dbRole) {
    if (SYSTEM_SCOPE_ROLES.has(normalizedCode)) {
      return {
        code: normalizedCode,
        name: normalizedCode.toUpperCase(),
        scope_role: normalizedCode,
        is_system: true,
        is_active: true,
      };
    }
    return null;
  }

  const role = {
    ...dbRole,
    scope_role: resolveScopeRole(dbRole.scope_role, dbRole.code),
  };

  if (requireActive && !role.is_active) {
    return null;
  }

  return role;
};

const isManagerScope = (scopeRole) => resolveScopeRole(scopeRole) === "manager";
router.get("/users/admins", requirePermission("system.admin_users.manage"), async (req, res, next) => {
  try {
    const [admins] = await db.query(
      `SELECT au.id, au.email, au.first_name, au.last_name, au.role,
              COALESCE(ar.name, au.role) AS role_name,
              COALESCE(ar.scope_role, au.role) AS scope_role
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.code = au.role
       WHERE au.is_active = true
       ORDER BY au.first_name, au.last_name`,
    );
    res.json({ admins });
  } catch (error) {
    logger.error("Ошибка получения списка администраторов", { error });
    next(error);
  }
});
router.get("/users", requirePermission("system.admin_users.manage"), async (req, res, next) => {
  try {
    const { role, is_active } = req.query;
    let query = `
      SELECT au.id, au.email, au.first_name, au.last_name, au.role,
             COALESCE(ar.name, au.role) AS role_name,
             COALESCE(ar.scope_role, au.role) AS scope_role,
             au.is_active, au.telegram_id, au.eruda_enabled, au.branch_id, au.created_at, au.updated_at
      FROM admin_users au
      LEFT JOIN admin_roles ar ON ar.code = au.role
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
    const managerIds = users.filter((user) => isManagerScope(user.scope_role)).map((user) => user.id);
    let citiesByManager = new Map();
    let branchesByManager = new Map();

    if (managerIds.length > 0) {
      const [cityRows] = await db.query(
        `SELECT auc.admin_user_id, c.id, c.name
         FROM admin_user_cities auc
         JOIN cities c ON auc.city_id = c.id
         WHERE auc.admin_user_id IN (?)`,
        [managerIds],
      );
      citiesByManager = cityRows.reduce((acc, row) => {
        if (!acc.has(row.admin_user_id)) {
          acc.set(row.admin_user_id, []);
        }
        acc.get(row.admin_user_id).push({ id: row.id, name: row.name });
        return acc;
      }, new Map());

      const [branchRows] = await db.query(
        `SELECT aub.admin_user_id, b.id, b.name, b.city_id
         FROM admin_user_branches aub
         JOIN branches b ON aub.branch_id = b.id
         WHERE aub.admin_user_id IN (?)`,
        [managerIds],
      );
      branchesByManager = branchRows.reduce((acc, row) => {
        if (!acc.has(row.admin_user_id)) {
          acc.set(row.admin_user_id, []);
        }
        acc.get(row.admin_user_id).push({ id: row.id, name: row.name, city_id: row.city_id });
        return acc;
      }, new Map());
    }

    for (let user of users) {
      if (!isManagerScope(user.scope_role)) {
        user.cities = [];
        user.branches = [];
        continue;
      }
      user.cities = citiesByManager.get(user.id) || [];
      user.branches = branchesByManager.get(user.id) || [];
    }
    res.json({ users });
  } catch (error) {
    next(error);
  }
});
router.get("/users/:id", requirePermission("system.admin_users.manage"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [users] = await db.query(
      `SELECT au.id, au.email, au.first_name, au.last_name, au.role,
              COALESCE(ar.name, au.role) AS role_name,
              COALESCE(ar.scope_role, au.role) AS scope_role,
              au.is_active,
              au.telegram_id, au.eruda_enabled, au.branch_id, au.created_at, au.updated_at
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.code = au.role
       WHERE au.id = ?`,
      [userId],
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = users[0];
    if (isManagerScope(user.scope_role)) {
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

router.get("/access/permissions", requirePermission("system.access.manage"), async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT id, code, module, action, description, is_active, created_at, updated_at
       FROM admin_permissions
       ORDER BY module ASC, code ASC`,
    );
    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.get("/access/roles", requirePermission("system.roles.view", "system.access.manage", "system.admin_users.manage"), async (req, res, next) => {
  try {
    const [roles] = await db.query(
      `SELECT r.id, r.code, r.name, r.scope_role, r.is_system, r.is_active, r.created_at, r.updated_at, COUNT(rp.permission_id) AS permissions_count
       FROM admin_roles r
       LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
       GROUP BY r.id, r.code, r.name, r.scope_role, r.is_system, r.is_active, r.created_at, r.updated_at
       ORDER BY r.is_system DESC, r.code ASC`,
    );

    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.post("/access/roles", requirePermission("system.access.manage"), async (req, res, next) => {
  try {
    const code = String(req.body?.code || "")
      .trim()
      .toLowerCase();
    const name = String(req.body?.name || "").trim();
    const scopeRole = resolveScopeRole(req.body?.scope_role, "manager");
    const isActive = req.body?.is_active === undefined ? true : req.body.is_active === true;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        error: "Поля code и name обязательны",
      });
    }
    if (!/^[a-z0-9_]{2,50}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: "code может содержать только a-z, 0-9 и _, длина 2-50",
      });
    }
    if (!SYSTEM_SCOPE_ROLES.has(scopeRole)) {
      return res.status(400).json({
        success: false,
        error: "scope_role должен быть одним из: admin, manager, ceo",
      });
    }
    if (SYSTEM_ROLE_DEFINITIONS.some((role) => role.code === code)) {
      return res.status(400).json({
        success: false,
        error: "Код роли зарезервирован системной ролью",
      });
    }

    const [result] = await db.query(`INSERT INTO admin_roles (code, name, scope_role, is_system, is_active) VALUES (?, ?, ?, 0, ?)`, [
      code,
      name,
      scopeRole,
      isActive,
    ]);
    const [rows] = await db.query(
      `SELECT id, code, name, scope_role, is_system, is_active, created_at, updated_at
       FROM admin_roles
       WHERE id = ?`,
      [result.insertId],
    );

    res.status(201).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        error: "Роль с таким code уже существует",
      });
    }
    next(error);
  }
});

router.put("/access/roles/:id", requirePermission("system.access.manage"), async (req, res, next) => {
  try {
    const roleId = Number(req.params.id);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id роли",
      });
    }

    const [existingRows] = await db.query(`SELECT id, code, scope_role, is_system FROM admin_roles WHERE id = ? LIMIT 1`, [roleId]);
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Роль не найдена",
      });
    }

    const role = existingRows[0];
    const updates = [];
    const values = [];

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        return res.status(400).json({
          success: false,
          error: "name не может быть пустым",
        });
      }
      updates.push("name = ?");
      values.push(name);
    }
    if (req.body?.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(req.body.is_active === true);
    }
    if (req.body?.scope_role !== undefined) {
      const scopeRole = resolveScopeRole(req.body.scope_role, role.scope_role);
      if (!SYSTEM_SCOPE_ROLES.has(scopeRole)) {
        return res.status(400).json({
          success: false,
          error: "scope_role должен быть одним из: admin, manager, ceo",
        });
      }
      if (role.is_system && scopeRole !== role.scope_role) {
        return res.status(400).json({
          success: false,
          error: "Системной роли нельзя изменить scope_role",
        });
      }
      updates.push("scope_role = ?");
      values.push(scopeRole);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Нет полей для обновления",
      });
    }

    if (role.is_system && req.body?.is_active === false) {
      return res.status(400).json({
        success: false,
        error: "Системную роль нельзя деактивировать",
      });
    }

    values.push(roleId);
    await db.query(`UPDATE admin_roles SET ${updates.join(", ")} WHERE id = ?`, values);
    if (req.body?.scope_role !== undefined || req.body?.is_active !== undefined) {
      await incrementRoleUsersPermissionVersion(db, role.code);
    }

    const [rows] = await db.query(
      `SELECT id, code, name, scope_role, is_system, is_active, created_at, updated_at
       FROM admin_roles
       WHERE id = ?`,
      [roleId],
    );

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.delete("/access/roles/:id", requirePermission("system.access.manage"), async (req, res, next) => {
  try {
    const roleId = Number(req.params.id);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id роли",
      });
    }

    const [existingRows] = await db.query(`SELECT id, code, is_system FROM admin_roles WHERE id = ? LIMIT 1`, [roleId]);
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Роль не найдена",
      });
    }

    if (existingRows[0].is_system) {
      return res.status(400).json({
        success: false,
        error: "Системную роль нельзя удалить",
      });
    }

    const [usageRows] = await db.query(`SELECT COUNT(*) AS total FROM admin_users WHERE role = ?`, [existingRows[0].code]);
    if (Number(usageRows[0]?.total || 0) > 0) {
      return res.status(400).json({
        success: false,
        error: "Роль назначена пользователям и не может быть удалена",
      });
    }

    await db.query(`DELETE FROM admin_roles WHERE id = ?`, [roleId]);
    res.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.get("/access/roles/:id/permissions", requirePermission("system.roles.view", "system.access.manage"), async (req, res, next) => {
  try {
    const roleId = Number(req.params.id);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id роли",
      });
    }

    const [roleRows] = await db.query(`SELECT id, code, name, scope_role, is_system, is_active FROM admin_roles WHERE id = ? LIMIT 1`, [roleId]);
    if (roleRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Роль не найдена",
      });
    }

    const [assignedRows] = await db.query(
      `SELECT p.code
       FROM admin_role_permissions rp
       JOIN admin_permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?
       ORDER BY p.code ASC`,
      [roleId],
    );

    res.json({
      success: true,
      data: {
        role: roleRows[0],
        permissions: assignedRows.map((row) => row.code),
      },
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.put("/access/roles/:id/permissions", requirePermission("system.access.manage"), async (req, res, next) => {
  let connection;
  try {
    const roleId = Number(req.params.id);
    const permissionCodes = Array.isArray(req.body?.permission_codes) ? req.body.permission_codes : null;
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id роли",
      });
    }
    if (!permissionCodes) {
      return res.status(400).json({
        success: false,
        error: "permission_codes должен быть массивом",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [roleRows] = await connection.query(`SELECT id, code FROM admin_roles WHERE id = ? LIMIT 1`, [roleId]);
    if (roleRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Роль не найдена",
      });
    }

    let permissionIds = [];
    if (permissionCodes.length > 0) {
      const [permissionRows] = await connection.query(`SELECT id, code FROM admin_permissions WHERE code IN (?)`, [permissionCodes]);
      if (permissionRows.length !== permissionCodes.length) {
        const existing = new Set(permissionRows.map((row) => row.code));
        const missing = permissionCodes.filter((code) => !existing.has(code));
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: `Не найдены permissions: ${missing.join(", ")}`,
        });
      }
      permissionIds = permissionRows.map((row) => row.id);
    }

    await connection.query(`DELETE FROM admin_role_permissions WHERE role_id = ?`, [roleId]);
    if (permissionIds.length > 0) {
      const values = permissionIds.map((permissionId) => [roleId, permissionId]);
      await connection.query(`INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ?`, [values]);
    }
    await incrementRoleUsersPermissionVersion(connection, roleRows[0].code);

    await connection.commit();
    res.json({
      success: true,
      data: {
        role_id: roleId,
        permission_codes: permissionCodes,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get("/access/users/:id/overrides", requirePermission("system.access.manage"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id пользователя",
      });
    }

    const [users] = await db.query(`SELECT id, role, email, first_name, last_name FROM admin_users WHERE id = ? LIMIT 1`, [userId]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Пользователь не найден",
      });
    }

    const user = users[0];
    const [overridesRows] = await db.query(
      `SELECT p.code AS permission_code, uo.effect
       FROM admin_user_permission_overrides uo
       JOIN admin_permissions p ON p.id = uo.permission_id
       WHERE uo.admin_user_id = ?
       ORDER BY p.code ASC`,
      [userId],
    );

    const rolePermissions = await getRolePermissions(db, user.role);
    const resolved = await resolveAdminPermissions(db, { adminUserId: userId, roleCode: user.role });

    res.json({
      success: true,
      data: {
        user,
        role_permissions: rolePermissions,
        overrides: overridesRows,
        effective_permissions: resolved.permissions,
      },
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.put("/access/users/:id/overrides", requirePermission("system.access.manage"), async (req, res, next) => {
  let connection;
  try {
    const userId = Number(req.params.id);
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : null;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id пользователя",
      });
    }
    if (!overrides) {
      return res.status(400).json({
        success: false,
        error: "overrides должен быть массивом",
      });
    }

    const normalizedOverrides = overrides.map((item) => ({
      permission_code: String(item?.permission_code || "").trim(),
      effect: String(item?.effect || "").trim().toLowerCase(),
    }));
    if (normalizedOverrides.some((item) => !item.permission_code || !["allow", "deny"].includes(item.effect))) {
      return res.status(400).json({
        success: false,
        error: "Каждый override должен содержать permission_code и effect (allow|deny)",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [users] = await connection.query(`SELECT id, role FROM admin_users WHERE id = ? LIMIT 1`, [userId]);
    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Пользователь не найден",
      });
    }

    const permissionCodes = [...new Set(normalizedOverrides.map((item) => item.permission_code))];
    const [permissionRows] = permissionCodes.length
      ? await connection.query(`SELECT id, code FROM admin_permissions WHERE code IN (?)`, [permissionCodes])
      : [[], []];

    if (permissionRows.length !== permissionCodes.length) {
      const existing = new Set(permissionRows.map((row) => row.code));
      const missing = permissionCodes.filter((code) => !existing.has(code));
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Не найдены permissions: ${missing.join(", ")}`,
      });
    }

    const permissionIdByCode = new Map(permissionRows.map((row) => [row.code, row.id]));

    await connection.query(`DELETE FROM admin_user_permission_overrides WHERE admin_user_id = ?`, [userId]);

    if (normalizedOverrides.length > 0) {
      const values = normalizedOverrides.map((item) => [userId, permissionIdByCode.get(item.permission_code), item.effect]);
      await connection.query(
        `INSERT INTO admin_user_permission_overrides (admin_user_id, permission_id, effect) VALUES ?`,
        [values],
      );
    }
    await incrementUserPermissionVersion(connection, userId);

    await connection.commit();

    const resolved = await resolveAdminPermissions(db, { adminUserId: userId, roleCode: users[0].role });
    res.json({
      success: true,
      data: {
        admin_user_id: userId,
        overrides: normalizedOverrides,
        effective_permissions: resolved.permissions,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete("/access/users/:id/overrides", requirePermission("system.access.manage"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Некорректный id пользователя",
      });
    }

    const [users] = await db.query(`SELECT id, role FROM admin_users WHERE id = ? LIMIT 1`, [userId]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Пользователь не найден",
      });
    }

    await db.query(`DELETE FROM admin_user_permission_overrides WHERE admin_user_id = ?`, [userId]);
    await incrementUserPermissionVersion(db, userId);
    const resolved = await resolveAdminPermissions(db, { adminUserId: userId, roleCode: users[0].role });

    res.json({
      success: true,
      data: {
        admin_user_id: userId,
        reset_to_role_defaults: true,
        effective_permissions: resolved.permissions,
      },
    });
  } catch (error) {
    if (isAccessSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: "Схема доступов не инициализирована. Примените миграцию 052.",
      });
    }
    next(error);
  }
});

router.get("/users/:id/security", requirePermission("system.auth_limits.manage", "system.admin_users.manage"), async (req, res, next) => {
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
         AND action IN ('auth_login_success', 'auth_logout')
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId],
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
router.post("/users/:id/security/reset", requirePermission("system.auth_limits.manage", "system.admin_users.manage"), async (req, res, next) => {
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
        const strikesKey = `${AUTH_SHIELD_STRIKES_PREFIX}:${ip}`;
        deletedStrikes += await redis.del(strikesKey);
      }
      if (resetType === "ban" || resetType === "all") {
        const banKey = `${AUTH_SHIELD_BAN_PREFIX}:${ip}`;
        deletedBans += await redis.del(banKey);
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
router.get("/clients", requirePermission("clients.view"), async (req, res, next) => {
  try {
    const {
      search,
      city_id,
      orders_count_from,
      orders_count_to,
      birthday_from,
      birthday_to,
      registration_from,
      registration_to,
      total_orders_sum_from,
      total_orders_sum_to,
      avg_check_from,
      avg_check_to,
      loyalty_balance_from,
      loyalty_balance_to,
      last_order_days_from,
      last_order_days_to,
      limit = 50,
      offset = 0,
    } = req.query;

    const toNumberOrNull = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : null;
    };

    let whereClause = "WHERE 1=1";
    const params = [];

    if (search) {
      whereClause += " AND (u.phone LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.json({ clients: [] });
      }
      whereClause += " AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.city_id IN (?))";
      params.push(cityIds);
    } else if (city_id) {
      whereClause += " AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.city_id = ?)";
      params.push(city_id);
    }

    const ordersCountFrom = toNumberOrNull(orders_count_from);
    if (ordersCountFrom !== null) {
      whereClause += " AND COALESCE(oa.orders_count, 0) >= ?";
      params.push(ordersCountFrom);
    }
    const ordersCountTo = toNumberOrNull(orders_count_to);
    if (ordersCountTo !== null) {
      whereClause += " AND COALESCE(oa.orders_count, 0) <= ?";
      params.push(ordersCountTo);
    }

    if (birthday_from) {
      whereClause += " AND u.date_of_birth >= ?";
      params.push(birthday_from);
    }
    if (birthday_to) {
      whereClause += " AND u.date_of_birth <= ?";
      params.push(birthday_to);
    }

    if (registration_from) {
      whereClause += " AND DATE(u.created_at) >= ?";
      params.push(registration_from);
    }
    if (registration_to) {
      whereClause += " AND DATE(u.created_at) <= ?";
      params.push(registration_to);
    }

    const totalSumFrom = toNumberOrNull(total_orders_sum_from);
    if (totalSumFrom !== null) {
      whereClause += " AND COALESCE(oa.total_orders_sum, 0) >= ?";
      params.push(totalSumFrom);
    }
    const totalSumTo = toNumberOrNull(total_orders_sum_to);
    if (totalSumTo !== null) {
      whereClause += " AND COALESCE(oa.total_orders_sum, 0) <= ?";
      params.push(totalSumTo);
    }

    const avgCheckFrom = toNumberOrNull(avg_check_from);
    if (avgCheckFrom !== null) {
      whereClause += " AND COALESCE(oa.avg_check, 0) >= ?";
      params.push(avgCheckFrom);
    }
    const avgCheckTo = toNumberOrNull(avg_check_to);
    if (avgCheckTo !== null) {
      whereClause += " AND COALESCE(oa.avg_check, 0) <= ?";
      params.push(avgCheckTo);
    }

    const loyaltyFrom = toNumberOrNull(loyalty_balance_from);
    if (loyaltyFrom !== null) {
      whereClause += " AND COALESCE(u.loyalty_balance, 0) >= ?";
      params.push(loyaltyFrom);
    }
    const loyaltyTo = toNumberOrNull(loyalty_balance_to);
    if (loyaltyTo !== null) {
      whereClause += " AND COALESCE(u.loyalty_balance, 0) <= ?";
      params.push(loyaltyTo);
    }

    const lastOrderDaysFrom = toNumberOrNull(last_order_days_from);
    if (lastOrderDaysFrom !== null) {
      whereClause += " AND oa.last_order_at IS NOT NULL AND TIMESTAMPDIFF(DAY, DATE(oa.last_order_at), CURDATE()) >= ?";
      params.push(lastOrderDaysFrom);
    }
    const lastOrderDaysTo = toNumberOrNull(last_order_days_to);
    if (lastOrderDaysTo !== null) {
      whereClause += " AND oa.last_order_at IS NOT NULL AND TIMESTAMPDIFF(DAY, DATE(oa.last_order_at), CURDATE()) <= ?";
      params.push(lastOrderDaysTo);
    }

    const query = `
      SELECT
             u.id, u.phone, u.first_name, u.last_name, u.email, u.telegram_id,
             u.date_of_birth, u.created_at as registration_date,
             u.loyalty_balance, u.pb_client_id,
             COALESCE(oa.orders_count, 0) as orders_count,
             COALESCE(oa.total_orders_sum, 0) as total_orders_sum,
             COALESCE(oa.avg_check, 0) as avg_check,
             oa.last_order_at,
             TIMESTAMPDIFF(DAY, DATE(oa.last_order_at), CURDATE()) as last_order_days,
             c.name as city_name
      FROM users u
      LEFT JOIN (
        SELECT
          o.user_id,
          SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as orders_count,
          SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as total_orders_sum,
          AVG(CASE WHEN o.status = 'completed' THEN o.total ELSE NULL END) as avg_check,
          MAX(o.created_at) as last_order_at,
          SUBSTRING_INDEX(GROUP_CONCAT(o.city_id ORDER BY o.created_at DESC), ',', 1) as last_order_city_id
        FROM orders o
        GROUP BY o.user_id
      ) oa ON oa.user_id = u.id
      LEFT JOIN cities c ON c.id = oa.last_order_city_id
      ${whereClause}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));
    const [clients] = await db.query(query, params);
    const decryptedClients = clients.map((client) => decryptUserData(client));
    res.json({ clients: decryptedClients });
  } catch (error) {
    next(error);
  }
});
const ensureManagerClientAccess = async (req, userId) => {
  if (req.user.role !== "manager") return true;
  const cityIds = getManagerCityIds(req);
  if (!cityIds || cityIds.length === 0) return false;
  const [orders] = await db.query("SELECT id FROM orders WHERE user_id = ? AND city_id IN (?) LIMIT 1", [userId, cityIds]);
  return orders.length > 0;
};
router.get("/clients/:id", requirePermission("clients.view"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }
    const settings = await getSystemSettings();
    const loyaltyMode = String(settings?.integration_mode?.loyalty || "local")
      .trim()
      .toLowerCase();
    if (settings.premiumbonus_enabled && loyaltyMode === "external") {
      try {
        await loyaltyAdapter.getUserBalance(Number(userId));
      } catch (error) {
        // В режиме буфера не блокируем ответ админки при недоступности PB.
      }
    }
    const [users] = await db.query(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.telegram_id, u.loyalty_balance, u.pb_client_id, u.created_at, u.date_of_birth,
              COALESCE(oa.total_orders_sum, 0) as total_orders_sum,
              COALESCE(oa.avg_check, 0) as avg_check,
              c.name as city_name
       FROM users u
       LEFT JOIN (
         SELECT o.user_id,
                SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as total_orders_sum,
                AVG(CASE WHEN o.status = 'completed' THEN o.total ELSE NULL END) as avg_check
         FROM orders o
         GROUP BY o.user_id
       ) oa ON oa.user_id = u.id
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
    const favoritesParams = [userId];
    let favoritesWhereClause = "WHERE o.user_id = ? AND o.status != 'cancelled'";

    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
      favoritesWhereClause += " AND o.city_id IN (?)";
      favoritesParams.push(cityIds);
    }

    const [favoriteDishes, favoriteCategories] = await Promise.all([
      db.query(
        `
        SELECT
          COALESCE(
            NULLIF(
              TRIM(
                MAX(CASE WHEN oi.item_name IS NOT NULL AND TRIM(oi.item_name) != '' THEN oi.item_name ELSE NULL END)
              ),
              ''
            ),
            CONCAT('Блюдо #', COALESCE(MAX(oi.item_id), MAX(oi.id)))
          ) as name,
          SUM(oi.quantity) as total_quantity,
          COUNT(DISTINCT oi.order_id) as orders_count,
          MAX(o.created_at) as last_ordered_at
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        ${favoritesWhereClause}
        GROUP BY CASE
          WHEN oi.item_id IS NOT NULL THEN CONCAT('id:', oi.item_id)
          ELSE CONCAT('name:', LOWER(TRIM(COALESCE(oi.item_name, ''))))
        END
        ORDER BY total_quantity DESC, orders_count DESC, last_ordered_at DESC
        LIMIT 5
        `,
        favoritesParams,
      ),
      db.query(
        `
        SELECT
          mc.id,
          mc.name,
          COUNT(DISTINCT o.id) as orders_count,
          SUM(oi.quantity) as total_quantity,
          MAX(o.created_at) as last_ordered_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_item_categories mic ON mic.item_id = oi.item_id
        JOIN menu_categories mc ON mc.id = mic.category_id
        ${favoritesWhereClause}
        GROUP BY mc.id, mc.name
        ORDER BY total_quantity DESC, orders_count DESC, last_ordered_at DESC
        LIMIT 5
        `,
        favoritesParams,
      ),
    ]);
    const decryptedUser = decryptUserData(users[0]);
    res.json({
      user: decryptedUser,
      favorites: {
        dishes: favoriteDishes[0] || [],
        categories: favoriteCategories[0] || [],
      },
    });
  } catch (error) {
    next(error);
  }
});
router.put("/clients/:id", requirePermission("clients.manage"), async (req, res, next) => {
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
    const encryptedPhone = phone ? encryptPhone(phone) : null;
    const encryptedEmail = email ? encryptEmail(email) : null;
    await db.query("UPDATE users SET phone = ?, first_name = ?, last_name = ?, email = ? WHERE id = ?", [
      encryptedPhone,
      first_name || null,
      last_name || null,
      encryptedEmail,
      userId,
    ]);
    const [updated] = await db.query(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.email, u.telegram_id, u.loyalty_balance, u.pb_client_id, u.created_at, u.date_of_birth,
              COALESCE(oa.total_orders_sum, 0) as total_orders_sum,
              COALESCE(oa.avg_check, 0) as avg_check,
              c.name as city_name
       FROM users u
       LEFT JOIN (
         SELECT o.user_id,
                SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as total_orders_sum,
                AVG(CASE WHEN o.status = 'completed' THEN o.total ELSE NULL END) as avg_check
         FROM orders o
         GROUP BY o.user_id
       ) oa ON oa.user_id = u.id
       LEFT JOIN orders o ON o.id = (
         SELECT id FROM orders WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN cities c ON c.id = o.city_id
       WHERE u.id = ?`,
      [userId],
    );
    const decryptedUser = decryptUserData(updated[0]);
    res.json({ user: decryptedUser });
  } catch (error) {
    next(error);
  }
});
router.delete("/clients/:id", requirePermission("clients.manage"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const hasAccess = await ensureManagerClientAccess(req, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this user" });
    }
    const [users] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    await db.query("DELETE FROM users WHERE id = ?", [userId]);
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    next(error);
  }
});
router.get("/clients/:id/orders", requirePermission("clients.view"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const statusGroup = String(req.query.status_group || "active").trim().toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const statusGroups = {
      active: ["pending", "confirmed", "preparing", "ready", "delivering"],
      completed: ["completed"],
      cancelled: ["cancelled"],
    };
    const selectedStatuses = statusGroups[statusGroup] || statusGroups.active;
    let baseWhereClause = "WHERE o.user_id = ?";
    const baseParams = [userId];
    if (req.user.role === "manager") {
      const cityIds = getManagerCityIds(req);
      if (!cityIds || cityIds.length === 0) {
        return res.status(403).json({ error: "You do not have access to this user" });
      }
      baseWhereClause += " AND o.city_id IN (?)";
      baseParams.push(cityIds);
    }
    const whereClause = `${baseWhereClause} AND o.status IN (?)`;
    const [[orders], [totalRows], [summaryRows]] = await Promise.all([
      db.query(
        `
        SELECT o.id, o.order_number, o.total, o.status, o.created_at,
               (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count,
               c.name as city_name, b.name as branch_name
        FROM orders o
        LEFT JOIN cities c ON o.city_id = c.id
        LEFT JOIN branches b ON o.branch_id = b.id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
        `,
        [...baseParams, selectedStatuses, limit, offset],
      ),
      db.query(
        `
        SELECT COUNT(*) as total
        FROM orders o
        ${whereClause}
        `,
        [...baseParams, selectedStatuses],
      ),
      db.query(
        `
        SELECT
          SUM(CASE WHEN o.status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivering') THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM orders o
        ${baseWhereClause}
        `,
        baseParams,
      ),
    ]);
    const total = Number(totalRows[0]?.total || 0);
    const summary = summaryRows[0] || {};
    res.json({
      orders,
      summary: {
        active: Number(summary.active || 0),
        completed: Number(summary.completed || 0),
        cancelled: Number(summary.cancelled || 0),
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/users", requirePermission("system.admin_users.manage"), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, role, telegram_id, eruda_enabled, cities, branch_ids } = req.body;
    if (!email || !password || !first_name || !last_name || !role) {
      return res.status(400).json({
        error: "Email, password, first_name, last_name, and role are required",
      });
    }
    const selectedRole = await resolveRoleContext(role, { requireActive: true });
    if (!selectedRole) {
      return res.status(400).json({ error: "Выбранная роль не найдена или неактивна" });
    }
    if (req.user.role === "ceo" && selectedRole.scope_role === "admin") {
      return res.status(403).json({ error: "CEO не может создавать администраторов" });
    }
    const [existingUsers] = await db.query("SELECT id FROM admin_users WHERE email = ?", [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }
    let managerBranchIds = [];
    if (isManagerScope(selectedRole.scope_role) && Array.isArray(branch_ids) && branch_ids.length > 0) {
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
      managerBranchIds = branch_ids.map((branchId) => Number(branchId));
    }
    const passwordHash = await bcrypt.hash(password, 12);
    if (req.user.role === "ceo" && eruda_enabled !== undefined) {
      return res.status(403).json({ error: "CEO не может включать Eruda" });
    }
    if (eruda_enabled === true && !telegram_id) {
      return res.status(400).json({ error: "Для включения Eruda нужен Telegram ID" });
    }
    const [result] = await db.query(
      `INSERT INTO admin_users (email, password_hash, first_name, last_name, role, telegram_id, eruda_enabled, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, first_name, last_name, selectedRole.code, telegram_id || null, eruda_enabled === true, null],
    );
    const newUserId = result.insertId;
    if (isManagerScope(selectedRole.scope_role) && cities && cities.length > 0) {
      for (let cityId of cities) {
        await db.query("INSERT INTO admin_user_cities (admin_user_id, city_id) VALUES (?, ?)", [newUserId, cityId]);
      }
    }
    if (isManagerScope(selectedRole.scope_role) && managerBranchIds.length > 0) {
      for (let branchId of managerBranchIds) {
        await db.query("INSERT INTO admin_user_branches (admin_user_id, branch_id) VALUES (?, ?)", [newUserId, branchId]);
      }
    }
    const [newUser] = await db.query(
      `SELECT au.id, au.email, au.first_name, au.last_name, au.role,
              COALESCE(ar.name, au.role) AS role_name,
              COALESCE(ar.scope_role, au.role) AS scope_role,
              au.is_active, au.telegram_id, au.eruda_enabled, au.branch_id, au.created_at, au.updated_at
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.code = au.role
       WHERE au.id = ?`,
      [newUserId],
    );
    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});
router.put("/users/:id", requirePermission("system.admin_users.manage"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { email, password, first_name, last_name, role, telegram_id, eruda_enabled, is_active, cities, branch_ids } = req.body;
    const [existingUsers] = await db.query("SELECT id, role, branch_id, telegram_id FROM admin_users WHERE id = ?", [userId]);
    if (existingUsers.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const existingRole = await resolveRoleContext(existingUsers[0].role);
    if (!existingRole) {
      return res.status(400).json({ error: "У пользователя назначена несуществующая роль" });
    }
    if (req.user.role === "ceo" && existingRole.scope_role === "admin") {
      return res.status(403).json({ error: "CEO не может изменять администраторов" });
    }
    const updates = [];
    const values = [];
    let selectedRole = null;
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
      selectedRole = await resolveRoleContext(role, { requireActive: true });
      if (!selectedRole) {
        return res.status(400).json({ error: "Выбранная роль не найдена или неактивна" });
      }
      if (req.user.role === "ceo" && selectedRole.scope_role === "admin") {
        return res.status(403).json({ error: "CEO не может назначать роль администратора" });
      }
      updates.push("role = ?");
      values.push(selectedRole.code);
    }
    if (telegram_id !== undefined) {
      const normalizedTelegramId = telegram_id === "" ? null : telegram_id;
      updates.push("telegram_id = ?");
      values.push(normalizedTelegramId);
    }
    if (eruda_enabled !== undefined) {
      if (req.user.role === "ceo") {
        return res.status(403).json({ error: "CEO не может включать Eruda" });
      }
      const normalizedTelegramId = telegram_id === "" ? null : telegram_id;
      const effectiveTelegramId = telegram_id !== undefined ? normalizedTelegramId : existingUsers[0].telegram_id;
      if (eruda_enabled === true && !effectiveTelegramId) {
        return res.status(400).json({ error: "Для включения Eruda нужен Telegram ID" });
      }
      updates.push("eruda_enabled = ?");
      values.push(eruda_enabled === true);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    const finalRoleScope = selectedRole?.scope_role || existingRole.scope_role;
    if (!isManagerScope(finalRoleScope)) {
      updates.push("branch_id = ?");
      values.push(null);
    }
    if (updates.length > 0) {
      values.push(userId);
      await db.query(`UPDATE admin_users SET ${updates.join(", ")} WHERE id = ?`, values);
    }
    if (role !== undefined) {
      await incrementUserPermissionVersion(db, userId);
    }
    if (isManagerScope(finalRoleScope) && cities !== undefined) {
      await db.query("DELETE FROM admin_user_cities WHERE admin_user_id = ?", [userId]);
      if (cities && cities.length > 0) {
        for (let cityId of cities) {
          await db.query("INSERT INTO admin_user_cities (admin_user_id, city_id) VALUES (?, ?)", [userId, cityId]);
        }
      }
    }
    if (isManagerScope(finalRoleScope) && branch_ids !== undefined) {
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
    } else if (!isManagerScope(finalRoleScope)) {
      await db.query("DELETE FROM admin_user_branches WHERE admin_user_id = ?", [userId]);
    }
    const [updatedUser] = await db.query(
      `SELECT au.id, au.email, au.first_name, au.last_name, au.role,
              COALESCE(ar.name, au.role) AS role_name,
              COALESCE(ar.scope_role, au.role) AS scope_role,
              au.is_active, au.telegram_id, au.branch_id, au.created_at, au.updated_at
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.code = au.role
       WHERE au.id = ?`,
      [userId],
    );
    const user = updatedUser[0];
    if (isManagerScope(user.scope_role)) {
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
router.delete("/users/:id", requirePermission("system.admin_users.manage"), async (req, res, next) => {
  try {
    const userId = req.params.id;
    const [users] = await db.query("SELECT id, role FROM admin_users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const targetRole = await resolveRoleContext(users[0].role);
    if (!targetRole) {
      return res.status(400).json({ error: "У пользователя назначена несуществующая роль" });
    }
    if (req.user.role === "ceo" && targetRole.scope_role === "admin") {
      return res.status(403).json({ error: "CEO не может удалять администраторов" });
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
router.get("/queues", requirePermission("system.queues.manage"), async (req, res, next) => {
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
router.get("/queues/:queueType/failed", requirePermission("system.queues.manage"), async (req, res, next) => {
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
router.post("/queues/:queueType/retry", requirePermission("system.queues.manage"), async (req, res, next) => {
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
router.post("/queues/:queueType/clean", requirePermission("system.queues.manage"), async (req, res, next) => {
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
router.get("/logs", requirePermission("system.logs.view"), async (req, res, next) => {
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
    next(error);
  }
});
export default router;
