import { getMiniAppAuthDate, parseMiniAppUser, validateMiniAppInitData } from "../../utils/miniapp.js";
import { normalizePhone } from "../../utils/phone.js";
import { decryptPhone, decryptUserData } from "../../utils/encryption.js";
import { logger } from "../../utils/logger.js";
import { getSystemSettings } from "../../utils/settings.js";
import { sendMaxNotificationMessageViaBot, sendStartMessage } from "../../utils/botService.js";
import { authRepository } from "./auth.repository.js";
import { buildClientAuthPayload } from "./auth.mapper.js";
import { MINIAPP_PLATFORMS } from "./auth.schemas.js";
import {
  TOKEN_AUDIENCES,
  TOKEN_CONFIG,
  createCsrfToken,
  signAccessToken,
  signRefreshToken,
} from "./auth.tokens.js";
import { DomainError } from "../../shared/errors/domain-error.js";
import { AuthError } from "../../shared/errors/auth-errors.js";
import { ValidationError } from "../../shared/errors/validation-errors.js";

const getRequiredBotTokenByPlatform = (platform) => {
  const envKey = platform === MINIAPP_PLATFORMS.MAX ? "MAX_BOT_TOKEN" : "TELEGRAM_BOT_TOKEN";
  const botToken = process.env[envKey];
  return typeof botToken === "string" && botToken.trim().length > 0 ? botToken.trim() : null;
};

const updateMiniAppUserProfile = async ({ user, firstName, lastName }) => {
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

const normalizeAuthDateSeconds = (rawAuthDate) => {
  if (!Number.isFinite(rawAuthDate)) {
    return null;
  }

  if (rawAuthDate > 10 ** 12) {
    return Math.floor(rawAuthDate / 1000);
  }

  return Math.floor(rawAuthDate);
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

const resolveExistingUserByPhoneFirst = async ({ platform, externalId, normalizedPhone }) => {
  let user = await authRepository.findUserByExternalAccount({ platform, externalId });
  if (user) {
    return user;
  }

  if (normalizedPhone) {
    user = await authRepository.findUserByPhone(normalizedPhone);
    if (user) {
      return user;
    }
  }

  return null;
};

const ensureExternalAccountBinding = async ({ userId, platform, externalId }) => {
  const existing = await authRepository.findExternalAccount({ platform, externalId });
  if (existing && Number(existing.user_id) !== Number(userId)) {
    throw new AuthError("External account already linked", 409, "AUTH_EXTERNAL_ACCOUNT_CONFLICT");
  }

  if (existing) {
    return;
  }

  try {
    await authRepository.insertExternalAccount({ userId, platform, externalId });
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") {
      throw error;
    }

    const linkedAccount = await authRepository.findExternalAccount({ platform, externalId });
    if (!linkedAccount || Number(linkedAccount.user_id) !== Number(userId)) {
      throw new AuthError("External account already linked", 409, "AUTH_EXTERNAL_ACCOUNT_CONFLICT");
    }
  }
};

const buildMaxStartReplyMarkup = (config) => {
  const buttonText = String(config?.button_text || "").trim();
  const buttonUrl = String(config?.button_url || "").trim();
  if (!buttonText || !buttonUrl) return null;

  const buttonType = String(config?.button_type || "open_app")
    .trim()
    .toLowerCase();

  if (buttonType === "open_app") {
    return {
      inline_keyboard: [
        [
          {
            text: buttonText,
            web_app: {
              url: buttonUrl,
            },
          },
        ],
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        {
          text: buttonText,
          url: buttonUrl,
        },
      ],
    ],
  };
};

const buildMaxStartMessageText = (config) => {
  const text = String(config?.text || "").trim();
  const images = Array.isArray(config?.images) ? config.images : [];
  const activeImage = images.find((image) => image?.is_active !== false && image?.url)?.url || String(config?.image_url || "").trim();
  if (!activeImage) return text;
  if (!text) return `Изображение: ${activeImage}`;
  return `${text}\n\nИзображение: ${activeImage}`;
};

const sendStartMessagesForNewUser = async ({ userId, isNewUser }) => {
  if (!isNewUser) return;

  try {
    const settings = await getSystemSettings();
    const accounts = await authRepository.listExternalAccountsByUserId(userId);

    const telegramConfig = settings?.telegram_start_message || {};
    const telegramEnabled = telegramConfig?.enabled !== false;
    const maxConfig = settings?.max_start_message || {};
    const maxEnabled = maxConfig?.enabled !== false;

    for (const account of accounts) {
      const platform = String(account?.platform || "")
        .trim()
        .toLowerCase();
      const externalId = Number(account?.external_id);

      if (platform === MINIAPP_PLATFORMS.TELEGRAM && telegramEnabled && Number.isInteger(externalId) && externalId > 0) {
        await sendStartMessage({
          telegramId: externalId,
          settings,
        });
        continue;
      }

      if (platform === MINIAPP_PLATFORMS.MAX && maxEnabled && Number.isInteger(externalId) && externalId > 0) {
        const message = buildMaxStartMessageText(maxConfig);
        if (!message) continue;
        await sendMaxNotificationMessageViaBot({
          maxId: externalId,
          message,
          replyMarkup: buildMaxStartReplyMarkup(maxConfig),
        });
      }
    }
  } catch (error) {
    logger.warn("Не удалось отправить welcome-сообщения после регистрации", {
      user_id: userId,
      error: error?.message || String(error),
    });
  }
};

export const loginMiniApp = async ({ platform, initData, phone, ipAddress }) => {
  const parsedUser = parseMiniAppUser(initData);
  if (!parsedUser?.id) {
    throw new ValidationError("MiniApp data is required");
  }

  const externalId = String(parsedUser.id);
  const firstName = parsedUser.firstName;
  const lastName = parsedUser.lastName;

  const botToken = getRequiredBotTokenByPlatform(platform);
  if (!botToken) {
    const envKey = platform === MINIAPP_PLATFORMS.MAX ? "MAX_BOT_TOKEN" : "TELEGRAM_BOT_TOKEN";
    throw new DomainError({
      status: 500,
      code: "AUTH_CONFIG_ERROR",
      message: `Server misconfiguration: ${envKey} is required`,
    });
  }

  const isValid = validateMiniAppInitData(initData, botToken);
  if (!isValid) {
    throw new AuthError("Invalid MiniApp initData", 401, "AUTH_MINIAPP_DATA_INVALID");
  }

  const authDate = normalizeAuthDateSeconds(getMiniAppAuthDate(initData));
  const authAge = Number.isFinite(authDate) ? Date.now() / 1000 - authDate : Number.NaN;
  if (!Number.isFinite(authAge)) {
    throw new ValidationError("MiniApp data is required");
  }

  if (authAge > TOKEN_CONFIG.telegramAuthMaxAgeSeconds) {
    throw new AuthError("MiniApp data is too old", 401, "AUTH_MINIAPP_DATA_TOO_OLD");
  }

  const normalizedPhone = normalizePhone(phone);
  if (phone && !normalizedPhone) {
    throw new ValidationError("Invalid phone format");
  }

  let user = await resolveExistingUserByPhoneFirst({
    platform,
    externalId,
    normalizedPhone,
  });
  let userId;
  let isNewUser = false;

  if (user) {
    userId = user.id;
    await updateMiniAppUserProfile({ user, firstName, lastName });
    await ensureExternalAccountBinding({ userId, platform, externalId });
    user = await authRepository.findUserById(userId);
    user = await normalizeStoredPhone(user);
  } else {
    if (!normalizedPhone) {
      throw new DomainError({
        status: 428,
        code: "AUTH_PHONE_REQUIRED",
        message: "Phone confirmation is required",
      });
    }

    userId = await authRepository.insertMiniAppUser({ firstName, lastName });
    isNewUser = true;
    await authRepository.updateUserById(userId, { phone: normalizedPhone });
    await ensureExternalAccountBinding({ userId, platform, externalId });
    await authRepository.setInitialLoyaltyForUser(userId);
    user = await authRepository.findUserById(userId);
  }

  const authPayload = buildClientAuthPayload({
    userId,
  });
  const tokens = buildTokensForClient(authPayload);
  const csrfToken = createCsrfToken();

  await logger.auth.login(userId, "client", ipAddress, { source_platform: platform });
  await sendStartMessagesForNewUser({ userId, isNewUser });

  return {
    user: decryptUserData(user),
    csrfToken,
    tokens,
  };
};
