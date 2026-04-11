import db from "../../config/database.js";
import { logger } from "../../utils/logger.js";
import { getRoleByCode } from "../access/index.js";
import { authRepository } from "./auth.repository.js";
import { isPlatformRoleCode } from "../platform-core/platform-auth.constants.js";

export const resolveAdminRoleContext = async (roleCode) => {
  const normalizedCode = String(roleCode || "")
    .trim()
    .toLowerCase();
  const roleFromDb = await getRoleByCode(db, normalizedCode);
  if (roleFromDb) return roleFromDb;

  if (isPlatformRoleCode(normalizedCode)) {
    return {
      id: null,
      code: normalizedCode,
      name: normalizedCode,
      is_active: 1,
      is_system: 1,
    };
  }

  return null;
};

export const getAdminScope = async (adminId, roleCode) => {
  if (roleCode !== "manager") {
    return {
      cities: [],
      branches: [],
    };
  }

  const [cities, branches] = await Promise.all([
    authRepository.getManagerCities(adminId),
    authRepository.getManagerBranches(adminId),
  ]);

  return {
    cities,
    branches,
  };
};

export const safeLogAdminAuthAction = async ({
  adminUserId,
  action,
  description,
  ipAddress,
  userAgent,
}) => {
  if (!adminUserId || !action) return;
  try {
    await authRepository.logAdminAuthAction({
      adminUserId,
      action,
      description,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    logger.system.warn("Не удалось записать auth-событие в admin_action_logs", {
      admin_user_id: adminUserId,
      action,
      error: error.message,
    });
  }
};
