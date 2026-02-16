import { createTelegramWorker } from "./telegram.worker.js";
import { createImageWorker } from "./image.worker.js";
import { createOrderAutoStatusWorker } from "./orderAutoStatus.worker.js";
import { createBonusExpiryWorker } from "./bonusExpiry.worker.js";
import { createBirthdayBonusWorker } from "./birthdayBonus.worker.js";
import { createBroadcastWorker } from "./broadcast.worker.js";
import { createTriggerWorker } from "./trigger.worker.js";
import { createIikoMenuSyncWorker } from "./iikoMenuSync.worker.js";
import { createIikoDeliveryZonesWorker } from "./iikoDeliveryZones.worker.js";
import { createIntegrationSchedulerWorker } from "./integrationScheduler.worker.js";
import { createIntegrationRetryWorker } from "./integrationRetry.worker.js";
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
let iikoMenuSyncWorker;
let iikoOrderSyncWorker;
let pbClientSyncWorker;
let pbPurchaseSyncWorker;
let iikoDeliveryZonesWorker;
let integrationSchedulerWorker;
let integrationRetryWorker;
export async function startWorkers() {
  try {
    telegramWorker = createTelegramWorker(redisConnection);
    imageWorker = createImageWorker(redisConnection);
    orderAutoStatusWorker = createOrderAutoStatusWorker();
    bonusExpiryWorker = createBonusExpiryWorker();
    birthdayBonusWorker = createBirthdayBonusWorker();
    broadcastWorker = createBroadcastWorker();
    triggerWorker = createTriggerWorker();
    iikoMenuSyncWorker = createIikoMenuSyncWorker(redisConnection);
    // Временно отключен stoplist sync: доработки режима меню.
    // Временно отключены воркеры синхронизации заказов/клиентов интеграций.
    // iikoOrderSyncWorker = createIikoOrderSyncWorker(redisConnection);
    // pbClientSyncWorker = createPbClientSyncWorker(redisConnection);
    // pbPurchaseSyncWorker = createPbPurchaseSyncWorker(redisConnection);
    iikoDeliveryZonesWorker = createIikoDeliveryZonesWorker();
    integrationSchedulerWorker = createIntegrationSchedulerWorker();
    integrationRetryWorker = createIntegrationRetryWorker();
    orderAutoStatusWorker.start();
    bonusExpiryWorker.start();
    birthdayBonusWorker.start();
    broadcastWorker.start();
    triggerWorker.start();
    // Временно отключаем автоматические интеграционные синхронизации.
    // Ручная синхронизация меню через очередь остается доступной.
    logger.system.info("Background workers started");
    return {
      telegramWorker,
      imageWorker,
      iikoMenuSyncWorker,
      iikoOrderSyncWorker,
      pbClientSyncWorker,
      pbPurchaseSyncWorker,
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
    if (iikoOrderSyncWorker) {
      promises.push(iikoOrderSyncWorker.close());
    }
    if (pbClientSyncWorker) {
      promises.push(pbClientSyncWorker.close());
    }
    if (pbPurchaseSyncWorker) {
      promises.push(pbPurchaseSyncWorker.close());
    }
    if (iikoMenuSyncWorker) {
      promises.push(iikoMenuSyncWorker.close());
    }
    if (iikoDeliveryZonesWorker) {
      iikoDeliveryZonesWorker.stop();
    }
    if (integrationSchedulerWorker) {
      integrationSchedulerWorker.stop();
    }
    if (integrationRetryWorker) {
      integrationRetryWorker.stop();
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
