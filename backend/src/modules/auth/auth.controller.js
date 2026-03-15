import { extractBearerToken } from "../../config/auth.js";
import {
  setAccessCookie,
  setRefreshCookie,
  setCsrfCookie,
  clearAuthCookies,
} from "./auth.cookies.js";
import { requireTelegramInitData } from "./auth.schemas.js";
import { authService } from "./auth.service.js";
import { isDomainError } from "../../shared/errors/domain-error.js";

const handleAuthError = (error, res, next) => {
  if (isDomainError(error)) {
    return res.status(error.status || 500).json({ error: error.message });
  }
  return next(error);
};

const getRequestIp = (req) => req?.ip || req?.connection?.remoteAddress || null;
const getRequestUserAgent = (req) => req?.get?.("user-agent") || null;

export const authController = {
  telegram: async (req, res, next) => {
    try {
      const initData = requireTelegramInitData(req.body || {});
      const result = await authService.loginTelegram({
        initData,
        ipAddress: getRequestIp(req),
      });

      setAccessCookie(res, result.tokens.accessToken, result.tokens.accessMaxAge);
      setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshMaxAge);
      setCsrfCookie(res, result.csrfToken, result.tokens.refreshMaxAge);

      return res.json({
        user: result.user,
        csrfToken: result.csrfToken,
      });
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  eruda: async (req, res, next) => {
    try {
      const result = await authService.getErudaStatus({ initData: req.body?.initData });
      return res.json(result);
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  adminLogin: async (req, res, next) => {
    try {
      const result = await authService.loginAdmin({
        body: req.body || {},
        ipAddress: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
      });

      setAccessCookie(res, result.tokens.accessToken, result.tokens.accessMaxAge);
      setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshMaxAge);
      setCsrfCookie(res, result.csrfToken, result.tokens.refreshMaxAge);

      return res.json({
        user: result.user,
        csrfToken: result.csrfToken,
      });
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  wsTicket: async (req, res, next) => {
    try {
      const result = await authService.issueWsTicket({
        user: req.user,
        ipAddress: getRequestIp(req),
      });

      return res.json({
        ticket: result.ticket,
        expires_in: result.expiresIn,
      });
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  refresh: async (req, res, next) => {
    try {
      const result = await authService.refreshSession({
        refreshToken: req.cookies?.refresh_token,
        ipAddress: getRequestIp(req),
      });

      setAccessCookie(res, result.tokens.accessToken, result.tokens.accessMaxAge);
      setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshMaxAge);
      setCsrfCookie(res, result.csrfToken, result.tokens.refreshMaxAge);

      return res.json({ ok: true, csrfToken: result.csrfToken });
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  csrf: (req, res, next) => {
    try {
      const result = authService.getCsrf({
        hasAuthCookies: Boolean(req.cookies?.access_token || req.cookies?.refresh_token),
        currentCsrfToken: req.cookies?.csrf_token,
      });

      if (result.shouldSetCookie) {
        setCsrfCookie(res, result.csrfToken, result.maxAge);
      }

      return res.json({ csrfToken: result.csrfToken });
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  session: async (req, res, next) => {
    try {
      const result = await authService.getAdminSession({ user: req.user });
      return res.json(result);
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  logout: async (req, res, next) => {
    try {
      const accessToken =
        req.cookies?.access_token || extractBearerToken(req.headers["authorization"]);
      const refreshToken = req.cookies?.refresh_token;

      const result = await authService.logout({
        accessToken,
        refreshToken,
        ipAddress: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
      });

      clearAuthCookies(res);

      return res.json(result);
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },
};
