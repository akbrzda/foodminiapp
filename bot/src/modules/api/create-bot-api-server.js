import express from "express";
import { answerCallbackQuery, sendPhotoMessage, sendTextMessage, sendVideoMessage } from "../../services/telegramApi.js";
import { sendTelegramStartMessage } from "../../services/startMessageService.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { createHealthRoutes } from "./routes/health.routes.js";
import { createInternalRoutes } from "./routes/internal.routes.js";
import { createWebhookRoutes } from "./routes/webhook.routes.js";

const defaultTelegramApi = {
  sendTextMessage,
  sendPhotoMessage,
  sendVideoMessage,
  answerCallbackQuery,
};

export const createBotApiServer = ({ commandBot, telegramApi = defaultTelegramApi, sendStartMessage = sendTelegramStartMessage }) => {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(createHealthRoutes());
  app.use(createWebhookRoutes({ commandBot }));
  app.use(createInternalRoutes({ telegramApi, sendStartMessage }));
  app.use(errorHandler);

  return app;
};

export default {
  createBotApiServer,
};
