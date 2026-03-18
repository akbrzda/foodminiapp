import axios from "axios";

const MAX_API_BASE_URL = "https://platform-api.max.ru";

const getToken = () => {
  const token = String(process.env.MAX_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("MAX_BOT_TOKEN не задан");
  }
  return token;
};

const normalizeFormat = (value) => {
  const format = String(value || "").trim().toLowerCase();
  if (format === "markdown" || format === "html") return format;
  return null;
};

export const sendMessage = async ({ userId = null, chatId = null, text, format = null, attachments = null }) => {
  const token = getToken();
  const normalizedUserId = Number(userId);
  const normalizedChatId = Number(chatId);
  const hasUserId = Number.isInteger(normalizedUserId) && normalizedUserId !== 0;
  const hasChatId = Number.isInteger(normalizedChatId) && normalizedChatId !== 0;
  if (!hasUserId && !hasChatId) {
    throw new Error("Нужно указать userId или chatId");
  }

  const payload = {
    text: String(text || ""),
  };

  const normalizedFormat = normalizeFormat(format);
  if (normalizedFormat) {
    payload.format = normalizedFormat;
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments;
  }

  const response = await axios.post(`${MAX_API_BASE_URL}/messages`, payload, {
    params: hasChatId ? { chat_id: normalizedChatId } : { user_id: normalizedUserId },
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  return response.data?.message || null;
};

export default {
  sendMessage,
};
