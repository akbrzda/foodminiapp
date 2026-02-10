export const JWT_ISSUER = "miniapp-panda";
export const JWT_AUDIENCE_CLIENT = "miniapp-client";
export const JWT_AUDIENCE_ADMIN = "miniapp-admin";
export const JWT_AUDIENCE_REFRESH_CLIENT = "miniapp-client-refresh";
export const JWT_AUDIENCE_REFRESH_ADMIN = "miniapp-admin-refresh";

export const JWT_ACCESS_AUDIENCES = [JWT_AUDIENCE_CLIENT, JWT_AUDIENCE_ADMIN];
export const JWT_REFRESH_AUDIENCES = [JWT_AUDIENCE_REFRESH_CLIENT, JWT_AUDIENCE_REFRESH_ADMIN];
const COOKIE_SAMESITE_VALUES = new Set(["strict", "lax", "none"]);
const normalizeSameSite = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return COOKIE_SAMESITE_VALUES.has(normalized) ? normalized : null;
};
const resolveCookieSameSite = () => {
  const fromEnv = normalizeSameSite(process.env.AUTH_COOKIE_SAMESITE);
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production" ? "none" : "lax";
};
const resolveCookieSecure = (sameSite) => {
  if (typeof process.env.AUTH_COOKIE_SECURE === "string") {
    const normalized = process.env.AUTH_COOKIE_SECURE.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (sameSite === "none") return true;
  return process.env.NODE_ENV === "production";
};
const getResolvedCookieOptions = (maxAge) => {
  const sameSite = resolveCookieSameSite();
  const secure = resolveCookieSecure(sameSite);
  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge,
    path: "/",
  };
};
const getResolvedClearCookieOptions = () => {
  const sameSite = resolveCookieSameSite();
  const secure = resolveCookieSecure(sameSite);
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  };
};

export const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
};

export const getAuthCookieOptions = (maxAge) => getResolvedCookieOptions(maxAge);

export const getClearAuthCookieOptions = () => getResolvedClearCookieOptions();
