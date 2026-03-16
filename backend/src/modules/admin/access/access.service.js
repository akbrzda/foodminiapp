import db from "../../../config/database.js";
import {
  getRolePermissions as getRolePermissionsByRoleCode,
  resolveAdminPermissions,
  SYSTEM_ROLE_DEFINITIONS,
} from "../../access/index.js";
import {
  clearUserOverrides,
  findAdminUserById,
  findRoleById,
  insertUserOverrides,
  listPermissions,
  listPermissionsByCodes,
  listRolePermissionCodes,
  listSystemRoles,
  listUserOverrides,
  replaceRolePermissions,
} from "./access.repository.js";

const ACCESS_TABLE_MISSING_CODES = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR"]);
const SYSTEM_ROLE_CODES = new Set(SYSTEM_ROLE_DEFINITIONS.map((role) => role.code));

class AccessServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AccessServiceError";
    this.status = status;
  }
}

const toPositiveInt = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const validateSystemRole = (role) => {
  if (!role) {
    throw new AccessServiceError("Роль не найдена", 404);
  }
  if (!SYSTEM_ROLE_CODES.has(String(role.code || "").trim().toLowerCase())) {
    throw new AccessServiceError("Роль недоступна для управления", 404);
  }
};

const resolveMissingPermissions = (requestedCodes, foundPermissions) => {
  const foundCodes = new Set(foundPermissions.map((row) => row.code));
  return requestedCodes.filter((code) => !foundCodes.has(code));
};

export const isAccessSchemaMissingError = (error) => {
  if (!error) return false;
  return ACCESS_TABLE_MISSING_CODES.has(error.code);
};

export const isAccessServiceError = (error) => error instanceof AccessServiceError;

export async function getPermissions() {
  return listPermissions();
}

export async function getRoles() {
  return listSystemRoles();
}

export async function getRolePermissions(roleIdValue) {
  const roleId = toPositiveInt(roleIdValue);
  if (!roleId) {
    throw new AccessServiceError("Некорректный id роли", 400);
  }

  const role = await findRoleById(roleId);
  validateSystemRole(role);

  const permissions = await listRolePermissionCodes(roleId);
  return { role, permissions };
}

export async function updateRolePermissions(roleIdValue, permissionCodesValue) {
  const roleId = toPositiveInt(roleIdValue);
  if (!roleId) {
    throw new AccessServiceError("Некорректный id роли", 400);
  }
  if (!Array.isArray(permissionCodesValue)) {
    throw new AccessServiceError("permission_codes должен быть массивом", 400);
  }

  const permissionCodes = [...new Set(permissionCodesValue.map((code) => String(code || "").trim()).filter(Boolean))];
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const role = await findRoleById(roleId, connection);
    validateSystemRole(role);

    const foundPermissions = await listPermissionsByCodes(permissionCodes, connection);
    const missing = resolveMissingPermissions(permissionCodes, foundPermissions);
    if (missing.length > 0) {
      throw new AccessServiceError(`Не найдены permissions: ${missing.join(", ")}`, 400);
    }

    const permissionIds = foundPermissions.map((row) => row.id);
    await replaceRolePermissions(roleId, permissionIds, connection);
    await connection.commit();

    return {
      role_id: roleId,
      permission_codes: permissionCodes,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getUserOverrides(userIdValue) {
  const userId = toPositiveInt(userIdValue);
  if (!userId) {
    throw new AccessServiceError("Некорректный id пользователя", 400);
  }

  const user = await findAdminUserById(userId);
  if (!user) {
    throw new AccessServiceError("Пользователь не найден", 404);
  }

  const overrides = await listUserOverrides(userId);
  const rolePermissions = await getRolePermissionsByRoleCode(db, user.role);
  const resolved = await resolveAdminPermissions(db, {
    adminUserId: userId,
    roleCode: user.role,
  });

  return {
    user,
    role_permissions: rolePermissions,
    overrides,
    effective_permissions: resolved.permissions,
  };
}

export async function updateUserOverrides(userIdValue, overridesValue) {
  const userId = toPositiveInt(userIdValue);
  if (!userId) {
    throw new AccessServiceError("Некорректный id пользователя", 400);
  }
  if (!Array.isArray(overridesValue)) {
    throw new AccessServiceError("overrides должен быть массивом", 400);
  }

  const normalizedOverrides = overridesValue.map((item) => ({
    permission_code: String(item?.permission_code || "").trim(),
    effect: String(item?.effect || "")
      .trim()
      .toLowerCase(),
  }));
  const hasInvalidOverride = normalizedOverrides.some(
    (item) => !item.permission_code || !["allow", "deny"].includes(item.effect)
  );
  if (hasInvalidOverride) {
    throw new AccessServiceError(
      "Каждый override должен содержать permission_code и effect (allow|deny)",
      400
    );
  }

  const permissionCodes = [...new Set(normalizedOverrides.map((item) => item.permission_code))];
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const user = await findAdminUserById(userId, connection);
    if (!user) {
      throw new AccessServiceError("Пользователь не найден", 404);
    }

    const foundPermissions = await listPermissionsByCodes(permissionCodes, connection);
    const missing = resolveMissingPermissions(permissionCodes, foundPermissions);
    if (missing.length > 0) {
      throw new AccessServiceError(`Не найдены permissions: ${missing.join(", ")}`, 400);
    }

    const permissionIdByCode = new Map(foundPermissions.map((row) => [row.code, row.id]));
    await clearUserOverrides(userId, connection);
    await insertUserOverrides(userId, normalizedOverrides, permissionIdByCode, connection);
    await connection.commit();

    const resolved = await resolveAdminPermissions(db, {
      adminUserId: userId,
      roleCode: user.role,
    });
    return {
      admin_user_id: userId,
      overrides: normalizedOverrides,
      effective_permissions: resolved.permissions,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resetUserOverrides(userIdValue) {
  const userId = toPositiveInt(userIdValue);
  if (!userId) {
    throw new AccessServiceError("Некорректный id пользователя", 400);
  }

  const user = await findAdminUserById(userId);
  if (!user) {
    throw new AccessServiceError("Пользователь не найден", 404);
  }

  await clearUserOverrides(userId);
  const resolved = await resolveAdminPermissions(db, {
    adminUserId: userId,
    roleCode: user.role,
  });
  return {
    admin_user_id: userId,
    reset_to_role_defaults: true,
    effective_permissions: resolved.permissions,
  };
}
