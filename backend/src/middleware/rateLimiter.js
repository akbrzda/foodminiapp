import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import redis from "../config/redis.js";
import { logger } from "../utils/logger.js";

// Базовый rate limiter для общих API запросов
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // 1000 запросов на IP
  message: { error: "Слишком много запросов с этого IP, попробуйте позже" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Строгий лимит для авторизации
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // 10 попыток входа
  message: { error: "Слишком много попыток входа. Попробуйте через 15 минут" },
  skipSuccessfulRequests: true, // Не считать успешные попытки
  standardHeaders: true,
  legacyHeaders: false,
});

// Отдельный лимит для обновления сессии, чтобы не блокировать вход
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 60, // 60 попыток обновления
  message: { error: "Слишком много попыток обновить сессию. Попробуйте через 15 минут" },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// Более мягкий лимит для Telegram Mini App, чтобы не ухудшать UX при переоткрытии webview.
export const telegramAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 30, // 30 попыток входа
  message: { error: "Слишком много попыток входа через Telegram. Попробуйте через 15 минут" },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// Лимит для создания ресурсов
export const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 30, // 30 запросов в минуту
  message: { error: "Слишком быстрое создание ресурсов. Подождите немного" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Лимит для заказов
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 20, // 20 заказов в час на пользователя
  message: { error: "Слишком много заказов. Попробуйте позже" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Используем user ID если доступен, иначе IP с правильной обработкой IPv6
    return req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req);
  },
});

// Redis-based rate limiter для более точного контроля
export const redisRateLimiter = (options = {}) => {
  const {
    prefix = "rate_limit",
    windowMs = 60000, // 1 минута по умолчанию
    max = 60, // 60 запросов по умолчанию
    message = "Rate limit exceeded",
    failOpen = false,
    fallbackStatus = 503,
    fallbackMessage = "Сервис временно недоступен",
    keyGenerator = (req) => req.user?.id || ipKeyGenerator(req),
  } = options;

  return async (req, res, next) => {
    try {
      const identifier = keyGenerator(req);
      const key = `${prefix}:${identifier}`;

      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > max) {
        return res.status(429).json({ error: message });
      }

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - current));

      next();
    } catch (error) {
      console.error("Rate limiter error:", error);
      if (failOpen) {
        return next();
      }
      return res.status(fallbackStatus).json({ error: fallbackMessage });
    }
  };
};

// Middleware для специфичных операций
export const strictAuthLimiter = redisRateLimiter({
  prefix: "auth_strict",
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // Только 5 попыток
  message: "Слишком много неудачных попыток входа. Аккаунт временно заблокирован",
  failOpen: false,
  fallbackStatus: 503,
  fallbackMessage: "Авторизация временно недоступна, попробуйте позже",
});

// Строгий limiter для чувствительных защищенных маршрутов
export const sensitiveRouteLimiter = redisRateLimiter({
  prefix: "sensitive_routes",
  windowMs: 60 * 1000, // 1 минута
  max: 60, // 60 запросов на IP в минуту к защищенным маршрутам
  message: "Слишком много запросов к защищенным маршрутам. Попробуйте позже",
  failOpen: true,
  keyGenerator: (req) => ipKeyGenerator(req),
});

// Временная блокировка IP при массовых 401/403 на защищенных маршрутах
export const unauthorizedBanShield = (options = {}) => {
  const {
    strikeWindowMs = 5 * 60 * 1000, // 5 минут
    maxStrikes = 15, // 15 неуспешных попыток
    banMs = 30 * 60 * 1000, // 30 минут
  } = options;

  return async (req, res, next) => {
    const ip = ipKeyGenerator(req);
    const banKey = `auth_shield:ban:${ip}`;

    try {
      const ttl = await redis.ttl(banKey);
      if (ttl > 0) {
        res.setHeader("Retry-After", String(ttl));
        return res.status(429).json({
          error: "IP временно заблокирован из-за большого числа неуспешных попыток авторизации",
          retry_after_seconds: ttl,
        });
      }
    } catch (error) {
      logger.system.warn("Ошибка проверки временной блокировки IP", { ip, error: error.message });
    }

    res.on("finish", async () => {
      if (![401, 403].includes(res.statusCode)) return;

      const strikesKey = `auth_shield:strikes:${ip}`;
      try {
        const strikes = await redis.incr(strikesKey);
        if (strikes === 1) {
          await redis.expire(strikesKey, Math.ceil(strikeWindowMs / 1000));
        }

        if (strikes >= maxStrikes) {
          await redis.set(banKey, "1", "EX", Math.ceil(banMs / 1000));
          await redis.del(strikesKey);
          logger.system.warn("IP заблокирован из-за подозрительной активности", {
            ip,
            path: req.originalUrl,
            ban_seconds: Math.ceil(banMs / 1000),
          });
        }
      } catch (error) {
        logger.system.warn("Ошибка фиксации неуспешной попытки авторизации", {
          ip,
          path: req.originalUrl,
          error: error.message,
        });
      }
    });

    return next();
  };
};
