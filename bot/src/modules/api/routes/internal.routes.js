import { Router } from "express";
import { createInternalTelegramController } from "../controllers/internal-telegram.controller.js";
import { requireInternalToken } from "../middlewares/internal-token.middleware.js";
import { validateBody } from "../middlewares/validation.middleware.js";
import {
  validateAnswerCallbackPayload,
  validateBroadcastPayload,
  validateNotificationPayload,
  validateStartMessagePayload,
} from "../schemas/internal-telegram.schemas.js";

export const createInternalRoutes = ({ telegramApi, sendStartMessage }) => {
  const router = Router();
  const controller = createInternalTelegramController({ telegramApi, sendStartMessage });

  router.use(requireInternalToken);
  router.post("/internal/telegram/start-message", validateBody(validateStartMessagePayload), controller.sendStartMessage);
  router.post("/internal/telegram/notification", validateBody(validateNotificationPayload), controller.sendNotification);
  router.post("/internal/telegram/broadcast", validateBody(validateBroadcastPayload), controller.sendBroadcast);
  router.post("/internal/telegram/answer-callback", validateBody(validateAnswerCallbackPayload), controller.answerCallback);

  return router;
};

export default {
  createInternalRoutes,
};
