import { logger } from "../../../utils/logger.js";
import { sendError, sendSuccess } from "../utils/http-response.js";

export const createInternalTelegramController = ({ telegramApi, sendStartMessage }) => {
  return {
    sendStartMessage: async (req, res) => {
      try {
        const { telegramId, settings } = req.validatedBody;
        await sendStartMessage(telegramId, settings);
        return sendSuccess(res);
      } catch (error) {
        logger.error("Ошибка отправки start-сообщения", { error: error?.message || String(error) });
        return sendError(res, 500, "Не удалось отправить сообщение");
      }
    },

    sendNotification: async (req, res) => {
      try {
        const { telegramId, message, replyMarkup, messageThreadId } = req.validatedBody;
        const result = await telegramApi.sendTextMessage({
          chatId: telegramId,
          text: message,
          parseMode: "HTML",
          replyMarkup,
          messageThreadId,
        });

        return sendSuccess(res, { message_id: result?.message_id || null });
      } catch (error) {
        logger.error("Ошибка отправки notification", { error: error?.message || String(error) });
        return sendError(res, 500, "Не удалось отправить сообщение");
      }
    },

    sendBroadcast: async (req, res) => {
      try {
        const { telegramId, text, imageUrl, videoUrl, parseMode, replyMarkup, messageThreadId } = req.validatedBody;

        let result;
        if (imageUrl) {
          result = await telegramApi.sendPhotoMessage({
            chatId: telegramId,
            photo: imageUrl,
            caption: text,
            parseMode,
            replyMarkup,
            messageThreadId,
          });
        } else if (videoUrl) {
          result = await telegramApi.sendVideoMessage({
            chatId: telegramId,
            video: videoUrl,
            caption: text,
            parseMode,
            replyMarkup,
            messageThreadId,
          });
        } else {
          result = await telegramApi.sendTextMessage({
            chatId: telegramId,
            text,
            parseMode,
            replyMarkup,
            messageThreadId,
          });
        }

        return sendSuccess(res, { message_id: result?.message_id || null });
      } catch (error) {
        logger.error("Ошибка отправки broadcast", { error: error?.message || String(error) });
        return sendError(res, 500, "Не удалось отправить broadcast");
      }
    },

    answerCallback: async (req, res) => {
      try {
        const { callbackQueryId, text, showAlert } = req.validatedBody;
        await telegramApi.answerCallbackQuery({
          callbackQueryId,
          text,
          showAlert,
        });
        return sendSuccess(res);
      } catch (error) {
        logger.error("Ошибка answerCallbackQuery", { error: error?.message || String(error) });
        return sendError(res, 500, "Не удалось обработать callback");
      }
    },
  };
};

export default {
  createInternalTelegramController,
};
