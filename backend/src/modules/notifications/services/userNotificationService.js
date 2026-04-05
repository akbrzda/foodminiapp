import { buildOrderDetailsReplyMarkup, formatOrderStatusMessage } from "../../../utils/telegram.js";
import { getChannelAdapter } from "./channelAdapters.js";
import { resolvePreferredNotificationChannelForUser } from "./externalAccountService.js";

export const sendNotificationToUser = async ({ userId, message, replyMarkup = null, messageThreadId = null }) => {
  if (!userId || !message) {
    return { delivered: false, reason: "invalid_payload" };
  }

  const channel = await resolvePreferredNotificationChannelForUser(userId);
  if (!channel?.platform || !channel?.externalId) {
    return { delivered: false, reason: "channel_not_found" };
  }

  const adapter = getChannelAdapter(channel.platform);
  if (!adapter?.sendNotification) {
    return { delivered: false, reason: "unsupported_channel", platform: channel.platform };
  }

  const safeReplyMarkup = channel.platform === "telegram" ? replyMarkup : null;
  await adapter.sendNotification({
    externalId: channel.externalId,
    message,
    replyMarkup: safeReplyMarkup,
    messageThreadId,
  });

  return { delivered: true, platform: channel.platform };
};

export const sendOrderStatusNotification = async ({ userId, orderId, orderNumber, status, orderType }) => {
  const message = formatOrderStatusMessage(orderNumber, status, orderType, orderId);
  const replyMarkup = buildOrderDetailsReplyMarkup(orderId, status === "completed" ? "Оценить заказ" : "Открыть заказ");
  return sendNotificationToUser({
    userId,
    message,
    replyMarkup,
  });
};

export default {
  sendNotificationToUser,
  sendOrderStatusNotification,
};
