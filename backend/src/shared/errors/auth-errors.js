import { DomainError } from "./domain-error.js";

export class AuthError extends DomainError {
  constructor(message, status = 401, code = "AUTH_ERROR", details = null) {
    super({ message, status, code, details });
    this.name = "AuthError";
  }
}

export const authError = {
  invalidTelegramData: () =>
    new AuthError("Invalid Telegram data", 403, "AUTH_INVALID_TELEGRAM_DATA"),
  telegramDataTooOld: () =>
    new AuthError("Auth data is too old", 403, "AUTH_TELEGRAM_DATA_TOO_OLD"),
  refreshTokenRequired: () => new AuthError("Refresh token required", 401, "AUTH_REFRESH_REQUIRED"),
  refreshTokenRevoked: () =>
    new AuthError("Refresh token has been revoked", 401, "AUTH_REFRESH_REVOKED"),
  invalidRefreshToken: () =>
    new AuthError("Invalid or expired refresh token", 401, "AUTH_REFRESH_INVALID"),
  invalidRefreshPayload: () =>
    new AuthError("Invalid refresh token payload", 403, "AUTH_REFRESH_PAYLOAD_INVALID"),
  invalidSessionType: () => new AuthError("Invalid session type", 403, "AUTH_SESSION_TYPE_INVALID"),
  authRequired: () => new AuthError("Authentication required", 401, "AUTH_REQUIRED"),
};
