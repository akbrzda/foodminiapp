import {
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  getCsrfCookieOptions,
  getClearCsrfCookieOptions,
} from "../../config/auth.js";

export const setAccessCookie = (res, token, maxAge) => {
  res.cookie("access_token", token, getAuthCookieOptions(maxAge));
};

export const setRefreshCookie = (res, token, maxAge) => {
  res.cookie("refresh_token", token, getAuthCookieOptions(maxAge));
};

export const setCsrfCookie = (res, token, maxAge) => {
  res.cookie("csrf_token", token, getCsrfCookieOptions(maxAge));
};

export const clearAuthCookies = (res) => {
  const clearOptions = getClearAuthCookieOptions();
  res.clearCookie("access_token", clearOptions);
  res.clearCookie("refresh_token", clearOptions);
  res.clearCookie("csrf_token", getClearCsrfCookieOptions());
};
