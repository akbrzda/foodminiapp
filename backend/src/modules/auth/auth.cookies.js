import {
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  getCsrfCookieOptions,
  getClearCsrfCookieOptions,
} from "../../config/auth.js";

export const AUTH_COOKIE_NAMES = {
  accessClient: "access_token_client",
  accessAdmin: "access_token_admin",
  refreshClient: "refresh_token_client",
  refreshAdmin: "refresh_token_admin",
  accessLegacy: "access_token",
  refreshLegacy: "refresh_token",
  csrf: "csrf_token",
};

const resolveAccessCookieName = (type) =>
  type === "admin" ? AUTH_COOKIE_NAMES.accessAdmin : AUTH_COOKIE_NAMES.accessClient;

const resolveRefreshCookieName = (type) =>
  type === "admin" ? AUTH_COOKIE_NAMES.refreshAdmin : AUTH_COOKIE_NAMES.refreshClient;

export const setAccessCookie = (res, token, maxAge, { type = "client" } = {}) => {
  res.cookie(resolveAccessCookieName(type), token, getAuthCookieOptions(maxAge));
};

export const setRefreshCookie = (res, token, maxAge, { type = "client" } = {}) => {
  res.cookie(resolveRefreshCookieName(type), token, getAuthCookieOptions(maxAge));
};

export const setCsrfCookie = (res, token, maxAge) => {
  res.cookie(AUTH_COOKIE_NAMES.csrf, token, getCsrfCookieOptions(maxAge));
};

export const getAccessTokenCandidates = (req) => {
  const path = String(req?.path || req?.originalUrl || "");
  const isAdminPath = path.startsWith("/api/admin") || path.includes("/api/auth/session");
  const cookies = req?.cookies || {};

  const orderedNames = isAdminPath
    ? [
        AUTH_COOKIE_NAMES.accessAdmin,
        AUTH_COOKIE_NAMES.accessClient,
        AUTH_COOKIE_NAMES.accessLegacy,
      ]
    : [
        AUTH_COOKIE_NAMES.accessClient,
        AUTH_COOKIE_NAMES.accessAdmin,
        AUTH_COOKIE_NAMES.accessLegacy,
      ];

  return orderedNames.map((name) => cookies[name]).filter(Boolean);
};

export const getRefreshTokenCandidates = (req) => {
  const cookies = req?.cookies || {};
  return [
    cookies[AUTH_COOKIE_NAMES.refreshClient],
    cookies[AUTH_COOKIE_NAMES.refreshAdmin],
    cookies[AUTH_COOKIE_NAMES.refreshLegacy],
  ].filter(Boolean);
};

export const hasAnyAuthCookies = (req) => {
  const cookies = req?.cookies || {};
  return Boolean(
    cookies[AUTH_COOKIE_NAMES.accessClient] ||
      cookies[AUTH_COOKIE_NAMES.accessAdmin] ||
      cookies[AUTH_COOKIE_NAMES.accessLegacy] ||
      cookies[AUTH_COOKIE_NAMES.refreshClient] ||
      cookies[AUTH_COOKIE_NAMES.refreshAdmin] ||
      cookies[AUTH_COOKIE_NAMES.refreshLegacy]
  );
};

export const clearAuthCookies = (res) => {
  const clearOptions = getClearAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAMES.accessClient, clearOptions);
  res.clearCookie(AUTH_COOKIE_NAMES.accessAdmin, clearOptions);
  res.clearCookie(AUTH_COOKIE_NAMES.refreshClient, clearOptions);
  res.clearCookie(AUTH_COOKIE_NAMES.refreshAdmin, clearOptions);
  // Backward compatibility: очищаем legacy cookies тоже.
  res.clearCookie(AUTH_COOKIE_NAMES.accessLegacy, clearOptions);
  res.clearCookie(AUTH_COOKIE_NAMES.refreshLegacy, clearOptions);
  res.clearCookie(AUTH_COOKIE_NAMES.csrf, getClearCsrfCookieOptions());
};
