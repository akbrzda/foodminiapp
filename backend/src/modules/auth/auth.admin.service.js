import bcrypt from "bcrypt";
import db from "../../config/database.js";
import redis from "../../config/redis.js";
import { logger } from "../../utils/logger.js";
import { resolveAdminPermissions } from "../access/index.js";
import { authRepository } from "./auth.repository.js";
import { requireAdminCredentials } from "./auth.schemas.js";
import { buildAdminAuthPayload, buildAdminSessionUser, sanitizeAdminUser } from "./auth.mapper.js";
import {
  TOKEN_AUDIENCES,
  TOKEN_CONFIG,
  createCsrfToken,
  signAccessToken,
  signRefreshToken,
} from "./auth.tokens.js";
import { AuthError, authError } from "../../shared/errors/auth-errors.js";
import {
  getAdminScope,
  resolveAdminRoleContext,
  safeLogAdminAuthAction,
} from "./auth.admin.helpers.js";

const ADMIN_LOGIN_BLOCK_LIMIT = 5;
const ADMIN_LOGIN_BLOCK_WINDOW_SECONDS = 15 * 60;

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

const buildTokensForAdmin = (payload) => {
  const accessToken = signAccessToken(
    payload,
    TOKEN_AUDIENCES.accessAdmin,
    TOKEN_CONFIG.adminAccessTtl
  );
  const refreshToken = signRefreshToken(
    payload,
    TOKEN_AUDIENCES.refreshAdmin,
    TOKEN_CONFIG.adminRefreshTtl
  );

  return {
    accessToken,
    refreshToken,
    accessMaxAge: TOKEN_CONFIG.adminAccessCookieMaxAge,
    refreshMaxAge: TOKEN_CONFIG.adminRefreshCookieMaxAge,
  };
};

export const loginAdmin = async ({ body, ipAddress, userAgent }) => {
  const emailFromBody = typeof body?.email === "string" ? body.email.trim() : "";

  if (emailFromBody) {
    const attempts = await getAdminLoginAttempts(emailFromBody, ipAddress);
    if (attempts >= ADMIN_LOGIN_BLOCK_LIMIT) {
      await logger.auth.loginFailed(emailFromBody, "Too many failed attempts", ipAddress);
      throw new AuthError(
        "Слишком много неудачных попыток. Попробуйте позже",
        429,
        "AUTH_TOO_MANY_ATTEMPTS"
      );
    }
  }

  const { email, password } = requireAdminCredentials(body);
  const user = await authRepository.findAdminByEmailWithPassword(email);

  if (!user) {
    await registerAdminLoginFailure(email, ipAddress);
    await logger.auth.loginFailed(email, "User not found", ipAddress);
    throw new AuthError("Invalid credentials", 401, "AUTH_INVALID_CREDENTIALS");
  }

  if (!user.is_active) {
    await registerAdminLoginFailure(email, ipAddress);
    await logger.auth.loginFailed(email, "Account disabled", ipAddress);
    throw new AuthError("Account is disabled", 403, "AUTH_ACCOUNT_DISABLED");
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    await registerAdminLoginFailure(email, ipAddress);
    await logger.auth.loginFailed(email, "Invalid password", ipAddress);
    throw new AuthError("Invalid credentials", 401, "AUTH_INVALID_CREDENTIALS");
  }

  await clearAdminLoginFailures(email, ipAddress);

  const roleContext = await resolveAdminRoleContext(user.role);
  if (!roleContext || !roleContext.is_active) {
    await logger.auth.loginFailed(email, "Role is disabled", ipAddress);
    throw new AuthError("Role is disabled", 403, "AUTH_ROLE_DISABLED");
  }

  const { cities, branches } = await getAdminScope(user.id, roleContext.code);
  const { permissions } = await resolveAdminPermissions(db, {
    adminUserId: user.id,
    roleCode: user.role,
  });
  const authPayload = buildAdminAuthPayload({ user, roleContext, cities, branches, permissions });
  const tokens = buildTokensForAdmin(authPayload);
  const csrfToken = createCsrfToken();

  await logger.auth.login(user.id, roleContext.code, ipAddress);
  await safeLogAdminAuthAction({
    adminUserId: user.id,
    action: "auth_login_success",
    description: "Успешный вход в админ-панель",
    ipAddress,
    userAgent,
  });

  return {
    user: buildAdminSessionUser({
      user: sanitizeAdminUser(user),
      roleContext,
      cities,
      branches,
      permissions,
    }),
    csrfToken,
    tokens,
  };
};

export const getAdminSession = async ({ user }) => {
  if (user?.type !== "admin") {
    throw authError.invalidSessionType();
  }

  const admin = await authRepository.findAdminByIdForSession(user.id);
  if (!admin || !admin.is_active) {
    throw new AuthError("Admin account not found or inactive", 401, "AUTH_ADMIN_NOT_FOUND");
  }

  const roleContext = await resolveAdminRoleContext(admin.role);
  if (!roleContext || !roleContext.is_active) {
    throw new AuthError("Admin role is inactive", 401, "AUTH_ROLE_INACTIVE");
  }

  const { cities, branches } = await getAdminScope(admin.id, roleContext.code);
  const { permissions } = await resolveAdminPermissions(db, {
    adminUserId: admin.id,
    roleCode: admin.role,
  });

  return {
    user: buildAdminSessionUser({ user: admin, roleContext, cities, branches, permissions }),
  };
};
