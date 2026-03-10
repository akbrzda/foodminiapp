import { getDefaultRolePermissions } from "./permissions.js";

const TABLE_MISSING_CODES = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR"]);

const isTableMissingError = (error) => {
  if (!error) return false;
  return TABLE_MISSING_CODES.has(error.code);
};

const SYSTEM_SCOPE_ROLES = new Set(["admin", "manager", "ceo"]);

export const resolveScopeRole = (scopeRole, fallbackRoleCode = "") => {
  const normalizedScope = String(scopeRole || "").trim().toLowerCase();
  if (SYSTEM_SCOPE_ROLES.has(normalizedScope)) {
    return normalizedScope;
  }

  const normalizedFallback = String(fallbackRoleCode || "").trim().toLowerCase();
  if (SYSTEM_SCOPE_ROLES.has(normalizedFallback)) {
    return normalizedFallback;
  }

  return "manager";
};

export const getRoleByCode = async (db, roleCode) => {
  const [rows] = await db.query(
    `SELECT id, code, name, scope_role, is_system, is_active, created_at, updated_at
     FROM admin_roles
     WHERE code = ?
     LIMIT 1`,
    [roleCode],
  );
  return rows[0] || null;
};

export const getRolePermissions = async (db, roleCode) => {
  try {
    const [rows] = await db.query(
      `SELECT p.code
       FROM admin_roles r
       JOIN admin_role_permissions rp ON rp.role_id = r.id
       JOIN admin_permissions p ON p.id = rp.permission_id
       WHERE r.code = ? AND r.is_active = 1`,
      [roleCode],
    );

    if (rows.length === 0) {
      return getDefaultRolePermissions(roleCode);
    }

    return rows.map((row) => row.code);
  } catch (error) {
    if (isTableMissingError(error)) {
      return getDefaultRolePermissions(roleCode);
    }
    throw error;
  }
};

export const getUserPermissionOverrides = async (db, adminUserId) => {
  try {
    const [rows] = await db.query(
      `SELECT p.code, uo.effect
       FROM admin_user_permission_overrides uo
       JOIN admin_permissions p ON p.id = uo.permission_id
       WHERE uo.admin_user_id = ?`,
      [adminUserId],
    );

    return rows;
  } catch (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw error;
  }
};

export const resolveAdminPermissions = async (db, { adminUserId, roleCode }) => {
  const rolePermissions = await getRolePermissions(db, roleCode);
  const overrides = await getUserPermissionOverrides(db, adminUserId);

  const finalPermissions = new Set(rolePermissions);

  for (const override of overrides) {
    if (override.effect === "deny") {
      finalPermissions.delete(override.code);
      continue;
    }
    if (override.effect === "allow") {
      finalPermissions.add(override.code);
    }
  }

  return {
    permissions: Array.from(finalPermissions).sort(),
    overrides,
  };
};

export const canPermission = (permissions, permissionCode) => {
  if (!permissionCode) return true;
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(permissionCode);
};
