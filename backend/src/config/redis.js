import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Проверка наличия обязательных переменных окружения
const requiredEnvVars = ["REDIS_HOST", "REDIS_PASSWORD"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const redisConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
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
