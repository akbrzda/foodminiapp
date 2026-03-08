import jwt from "jsonwebtoken";
import { isBlacklisted } from "./tokenBlacklist.js";
import { logger } from "../utils/logger.js";
import { JWT_ISSUER, JWT_ACCESS_AUDIENCES, extractBearerToken, getJwtSecret } from "../config/auth.js";
import { canPermission, getDefaultRolePermissions } from "../modules/access/index.js";

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
    // Пытаемся получить токен из cookie (приоритет) или header
    const token = req.cookies?.access_token || extractBearerToken(req.headers["authorization"]);

    if (!token) {
      await logger.auth.unauthorized(req.path, req.ip);
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    // Проверяем blacklist
    const blacklisted = await isBlacklisted(token);
    if (blacklisted) {
      await logger.auth.unauthorized(req.path, req.ip);
      return res.status(401).json({
        error: "Token has been revoked",
      });
    }

    // Верифицируем токен
    const user = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_ACCESS_AUDIENCES,
    });
    req.user = {
      ...user,
      cities: normalizeCityIds(user?.cities),
      permissions: normalizePermissions(user?.permissions, user?.role),
    };
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
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }
    next();
  };
};

export const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
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
