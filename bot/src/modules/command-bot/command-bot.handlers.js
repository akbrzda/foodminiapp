import axios from "axios";
import { logger } from "../../utils/logger.js";
import { normalizeCommand, parseStartArgument } from "./command-bot.utils.js";

const buildHeaders = (botServiceToken) => {
  if (!botServiceToken) return {};
  return { "x-bot-service-token": botServiceToken };
};

export const createCommandBotHandlers = ({
  backendUrl,
  botServiceToken,
  answerCallbackQuery,
  sendTelegramStartMessage,
  handleCheckSubscriptionCallback,
  handleStartWithSubscriptionTag,
  upsertBotUser,
}) => {
  const safeAnswerCallback = async (payload, context) => {
    try {
      await answerCallbackQuery(payload);
    } catch (error) {
      logger.warn("Не удалось отправить answerCallbackQuery", {
        context,
        error: error?.message || String(error),
      });
    }
  };

  const forwardBroadcastCallback = async (callbackQuery) => {
    try {
      await axios.post(
        `${backendUrl}/api/broadcasts/telegram/callback`,
        {
          callback_query: callbackQuery,
        },
        { headers: buildHeaders(botServiceToken) },
      );
    } catch (error) {
      logger.error("Не удалось проксировать callback в backend", {
        error: error?.response?.data || error?.message || String(error),
      });

      if (callbackQuery?.id) {
        await safeAnswerCallback(
          {
          callbackQueryId: callbackQuery.id,
          text: "Ошибка обработки. Попробуйте позже",
          showAlert: false,
          },
          "forwardBroadcastCallback",
        );
      }
    }
  };

  const handleCommand = async ({ message, botName }) => {
    const chatId = message?.chat?.id;
    if (!chatId) return;

    const command = normalizeCommand({ text: message?.text || "", botName });
    if (!command || command !== "/start") return;

    try {
      await upsertBotUser(message?.from);
    } catch (error) {
      logger.warn("Не удалось обновить пользователя при /start", {
        error: error?.message || String(error),
      });
    }

    const startArg = parseStartArgument(message?.text || "");
    if (startArg) {
      const result = await handleStartWithSubscriptionTag({
        chatId,
        telegramUser: message?.from,
        tag: startArg,
      });
      if (result?.handled) {
        return;
      }
    }

    await sendTelegramStartMessage(chatId, null);
  };

  const handleCallbackQuery = async (callbackQuery) => {
    if (!callbackQuery?.data || !callbackQuery?.from?.id) return;

    const data = String(callbackQuery.data);
    if (data.startsWith("check_sub:")) {
      const result = await handleCheckSubscriptionCallback({ callbackQuery });
      if (result?.handled) return;
    }

    if (data.startsWith("broadcast:")) {
      await forwardBroadcastCallback(callbackQuery);
      return;
    }

    if (callbackQuery?.id) {
      await safeAnswerCallback(
        {
          callbackQueryId: callbackQuery.id,
          text: "Действие выполнено",
          showAlert: false,
        },
        "handleCallbackQuery",
      );
    }
  };

  const processUpdate = async ({ update, botName }) => {
    if (update?.message?.text) {
      await handleCommand({ message: update.message, botName });
    }

    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  };

  return {
    processUpdate,
  };
};

export default {
  createCommandBotHandlers,
};
