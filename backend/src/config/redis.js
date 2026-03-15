import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const isTestEnv = process.env.NODE_ENV === "test";

// Для запуска приложения достаточно указать хост Redis; пароль опционален
const requiredEnvVars = ["REDIS_HOST"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const redisConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  retryStrategy: (times) => {
    if (isTestEnv) {
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: isTestEnv,
};
const redis = new Redis(redisConfig);
redis.on("connect", () => {});
redis.on("error", (error) => {
  console.error("❌ Redis connection error:", error.message);
});
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
