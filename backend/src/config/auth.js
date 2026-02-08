export const JWT_ISSUER = "miniapp-panda";
export const JWT_AUDIENCE_CLIENT = "miniapp-client";
export const JWT_AUDIENCE_ADMIN = "miniapp-admin";
export const JWT_AUDIENCE_REFRESH_CLIENT = "miniapp-client-refresh";
export const JWT_AUDIENCE_REFRESH_ADMIN = "miniapp-admin-refresh";

export const JWT_ACCESS_AUDIENCES = [JWT_AUDIENCE_CLIENT, JWT_AUDIENCE_ADMIN];
export const JWT_REFRESH_AUDIENCES = [JWT_AUDIENCE_REFRESH_CLIENT, JWT_AUDIENCE_REFRESH_ADMIN];

export const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
};

export const getAuthCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge,
  path: "/",
});

export const getClearAuthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
});
