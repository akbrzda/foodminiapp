import { Router } from "express";
import { createInternalTelegramController } from "../controllers/internal-telegram.controller.js";
import { createInternalMaxController } from "../controllers/internal-max.controller.js";
import { requireInternalToken } from "../middlewares/internal-token.middleware.js";
import { validateBody } from "../middlewares/validation.middleware.js";
import {
  validateAnswerCallbackPayload,
  validateBroadcastPayload,
  validateNotificationPayload,
  validateStartMessagePayload,
} from "../schemas/internal-telegram.schemas.js";
import { validateMaxBroadcastPayload, validateMaxNotificationPayload } from "../schemas/internal-max.schemas.js";

export const createInternalRoutes = ({ telegramApi, maxApi, sendStartMessage }) => {
  const router = Router();
  const controller = createInternalTelegramController({ telegramApi, sendStartMessage });
  const maxController = createInternalMaxController({ maxApi });

  router.use(requireInternalToken);
  router.post("/internal/telegram/start-message", validateBody(validateStartMessagePayload), controller.sendStartMessage);
  router.post("/internal/telegram/notification", validateBody(validateNotificationPayload), controller.sendNotification);
  router.post("/internal/telegram/broadcast", validateBody(validateBroadcastPayload), controller.sendBroadcast);
  router.post("/internal/telegram/answer-callback", validateBody(validateAnswerCallbackPayload), controller.answerCallback);
  router.post("/internal/max/notification", validateBody(validateMaxNotificationPayload), maxController.sendNotification);
  router.post("/internal/max/broadcast", validateBody(validateMaxBroadcastPayload), maxController.sendBroadcast);

  return router;
};

export default {
  createInternalRoutes,
};
