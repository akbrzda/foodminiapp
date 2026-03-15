import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  JWT_ISSUER,
  JWT_AUDIENCE_CLIENT,
  JWT_AUDIENCE_ADMIN,
  JWT_AUDIENCE_REFRESH_CLIENT,
  JWT_AUDIENCE_REFRESH_ADMIN,
  JWT_ACCESS_AUDIENCES,
  JWT_REFRESH_AUDIENCES,
  getJwtSecret,
} from "../../config/auth.js";

const MAX_ADMIN_REFRESH_SESSION_HOURS = 24 * 30;

const resolveAdminRefreshSessionHours = () => {
  const rawValue = String(process.env.ADMIN_REFRESH_SESSION_HOURS || "").trim();
  if (!rawValue) {
    throw new Error("ADMIN_REFRESH_SESSION_HOURS is required");
  }
  const rawHours = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(rawHours) || rawHours < 1) {
    throw new Error("ADMIN_REFRESH_SESSION_HOURS must be a positive integer");
  }
  if (rawHours > MAX_ADMIN_REFRESH_SESSION_HOURS) {
    throw new Error(`ADMIN_REFRESH_SESSION_HOURS must be <= ${MAX_ADMIN_REFRESH_SESSION_HOURS}`);
  }
  return rawHours;
};

const adminRefreshSessionHours = resolveAdminRefreshSessionHours();

export const TOKEN_CONFIG = {
  clientAccessTtl: "15m",
  clientAccessCookieMaxAge: 15 * 60 * 1000,
  adminAccessTtl: "15m",
  adminAccessCookieMaxAge: 15 * 60 * 1000,
  clientRefreshTtl: "7d",
  clientRefreshCookieMaxAge: 7 * 24 * 60 * 60 * 1000,
  adminRefreshTtl: `${adminRefreshSessionHours}h`,
  adminRefreshCookieMaxAge: adminRefreshSessionHours * 60 * 60 * 1000,
  csrfCookieMaxAge: 7 * 24 * 60 * 60 * 1000,
  wsTicketPrefix: "ws_ticket",
  wsTicketTtlSeconds: 45,
  telegramAuthMaxAgeSeconds: 10 * 60,
};

export const TOKEN_AUDIENCES = {
  accessClient: JWT_AUDIENCE_CLIENT,
  accessAdmin: JWT_AUDIENCE_ADMIN,
  refreshClient: JWT_AUDIENCE_REFRESH_CLIENT,
  refreshAdmin: JWT_AUDIENCE_REFRESH_ADMIN,
};

const signToken = (payload, audience, expiresIn) => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn,
    issuer: JWT_ISSUER,
    audience,
    algorithm: "HS256",
  });
};

export const signAccessToken = (payload, audience, expiresIn) =>
  signToken(payload, audience, expiresIn);

export const signRefreshToken = (payload, audience, expiresIn) => {
  return signToken({ ...payload, token_type: "refresh" }, audience, expiresIn);
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_ACCESS_AUDIENCES,
  });
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_REFRESH_AUDIENCES,
  });
};

export const createCsrfToken = () => crypto.randomBytes(32).toString("hex");

export const getTokenTtlSeconds = (decodedToken) => {
  const now = Math.floor(Date.now() / 1000);
  const seconds = Number(decodedToken?.exp) - now;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
};
