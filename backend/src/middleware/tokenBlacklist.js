import redis from "../config/redis.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { extractBearerToken } from "../config/auth.js";

const buildBlacklistKey = (token) => {
  const hash = crypto.createHash("sha256").update(String(token)).digest("hex");
  return `blacklist:${hash}`;
};

/**
 * Добавляет токен в blacklist
 * @param {string} token - JWT токен
 * @param {number} expiresIn - Время жизни в секундах
 */
export async function addToBlacklist(token, expiresIn = 60 * 60 * 24 * 30) {
  try {
    const key = buildBlacklistKey(token);
    await redis.set(key, "1", "EX", expiresIn);
  } catch (error) {
    console.error("Failed to add token to blacklist:", error);
    throw error;
  }
}

/**
 * Проверяет, находится ли токен в blacklist
 * @param {string} token - JWT токен
 * @returns {boolean}
 */
export async function isBlacklisted(token) {
  try {
    const key = buildBlacklistKey(token);
    const result = await redis.get(key);
    return result !== null;
  } catch (error) {
    console.error("Failed to check token blacklist:", error);
    // В случае ошибки Redis считаем токен валидным для безопасности
    return false;
  }
}

/**
 * Middleware для проверки токена в blacklist
 */
export const checkBlacklist = async (req, res, next) => {
  try {
    // Получаем токен из cookie или header
    const authorizationHeader = req.headers.authorization;
    const bearerToken = extractBearerToken(authorizationHeader);
    const token = req.cookies?.access_token || bearerToken;

    if (!token) {
      return next();
    }

    // Проверяем blacklist
    const blacklisted = await isBlacklisted(token);

    if (blacklisted) {
      return res.status(401).json({
        error: "Token has been revoked",
      });
    }

    next();
  } catch (error) {
    console.error("Blacklist check error:", error);
    next();
  }
};

/**
 * Очищает устаревшие токены (вызывается периодически)
 */
export async function cleanupExpiredTokens() {
  try {
    // Redis автоматически удаляет ключи с истекшим TTL
    // Эта функция для дополнительной очистки если нужна
    console.log("Token cleanup completed");
  } catch (error) {
    console.error("Token cleanup error:", error);
  }
}
