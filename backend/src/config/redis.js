import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Конфигурация подключения к Redis
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "redis_password_change_me",
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

// Создание клиента Redis
const redis = new Redis(redisConfig);

// Обработка событий
redis.on("connect", () => {
  console.log("✅ Redis connected successfully");
});

redis.on("error", (error) => {
  console.error("❌ Redis connection error:", error.message);
});

// Проверка подключения
export async function testRedisConnection() {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    console.error("❌ Redis ping error:", error.message);
    return false;
  }
}

export default redis;
