import jwt from "jsonwebtoken";
import { isBlacklisted } from "./tokenBlacklist.js";
import { logger } from "../utils/logger.js";
import { JWT_ISSUER, JWT_ACCESS_AUDIENCES, extractBearerToken, getJwtSecret } from "../config/auth.js";
import { canPermission, getDefaultRolePermissions } from "../modules/access/index.js";
import db from "../config/database.js";
import { getAccessTokenCandidates } from "../modules/auth/auth.cookies.js";
import { safeLogAdminAuthAction } from "../modules/auth/auth.admin.helpers.js";
import { isPlatformRoleCode } from "../modules/platform-core/platform-auth.constants.js";

const normalizeCityIds = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item));
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? [value] : [];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => Number(item)).filter((item) => Number.isInteger(item));
      }
    } catch (error) {
      // Игнорируем ошибку парсинга и пробуем CSV.
    }
    return trimmed
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item));
  }
  return [];
};

const normalizePermissions = (value, role) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return getDefaultRolePermissions(role);
};

export const authenticateToken = async (req, res, next) => {
  try {
    const cookieTokens = getAccessTokenCandidates(req);
    const bearerToken = extractBearerToken(req.headers["authorization"]);
    const tokenCandidates = [...cookieTokens, ...(bearerToken ? [bearerToken] : [])].filter(Boolean);

    if (tokenCandidates.length === 0) {
      await logger.auth.unauthorized(req.path, req.ip);
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    let user = null;
    let hadRevokedToken = false;
    for (const token of tokenCandidates) {
      const blacklisted = await isBlacklisted(token);
      if (blacklisted) {
        hadRevokedToken = true;
        continue;
      }
      try {
        user = jwt.verify(token, getJwtSecret(), {
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_ACCESS_AUDIENCES,
        });
        break;
      } catch (error) {
        // Пробуем следующий токен-кандидат.
      }
    }

    if (!user) {
      await logger.auth.unauthorized(req.path, req.ip);
      return res.status(401).json({
        error: hadRevokedToken ? "Token has been revoked" : "Invalid or expired token",
      });
    }

    req.user = {
      ...user,
      cities: normalizeCityIds(user?.cities),
      permissions: normalizePermissions(user?.permissions, user?.role),
    };
    req.user.auth_scope = String(req.user?.auth_scope || "").trim().toLowerCase() || null;
    req.user.platform_role = String(req.user?.platform_role || "").trim().toLowerCase() || null;
    req.user.tenant_role = String(req.user?.tenant_role || "").trim().toLowerCase() || null;

    if (req.user?.type === "admin") {
      const adminId = Number(req.user?.id);
      if (!Number.isInteger(adminId) || adminId <= 0) {
        await safeLogAdminAuthAction({
          adminUserId: req.user?.id,
          action: "auth_session_invalidated",
          description: "Некорректный admin id в access token",
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
        return res.status(401).json({ error: "Invalid admin session" });
      }

      const [admins] = await db.query(
        `SELECT id, role, is_active, permission_version
         FROM admin_users
         WHERE id = ?
         LIMIT 1`,
        [adminId],
      );
      if (admins.length === 0 || !admins[0].is_active) {
        await safeLogAdminAuthAction({
          adminUserId: adminId,
          action: "auth_session_invalidated",
          description: "Аккаунт админа не найден или деактивирован",
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
        return res.status(401).json({ error: "Admin account not found or inactive" });
      }

      const tokenPermissionVersion = Number(req.user?.permission_version);
      const currentPermissionVersion = Number(admins[0].permission_version || 1);
      if (!Number.isInteger(tokenPermissionVersion) || tokenPermissionVersion !== currentPermissionVersion) {
        await safeLogAdminAuthAction({
          adminUserId: adminId,
          action: "auth_session_invalidated",
          description: "Устаревшая версия прав в токене",
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
        return res.status(401).json({ error: "Session permissions outdated. Please login again." });
      }
    }

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      await logger.auth.tokenExpired(req.user?.id || "unknown");
    } else {
      await logger.auth.unauthorized(req.path, req.ip);
    }
    return res.status(403).json({
      error: "Invalid or expired token",
    });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }
    if (roles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: "Insufficient permissions",
    });
  };
};

export const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }
    if (req.user?.type !== "admin") {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }

    const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : getDefaultRolePermissions(req.user.role);
    const hasPermission = permissions.some((permissionCode) => canPermission(userPermissions, permissionCode));

    if (!hasPermission) {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }

    next();
  };
};

export const requirePlatformAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  if (req.user.type !== "admin") {
    return res.status(403).json({
      error: "Insufficient permissions",
    });
  }

  const roleCode = String(req.user.platform_role || req.user.role || "")
    .trim()
    .toLowerCase();
  const scope = String(req.user.auth_scope || "").trim().toLowerCase();
  if (scope === "platform" && isPlatformRoleCode(roleCode)) {
    return next();
  }

  return res.status(403).json({
    error: "Platform access required",
  });
};

export const requireTenantAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  // Клиентские токены считаем tenant-scoped по определению.
  if (req.user.type === "client") {
    return next();
  }

  if (req.user.type !== "admin") {
    return res.status(403).json({
      error: "Insufficient permissions",
    });
  }

  const scope = String(req.user.auth_scope || "").trim().toLowerCase();
  if (scope !== "tenant") {
    return res.status(403).json({
      error: "Tenant access required",
    });
  }

  const contextTenantId = Number(req.tenantContext?.tenantId || 0);
  const tokenTenantId = Number(req.user?.tenant_id || 0);
  if (contextTenantId > 0 && tokenTenantId > 0 && contextTenantId !== tokenTenantId) {
    return res.status(403).json({
      error: "Tenant context mismatch",
    });
  }

  return next();
};

export const checkCityAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }
  if (req.user.role === "admin" || req.user.role === "ceo") {
    return next();
  }
  const cityId = parseInt(req.params.cityId || req.query.cityId || req.body.cityId);
  if (!cityId) {
    return next();
  }
  if (req.user.cities && req.user.cities.includes(cityId)) {
    return next();
  }
  return res.status(403).json({
    error: "You do not have access to this city",
  });
};
