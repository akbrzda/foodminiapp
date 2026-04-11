import { extractBearerToken } from "../../config/auth.js";
import {
  getAccessTokenCandidates,
  getRefreshTokenCandidates,
  hasAnyAuthCookies,
  setAccessCookie,
  setRefreshCookie,
  setCsrfCookie,
  clearAuthCookies,
} from "./auth.cookies.js";
import { requireMiniAppPayload } from "./auth.schemas.js";
import { authService } from "./auth.service.js";
import { isDomainError } from "../../shared/errors/domain-error.js";

const handleAuthError = (error, res, next) => {
  if (isDomainError(error)) {
    return res.status(error.status || 500).json({
      error: error.message,
      code: error.code,
      details: error.details || undefined,
    });
  }
  return next(error);
};

const getRequestIp = (req) => req?.ip || req?.connection?.remoteAddress || null;
const getRequestUserAgent = (req) => req?.get?.("user-agent") || null;

export const authController = {
  miniapp: async (req, res, next) => {
    try {
      const { platform, initData, phone } = requireMiniAppPayload(req.body || {});
      const result = await authService.loginMiniApp({
        platform,
        initData,
        phone,
        ipAddress: getRequestIp(req),
        tenantId: Number(req.tenantContext?.tenantId || 0) || null,
      });

      setAccessCookie(res, result.tokens.accessToken, result.tokens.accessMaxAge, { type: "client" });
      setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshMaxAge, { type: "client" });
      setCsrfCookie(res, result.csrfToken, result.tokens.refreshMaxAge);

      return res.json({
        user: result.user,
        csrfToken: result.csrfToken,
      });
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

      setAccessCookie(res, result.tokens.accessToken, result.tokens.accessMaxAge, { type: "admin" });
      setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshMaxAge, { type: "admin" });
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
      const refreshTokenCandidates = getRefreshTokenCandidates(req);
      const result = await authService.refreshSession({
        refreshTokens: refreshTokenCandidates,
        ipAddress: getRequestIp(req),
      });

      setAccessCookie(res, result.tokens.accessToken, result.tokens.accessMaxAge, {
        type: result.sessionType,
      });
      setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshMaxAge, {
        type: result.sessionType,
      });
      setCsrfCookie(res, result.csrfToken, result.tokens.refreshMaxAge);

      return res.json({ ok: true, csrfToken: result.csrfToken });
    } catch (error) {
      return handleAuthError(error, res, next);
    }
  },

  csrf: (req, res, next) => {
    try {
      const result = authService.getCsrf({
        hasAuthCookies: hasAnyAuthCookies(req),
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
        getAccessTokenCandidates(req)[0] || extractBearerToken(req.headers["authorization"]);
      const refreshToken = getRefreshTokenCandidates(req)[0] || null;

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
