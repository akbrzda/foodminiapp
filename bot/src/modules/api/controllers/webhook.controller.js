import { logger } from "../../../utils/logger.js";

export const createWebhookController = ({ commandBot }) => {
  return {
    handleTelegramWebhook: async (req, res) => {
      try {
        if (!commandBot || commandBot.mode !== "webhook") {
          return res.status(404).json({ success: false, error: "Webhook mode disabled" });
        }

        const expectedSecret = String(commandBot.webhookSecret || "").trim();
        if (expectedSecret) {
          const receivedSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
          if (!receivedSecret || receivedSecret !== expectedSecret) {
            return res.status(401).json({ success: false, error: "Invalid webhook secret" });
          }
        }

        await commandBot.processUpdate(req.validatedBody);
        return res.json({ ok: true });
      } catch (error) {
        logger.error("Ошибка обработки Telegram webhook", { error: error?.message || String(error) });
        return res.json({ ok: true });
      }
    },
  };
};

export default {
  createWebhookController,
};
