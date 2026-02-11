import { createTelegramWorker } from "./telegram.worker.js";
import { createImageWorker } from "./image.worker.js";
import { createOrderAutoStatusWorker } from "./orderAutoStatus.worker.js";
import { createBonusExpiryWorker } from "./bonusExpiry.worker.js";
import { createBirthdayBonusWorker } from "./birthdayBonus.worker.js";
import { createBroadcastWorker } from "./broadcast.worker.js";
import { createTriggerWorker } from "./trigger.worker.js";
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
let birthdayBonusWorker;
let broadcastWorker;
let triggerWorker;
export async function startWorkers() {
  try {
    telegramWorker = createTelegramWorker(redisConnection);
    imageWorker = createImageWorker(redisConnection);
    orderAutoStatusWorker = createOrderAutoStatusWorker();
    bonusExpiryWorker = createBonusExpiryWorker();
    birthdayBonusWorker = createBirthdayBonusWorker();
    broadcastWorker = createBroadcastWorker();
    triggerWorker = createTriggerWorker();
    orderAutoStatusWorker.start();
    bonusExpiryWorker.start();
    birthdayBonusWorker.start();
    broadcastWorker.start();
    triggerWorker.start();
    logger.system.info("Background workers started");
    return {
      telegramWorker,
      imageWorker,
    };
  } catch (error) {
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
    if (birthdayBonusWorker) {
      birthdayBonusWorker.stop();
    }
    if (broadcastWorker) {
      broadcastWorker.stop();
    }
    if (triggerWorker) {
      triggerWorker.stop();
    }
    await Promise.all(promises);
    logger.system.shutdown("Background workers stopped");
  } catch (error) {
    logger.system.dbError(`Error stopping workers: ${error.message}`);
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
    logger.system.dbError(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}
export default {
  startWorkers,
  stopWorkers,
};
