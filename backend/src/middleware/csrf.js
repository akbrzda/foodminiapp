import crypto from "crypto";
import { getCsrfCookieOptions } from "../config/auth.js";
import { hasAnyAuthCookies } from "../modules/auth/auth.cookies.js";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN_OPTIONAL_PATHS = new Set([
  "/api/auth/miniapp",
  "/api/auth/admin/login",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

const normalizeOriginValue = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
};

const getOriginFromReferer = (refererValue) => {
  if (!refererValue) return "";
  try {
    const parsed = new URL(refererValue);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    return "";
  }
};

const generateCsrfToken = () => crypto.randomBytes(32).toString("hex");

const isTokenMatch = (cookieToken, headerToken) => {
  if (!cookieToken || !headerToken) return false;
  const left = Buffer.from(String(cookieToken));
  const right = Buffer.from(String(headerToken));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const createCsrfProtection = ({ isOriginAllowed }) => {
  return (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const isSafeMethod = SAFE_METHODS.has(method);
    const hasAuthCookies = hasAnyAuthCookies(req);

    if (hasAuthCookies && !req.cookies?.[CSRF_COOKIE_NAME]) {
      const csrfToken = generateCsrfToken();
      res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions(CSRF_COOKIE_MAX_AGE));
      req.cookies[CSRF_COOKIE_NAME] = csrfToken;
    }

    if (isSafeMethod) {
      return next();
    }
    if (!hasAuthCookies) {
      return next();
    }

    const origin = normalizeOriginValue(req.headers?.origin);
    const refererOrigin = normalizeOriginValue(getOriginFromReferer(req.headers?.referer));
    const requestOrigin = origin || refererOrigin;

    if (!requestOrigin) {
      return res.status(403).json({
        success: false,
        error: "CSRF validation failed: origin is required",
      });
    } else if (!isOriginAllowed(requestOrigin)) {
      return res.status(403).json({
        success: false,
        error: "CSRF validation failed: origin is not allowed",
      });
    }

    if (CSRF_TOKEN_OPTIONAL_PATHS.has(req.path)) {
      return next();
    }

    const csrfCookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const csrfHeaderToken = req.headers?.[CSRF_HEADER_NAME] || req.get?.("X-CSRF-Token");

    if (!isTokenMatch(csrfCookieToken, csrfHeaderToken)) {
      return res.status(403).json({
        success: false,
        error: "CSRF validation failed: invalid token",
      });
    }

    return next();
  };
};
