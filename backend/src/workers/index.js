import { createTelegramWorker } from "./telegram.worker.js";
import { createImageWorker } from "./image.worker.js";
import { createOrderAutoStatusWorker } from "./orderAutoStatus.worker.js";
import { createBonusExpiryWorker } from "./bonusExpiry.worker.js";
import { createLevelRecalcWorker } from "./levelRecalc.worker.js";
import { createLevelDegradationWorker } from "./levelDegradation.worker.js";
import { createBalanceReconcileWorker } from "./balanceReconcile.worker.js";
import { createBirthdayBonusWorker } from "./birthdayBonus.worker.js";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";
dotenv.config();
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "redis_password_change_me",
  maxRetriesPerRequest: null,
});
let telegramWorker;
let imageWorker;
let orderAutoStatusWorker;
let bonusExpiryWorker;
let levelRecalcWorker;
let levelDegradationWorker;
let balanceReconcileWorker;
let birthdayBonusWorker;
export async function startWorkers() {
  try {
    telegramWorker = createTelegramWorker(redisConnection);
    imageWorker = createImageWorker(redisConnection);
    orderAutoStatusWorker = createOrderAutoStatusWorker();
    bonusExpiryWorker = createBonusExpiryWorker();
    levelRecalcWorker = createLevelRecalcWorker();
    levelDegradationWorker = createLevelDegradationWorker();
    balanceReconcileWorker = createBalanceReconcileWorker();
    birthdayBonusWorker = createBirthdayBonusWorker();
    orderAutoStatusWorker.start();
    bonusExpiryWorker.start();
    levelRecalcWorker.start();
    levelDegradationWorker.start();
    balanceReconcileWorker.start();
    birthdayBonusWorker.start();
    logger.system.startup("Background workers started");
    return {
      telegramWorker,
      imageWorker,
    };
  } catch (error) {
    console.error("❌ Failed to start workers:", error);
    logger.system.dbError(`Failed to start workers: ${error.message}`);
    throw error;
  }
}
export async function stopWorkers() {
  try {
    const promises = [];
    if (telegramWorker) {
      promises.push(telegramWorker.close());
    }
    if (imageWorker) {
      promises.push(imageWorker.close());
    }
    if (orderAutoStatusWorker) {
      orderAutoStatusWorker.stop();
    }
    if (bonusExpiryWorker) {
      bonusExpiryWorker.stop();
    }
    if (levelRecalcWorker) {
      levelRecalcWorker.stop();
    }
    if (levelDegradationWorker) {
      levelDegradationWorker.stop();
    }
    if (balanceReconcileWorker) {
      balanceReconcileWorker.stop();
    }
    if (birthdayBonusWorker) {
      birthdayBonusWorker.stop();
    }
    await Promise.all(promises);
    logger.system.shutdown("Background workers stopped");
  } catch (error) {
    console.error("❌ Error stopping workers:", error);
    throw error;
  }
}
process.on("SIGTERM", async () => {
  await stopWorkers();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await stopWorkers();
  process.exit(0);
});
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkers().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
export default {
  startWorkers,
  stopWorkers,
};
