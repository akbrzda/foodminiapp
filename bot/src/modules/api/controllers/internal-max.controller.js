import { logger } from "../../../utils/logger.js";
import { sendError, sendSuccess } from "../utils/http-response.js";

const mapReplyMarkupToAttachments = (replyMarkup) => {
  const rows = Array.isArray(replyMarkup?.inline_keyboard) ? replyMarkup.inline_keyboard : [];
  if (!rows.length) return [];

  const buttons = rows
    .map((row) => {
      if (!Array.isArray(row)) return [];
      return row
        .map((button) => {
          const text = String(button?.text || "").trim();
          if (!text) return null;
          if (button?.url) {
            const hasWebApp = typeof button?.web_app?.url === "string" && button.web_app.url.trim();
            return {
              type: hasWebApp ? "open_app" : "link",
              text,
              url: String(hasWebApp ? button.web_app.url : button.url),
            };
          }
          if (button?.web_app?.url) {
            return {
              type: "open_app",
              text,
              url: String(button.web_app.url),
            };
          }
          // В MAX transport используем только link-кнопки; callback-кнопки Telegram пропускаем.
          return null;
        })
        .filter(Boolean);
    })
    .filter((row) => row.length > 0);

  if (!buttons.length) return [];

  return [
    {
      type: "inline_keyboard",
      payload: { buttons },
    },
  ];
};

const appendMediaLinksToText = ({ text, imageUrl, videoUrl }) => {
  const parts = [];
  const content = String(text || "").trim();
  if (content) parts.push(content);
  if (imageUrl) parts.push(`Изображение: ${String(imageUrl)}`);
  if (videoUrl) parts.push(`Видео: ${String(videoUrl)}`);
  return parts.join("\n\n");
};

const resolveRecipient = (maxId) => {
  const numeric = Number(maxId);
  if (!Number.isInteger(numeric) || numeric === 0) {
    throw new Error("Некорректный max_id");
  }
  if (numeric < 0) {
    return { chatId: numeric };
  }
  return { userId: numeric };
};

const extractMaxApiErrorDetails = (error) => {
  const status = Number(error?.response?.status);
  const responseData = error?.response?.data;
  let providerMessage = "";

  if (typeof responseData === "string") {
    providerMessage = responseData.trim();
  } else if (responseData && typeof responseData === "object") {
    providerMessage = String(responseData?.error_description || responseData?.error || responseData?.message || "").trim();
    if (!providerMessage) {
      try {
        providerMessage = JSON.stringify(responseData);
      } catch (jsonError) {
        providerMessage = "";
      }
    }
  }

  const fallback = String(error?.message || "").trim() || "Неизвестная ошибка";
  const details = providerMessage || fallback;
  return Number.isFinite(status) && status > 0 ? `MAX API ${status}: ${details}` : details;
};

export const createInternalMaxController = ({ maxApi }) => {
  return {
    sendNotification: async (req, res) => {
      try {
        const { maxId, message, replyMarkup } = req.validatedBody;
        const recipient = resolveRecipient(maxId);
        const sentMessage = await maxApi.sendMessage({
          ...recipient,
          text: message,
          format: "html",
          attachments: mapReplyMarkupToAttachments(replyMarkup),
        });

        return sendSuccess(res, { message_id: sentMessage?.mid || sentMessage?.id || null });
      } catch (error) {
        const details = extractMaxApiErrorDetails(error);
        logger.error("Ошибка отправки max notification", { error: details });
        return sendError(res, 502, `Не удалось отправить сообщение: ${details}`);
      }
    },

    sendBroadcast: async (req, res) => {
      try {
        const { maxId, text, imageUrl, videoUrl, parseMode, replyMarkup } = req.validatedBody;
        const recipient = resolveRecipient(maxId);
        const sentMessage = await maxApi.sendMessage({
          ...recipient,
          text: appendMediaLinksToText({ text, imageUrl, videoUrl }),
          format: parseMode,
          attachments: mapReplyMarkupToAttachments(replyMarkup),
        });

        return sendSuccess(res, { message_id: sentMessage?.mid || sentMessage?.id || null });
      } catch (error) {
        const details = extractMaxApiErrorDetails(error);
        logger.error("Ошибка отправки max broadcast", { error: details });
        return sendError(res, 502, `Не удалось отправить broadcast: ${details}`);
      }
    },
  };
};

export default {
  createInternalMaxController,
};
