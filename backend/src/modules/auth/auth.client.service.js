import { parseTelegramUser, validateTelegramData } from "../../utils/telegram.js";
import { normalizePhone } from "../../utils/phone.js";
import { decryptPhone } from "../../utils/encryption.js";
import { logger } from "../../utils/logger.js";
import { authRepository } from "./auth.repository.js";
import { buildClientAuthPayload } from "./auth.mapper.js";
import {
  TOKEN_AUDIENCES,
  TOKEN_CONFIG,
  createCsrfToken,
  signAccessToken,
  signRefreshToken,
} from "./auth.tokens.js";
import { DomainError } from "../../shared/errors/domain-error.js";
import { AuthError, authError } from "../../shared/errors/auth-errors.js";
import { ValidationError } from "../../shared/errors/validation-errors.js";

const getRequiredBotToken = () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  return typeof botToken === "string" && botToken.trim().length > 0 ? botToken.trim() : null;
};

const updateTelegramUserProfile = async ({ user, firstName, lastName }) => {
  const updates = {};

  if (firstName && user.first_name !== firstName) {
    updates.first_name = firstName;
  }

  if (lastName && user.last_name !== lastName) {
    updates.last_name = lastName;
  }

  if (user.registration_type !== "miniapp") {
    updates.registration_type = "miniapp";
  }

  await authRepository.updateUserById(user.id, updates);
};

const normalizeStoredPhone = async (user) => {
  if (!user?.phone) return user;

  try {
    const decryptedPhone = decryptPhone(user.phone);
    const normalizedPhone = normalizePhone(decryptedPhone);

    if (normalizedPhone && normalizedPhone !== user.phone) {
      await authRepository.updateUserById(user.id, { phone: normalizedPhone });
      return {
        ...user,
        phone: normalizedPhone,
      };
    }
  } catch (error) {
    // Если телефон в неизвестном формате, оставляем значение как есть.
  }

  return user;
};

const buildTokensForClient = (payload) => {
  const accessToken = signAccessToken(
    payload,
    TOKEN_AUDIENCES.accessClient,
    TOKEN_CONFIG.clientAccessTtl
  );
  const refreshToken = signRefreshToken(
    payload,
    TOKEN_AUDIENCES.refreshClient,
    TOKEN_CONFIG.clientRefreshTtl
  );

  return {
    accessToken,
    refreshToken,
    accessMaxAge: TOKEN_CONFIG.clientAccessCookieMaxAge,
    refreshMaxAge: TOKEN_CONFIG.clientRefreshCookieMaxAge,
  };
};

export const loginTelegram = async ({ initData, ipAddress }) => {
  const params = new URLSearchParams(initData);
  const parsedUser = parseTelegramUser(initData);
  if (!parsedUser) {
    throw new ValidationError("Telegram data is required");
  }

  const telegramId = parsedUser.telegram_id;
  const firstName = parsedUser.first_name;
  const lastName = parsedUser.last_name;
  const authDate = Number(params.get("auth_date"));
  const hash = params.get("hash");

  if (!telegramId || !hash) {
    throw new ValidationError("Telegram data is required");
  }

  const botToken = getRequiredBotToken();
  if (!botToken) {
    throw new DomainError({
      status: 500,
      code: "AUTH_CONFIG_ERROR",
      message: "Server misconfiguration: TELEGRAM_BOT_TOKEN is required",
    });
  }

  const isValid = validateTelegramData(initData, botToken);
  if (!isValid) {
    throw authError.invalidTelegramData();
  }

  const authAge = Date.now() / 1000 - Number(authDate);
  if (!Number.isFinite(authAge)) {
    throw new ValidationError("Telegram data is required");
  }

  if (authAge > TOKEN_CONFIG.telegramAuthMaxAgeSeconds) {
    throw authError.telegramDataTooOld();
  }

  let user = await authRepository.findUserByTelegramId(telegramId);
  let userId;

  if (user) {
    userId = user.id;
    await updateTelegramUserProfile({ user, firstName, lastName });
    user = await authRepository.findUserById(userId);
    user = await normalizeStoredPhone(user);
  } else {
    userId = await authRepository.insertTelegramUser({ telegramId, firstName, lastName });
    await authRepository.setInitialLoyaltyForUser(userId);
    user = await authRepository.findUserById(userId);
  }

  const authPayload = buildClientAuthPayload({ userId, telegramId });
  const tokens = buildTokensForClient(authPayload);
  const csrfToken = createCsrfToken();

  await logger.auth.login(userId, "client", ipAddress);

  return {
    user,
    csrfToken,
    tokens,
  };
};

export const getErudaStatus = async ({ initData }) => {
  if (!initData) {
    throw new ValidationError("Telegram initData is required");
  }

  const parsedUser = parseTelegramUser(initData);
  if (!parsedUser?.telegram_id) {
    throw new ValidationError("Telegram data is required");
  }

  const botToken = getRequiredBotToken();
  if (!botToken) {
    throw new DomainError({
      status: 500,
      code: "AUTH_CONFIG_ERROR",
      message: "Server misconfiguration: TELEGRAM_BOT_TOKEN is required",
    });
  }

  const isValid = validateTelegramData(initData, botToken);
  if (!isValid) {
    throw authError.invalidTelegramData();
  }

  const admin = await authRepository.findAdminByTelegramId(parsedUser.telegram_id);
  if (!admin || !admin.is_active) {
    throw new AuthError("Admin account not found or inactive", 401, "AUTH_ADMIN_NOT_FOUND");
  }

  return {
    enabled: Boolean(admin.eruda_enabled),
  };
};
