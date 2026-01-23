import { Worker } from "bullmq";
import axios from "axios";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";
dotenv.config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
function formatNewOrderMessage(orderData) {
  const {
    order_number,
    order_type,
    branch_name,
    delivery_address,
    delivery_street,
    delivery_house,
    delivery_apartment,
    delivery_entrance,
    total,
    items,
    payment_method,
    comment,
  } = orderData;
  let message = `🔔 <b>Новый заказ #${order_number}</b>\n\n`;
  message += `📍 <b>Тип:</b> ${order_type === "delivery" ? "Доставка 🚚" : "Самовывоз 🏪"}\n`;
  if (order_type === "delivery" && delivery_street) {
    message += `📫 <b>Адрес:</b> ${delivery_street}, д. ${delivery_house}`;
    if (delivery_entrance) message += `, подъезд ${delivery_entrance}`;
    if (delivery_apartment) message += `, кв. ${delivery_apartment}`;
    message += "\n";
  } else if (branch_name) {
    message += `🏪 <b>Филиал:</b> ${branch_name}\n`;
  }
  message += `💳 <b>Оплата:</b> ${payment_method === "cash" ? "Наличные 💵" : "Карта 💳"}\n`;
  message += `💰 <b>Сумма:</b> ${total}₽\n\n`;
  if (items && items.length > 0) {
    message += `📦 <b>Состав заказа:</b>\n`;
    items.forEach((item) => {
      message += `• ${item.item_name}`;
      if (item.variant_name) message += ` (${item.variant_name})`;
      message += ` x${item.quantity} - ${item.subtotal}₽\n`;
      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach((mod) => {
          message += `  + ${mod.modifier_name}`;
          if (mod.modifier_price > 0) message += ` (+${mod.modifier_price}₽)`;
          message += "\n";
        });
      }
    });
  }
  if (comment) {
    message += `\n💬 <b>Комментарий:</b> ${comment}`;
  }
  return message;
}
function formatStatusChangeMessage(orderData) {
  const { order_number, old_status, new_status } = orderData;
  const statusEmoji = {
    pending: "⏳",
    confirmed: "✅",
    preparing: "👨‍🍳",
    ready: "🎉",
    delivering: "🚚",
    completed: "✔️",
    cancelled: "❌",
  };
  const statusText = {
    pending: "Ожидает подтверждения",
    confirmed: "Подтвержден",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В доставке",
    completed: "Завершен",
    cancelled: "Отменен",
  };
  return `${statusEmoji[new_status]} <b>Заказ #${order_number}</b>\n\nСтатус изменен: ${statusText[old_status]} → ${statusText[new_status]}`;
}
async function sendTelegramMessage(chatId, message) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`Telegram API error: ${error.response.data.description || error.message}`);
    }
    throw error;
  }
}
async function processTelegramNotification(job) {
  const { type, data } = job.data;
  logger.system.startup(`Processing Telegram notification: ${type} (Job ID: ${job.id})`);
  let message;
  let chatId = data.chat_id || TELEGRAM_CHAT_ID;
  switch (type) {
    case "new_order":
      message = formatNewOrderMessage(data);
      break;
    case "status_change":
      message = formatStatusChangeMessage(data);
      break;
    case "custom":
      message = data.message;
      break;
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
  if (!chatId) {
    throw new Error("Chat ID is not configured");
  }
  const result = await sendTelegramMessage(chatId, message);
  logger.system.startup(`✅ Telegram notification sent: ${type} (Job ID: ${job.id})`);
  return result;
}
export function createTelegramWorker(connection) {
  const worker = new Worker("telegram-notifications", processTelegramNotification, {
    connection,
    concurrency: 5,
  });
  worker.on("completed", (job) => {
  });
  worker.on("failed", (job, err) => {
    console.error(`❌ Telegram notification failed: Job ${job?.id}`, err.message);
    logger.system.redisError(`Telegram worker failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error("❌ Telegram worker error:", err);
  });
  return worker;
}
export default {
  createTelegramWorker,
  sendTelegramMessage,
  formatNewOrderMessage,
  formatStatusChangeMessage,
};
