import crypto from "crypto";
import db from "../../config/database.js";
import redis from "../../config/redis.js";
import { addToBlacklist, isBlacklisted } from "../../middleware/tokenBlacklist.js";
import { logger } from "../../utils/logger.js";
import { resolveAdminPermissions } from "../access/index.js";
import { authRepository } from "./auth.repository.js";
import { buildAdminAuthPayload, buildClientAuthPayload } from "./auth.mapper.js";
import {
  TOKEN_AUDIENCES,
  TOKEN_CONFIG,
  createCsrfToken,
  getTokenTtlSeconds,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./auth.tokens.js";
import { AuthError, authError } from "../../shared/errors/auth-errors.js";
import {
  getAdminScope,
  resolveAdminRoleContext,
  safeLogAdminAuthAction,
} from "./auth.admin.helpers.js";

const buildTokensForClient = (payload) => {
  const accessToken = signAccessToken(
    payload,
    TOKEN_AUDIENCES.accessClient,
    TOKEN_CONFIG.clientAccessTtl
  );
  const refreshToken = signRefreshToken(
    payload,
    TOKEN_AUDIENCES.refreshClient,
    TOKEN_CONFIG.clientRefreshTtl
  );

  return {
    accessToken,
    refreshToken,
    accessMaxAge: TOKEN_CONFIG.clientAccessCookieMaxAge,
    refreshMaxAge: TOKEN_CONFIG.clientRefreshCookieMaxAge,
  };
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

export const issueWsTicket = async ({ user, ipAddress }) => {
  if (!user || !user.id || !user.type) {
    throw new AuthError("Invalid session context", 401, "AUTH_SESSION_CONTEXT_INVALID");
  }

  if (user?.type === "client") {
    const existingUser = await authRepository.findClientById(user.id);
    if (!existingUser) {
      throw new AuthError("User account not found", 401, "AUTH_CLIENT_NOT_FOUND");
    }
  }

  if (user?.type === "admin") {
    const admin = await authRepository.findAdminById(user.id);
    if (!admin || !admin.is_active) {
      throw new AuthError("Admin account not found or inactive", 401, "AUTH_ADMIN_NOT_FOUND");
    }
  }
  if (user.type !== "client" && user.type !== "admin") {
    throw new AuthError("Invalid session type", 403, "AUTH_SESSION_TYPE_INVALID");
  }

  const ticket = crypto.randomBytes(32).toString("hex");
  const redisKey = `${TOKEN_CONFIG.wsTicketPrefix}:${ticket}`;
  const payload = JSON.stringify({
    id: user.id,
    role: user.role ?? null,
    cities: Array.isArray(user.cities) ? user.cities : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    city_ids: Array.isArray(user.city_ids) ? user.city_ids : [],
    type: user.type,
    issued_at: Date.now(),
  });

  await redis.set(redisKey, payload, "EX", TOKEN_CONFIG.wsTicketTtlSeconds);
  await logger.auth.wsTicketIssued(user.id, user.type, ipAddress);

  return {
    ticket,
    expiresIn: TOKEN_CONFIG.wsTicketTtlSeconds,
  };
};

export const refreshSession = async ({ refreshToken, ipAddress }) => {
  if (!refreshToken) {
    throw authError.refreshTokenRequired();
  }

  if (await isBlacklisted(refreshToken)) {
    throw authError.refreshTokenRevoked();
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw authError.invalidRefreshToken();
  }

  let tokens;

  if (decoded?.type === "client") {
    const user = await authRepository.findClientByIdForRefresh(decoded.id);
    if (!user) {
      throw new AuthError("User account not found", 401, "AUTH_CLIENT_NOT_FOUND");
    }

    const payload = buildClientAuthPayload({
      userId: user.id,
      telegramId: user.telegram_id,
    });
    if (!payload.telegram_id) {
      throw new AuthError("User telegram_id is required", 401, "AUTH_CLIENT_TELEGRAM_ID_MISSING");
    }

    tokens = buildTokensForClient(payload);
    await logger.auth.refreshSuccess(user.id, "client", ipAddress);
  } else if (decoded?.type === "admin") {
    const admin = await authRepository.findAdminByIdForRefresh(decoded.id);
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
    const payload = buildAdminAuthPayload({
      user: admin,
      roleContext,
      cities,
      branches,
      permissions,
    });

    tokens = buildTokensForAdmin(payload);
    await logger.auth.refreshSuccess(admin.id, "admin", ipAddress);
  } else {
    throw authError.invalidRefreshPayload();
  }

  await addToBlacklist(refreshToken, getTokenTtlSeconds(decoded));

  return {
    csrfToken: createCsrfToken(),
    tokens,
  };
};

export const getCsrf = ({ hasAuthCookies, currentCsrfToken }) => {
  if (!hasAuthCookies) {
    throw authError.authRequired();
  }

  const csrfToken = String(currentCsrfToken || "").trim();
  if (csrfToken) {
    return {
      csrfToken,
      shouldSetCookie: false,
      maxAge: TOKEN_CONFIG.csrfCookieMaxAge,
    };
  }

  return {
    csrfToken: createCsrfToken(),
    shouldSetCookie: true,
    maxAge: TOKEN_CONFIG.csrfCookieMaxAge,
  };
};

export const logout = async ({ accessToken, refreshToken, ipAddress, userAgent }) => {
  if (!accessToken && !refreshToken) {
    throw authError.authRequired();
  }

  let logoutAdminUserId = null;

  if (accessToken) {
    const decoded = verifyAccessToken(accessToken);
    if (decoded?.type === "admin" && decoded?.id) {
      logoutAdminUserId = decoded.id;
    }
    const expiresIn = Number(decoded?.exp) - Math.floor(Date.now() / 1000);
    await addToBlacklist(accessToken, expiresIn > 0 ? expiresIn : 1);
  }

  if (refreshToken) {
    const decodedRefresh = verifyRefreshToken(refreshToken);
    await addToBlacklist(refreshToken, getTokenTtlSeconds(decodedRefresh));
  }

  if (logoutAdminUserId) {
    await logger.auth.logout(logoutAdminUserId, "admin", ipAddress);
    await safeLogAdminAuthAction({
      adminUserId: logoutAdminUserId,
      action: "auth_logout",
      description: "Выход из админ-сессии",
      ipAddress,
      userAgent,
    });
  }

  return {
    message: "Logout successful",
  };
};
