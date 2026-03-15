import { ValidationError } from "../../shared/errors/validation-errors.js";

export const requireTelegramInitData = (body) => {
  const initData = body?.initData;
  if (!initData || typeof initData !== "string") {
    throw new ValidationError("Telegram initData is required");
  }
  return initData;
};

export const requireAdminCredentials = (body) => {
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    throw new ValidationError("Email and password are required");
  }

  return { email, password };
};
