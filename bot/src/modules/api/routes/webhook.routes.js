import { Router } from "express";
import { createWebhookController } from "../controllers/webhook.controller.js";
import { validateBody } from "../middlewares/validation.middleware.js";
import { validateTelegramWebhookPayload } from "../schemas/webhook.schemas.js";

export const createWebhookRoutes = ({ commandBot }) => {
  const router = Router();
  const controller = createWebhookController({ commandBot });

  router.post("/webhook/telegram", validateBody(validateTelegramWebhookPayload), controller.handleTelegramWebhook);

  return router;
};

export default {
  createWebhookRoutes,
};
