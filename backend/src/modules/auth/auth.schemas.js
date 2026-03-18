import { ValidationError } from "../../shared/errors/validation-errors.js";

export const MINIAPP_PLATFORMS = {
  TELEGRAM: "telegram",
  MAX: "max",
};

export const requireMiniAppPayload = (body) => {
  const platform = typeof body?.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const initData = typeof body?.initData === "string" ? body.initData.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;

  if (!platform || !Object.values(MINIAPP_PLATFORMS).includes(platform)) {
    throw new ValidationError("Valid platform is required");
  }

  if (!initData) {
    throw new ValidationError("MiniApp initData is required");
  }

  return { platform, initData, phone };
};

export const requireAdminCredentials = (body) => {
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    throw new ValidationError("Email and password are required");
  }

  return { email, password };
};
