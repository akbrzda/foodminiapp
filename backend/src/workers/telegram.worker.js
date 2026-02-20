import { Worker } from "bullmq";
import axios from "axios";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";
import { TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT, getSystemSettings } from "../utils/settings.js";
dotenv.config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeNewOrderConfig = (value) => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const cityThreadIdsSource =
    source.city_thread_ids && typeof source.city_thread_ids === "object" && !Array.isArray(source.city_thread_ids)
      ? source.city_thread_ids
      : {};
  const cityThreadIds = {};
  for (const [cityIdRaw, threadRaw] of Object.entries(cityThreadIdsSource)) {
    const cityId = Number(cityIdRaw);
    const threadId = Number(threadRaw);
    if (!Number.isInteger(cityId) || cityId <= 0) continue;
    if (!Number.isInteger(threadId) || threadId <= 0) continue;
    cityThreadIds[String(cityId)] = threadId;
  }
  return {
    enabled: source.enabled === true,
    notify_on_new_order: source.notify_on_new_order !== false,
    notify_on_completed: source.notify_on_completed === true,
    notify_on_cancelled: source.notify_on_cancelled === true,
    group_id: String(source.group_id || "").trim(),
    use_city_threads: source.use_city_threads === true,
    city_thread_ids: cityThreadIds,
    message_template: String(source.message_template || TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT.message_template).trim(),
  };
};

const buildDeliveryAddress = (orderData) => {
  if (orderData.delivery_address) return String(orderData.delivery_address);
  if (!orderData.delivery_street) return "";
  let address = `${orderData.delivery_street}, д. ${orderData.delivery_house || "—"}`;
  if (orderData.delivery_entrance) address += `, подъезд ${orderData.delivery_entrance}`;
  if (orderData.delivery_apartment) address += `, кв. ${orderData.delivery_apartment}`;
  return address;
};

const buildItemsList = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => {
      let line = `• ${item.item_name || "Позиция"}`;
      if (item.variant_name) line += ` (${item.variant_name})`;
      line += ` x${item.quantity || 1} - ${item.subtotal || 0}₽`;
      if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
        const mods = item.modifiers
          .map((mod) => {
            const modName = mod?.modifier_name || "Модификатор";
            const modPrice = Number(mod?.modifier_price) > 0 ? ` (+${mod.modifier_price}₽)` : "";
            return `\n  + ${modName}${modPrice}`;
          })
          .join("");
        line += mods;
      }
      return line;
    })
    .join("\n");
};

const applyTemplate = (template, placeholders) => {
  let rendered = String(template || "");

  for (const [key, value] of Object.entries(placeholders || {})) {
    const isEmpty = value === null || value === undefined || String(value).trim() === "";
    if (!isEmpty) continue;
    const tokenPattern = `\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`;
    rendered = rendered.replace(new RegExp(`^.*${tokenPattern}.*(?:\\r?\\n|$)`, "gm"), "");
  }

  rendered = rendered.replaceAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!(key in placeholders)) return "";
    return escapeHtml(placeholders[key]);
  });

  return rendered.replaceAll(/\n{3,}/g, "\n\n").trim();
};

function formatNewOrderMessage(orderData) {
  const {
    order_number,
    order_type,
    city_name,
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
  if (city_name) {
    message += `🏙️ <b>Город:</b> ${city_name}\n`;
  }
  if (branch_name) {
    message += `🏪 <b>Филиал:</b> ${branch_name}\n`;
  }
  if (order_type === "delivery" && delivery_street) {
    message += `📫 <b>Адрес:</b> ${delivery_street}, д. ${delivery_house}`;
    if (delivery_entrance) message += `, подъезд ${delivery_entrance}`;
    if (delivery_apartment) message += `, кв. ${delivery_apartment}`;
    message += "\n";
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

function formatNewOrderMessageFromTemplate(orderData, config) {
  const orderTypeLabel = orderData.order_type === "delivery" ? "Доставка 🚚" : "Самовывоз 🏪";
  const paymentMethodLabel = orderData.payment_method === "cash" ? "Наличные 💵" : "Карта 💳";
  const isDelivery = orderData.order_type === "delivery";
  const itemsCount = Array.isArray(orderData.items) ? orderData.items.length : 0;
  const itemsTotalQuantity = Array.isArray(orderData.items)
    ? orderData.items.reduce((sum, item) => sum + (Number(item?.quantity) > 0 ? Number(item.quantity) : 0), 0)
    : 0;
  const placeholders = {
    order_id: orderData.order_id || "",
    order_number: orderData.order_number || "",
    order_status: orderData.status || "",
    order_created_at: orderData.created_at || "",
    order_desired_time: orderData.desired_time || "",
    order_type: orderData.order_type || "",
    order_type_label: orderTypeLabel,
    city_id: orderData.city_id || "",
    city_name: orderData.city_name || "",
    city_timezone: orderData.city_timezone || "",
    branch_id: orderData.branch_id || "",
    branch_name: orderData.branch_name || "",
    branch_address: orderData.branch_address || "",
    branch_phone: orderData.branch_phone || "",
    user_id: orderData.user_id || "",
    user_first_name: orderData.user_first_name || "",
    user_last_name: orderData.user_last_name || "",
    user_full_name: [orderData.user_first_name, orderData.user_last_name].filter(Boolean).join(" ").trim(),
    user_phone: orderData.user_phone || "",
    user_telegram_id: orderData.user_telegram_id || "",
    delivery_address: isDelivery ? buildDeliveryAddress(orderData) || "" : "",
    delivery_street: isDelivery ? orderData.delivery_street || "" : "",
    delivery_house: isDelivery ? orderData.delivery_house || "" : "",
    delivery_entrance: isDelivery ? orderData.delivery_entrance || "" : "",
    delivery_floor: isDelivery ? orderData.delivery_floor || "" : "",
    delivery_apartment: isDelivery ? orderData.delivery_apartment || "" : "",
    delivery_intercom: isDelivery ? orderData.delivery_intercom || "" : "",
    delivery_comment: isDelivery ? orderData.delivery_comment || "" : "",
    delivery_latitude: isDelivery ? orderData.delivery_latitude ?? "" : "",
    delivery_longitude: isDelivery ? orderData.delivery_longitude ?? "" : "",
    payment_method: orderData.payment_method || "",
    payment_method_label: paymentMethodLabel,
    change_from: orderData.payment_method === "cash" ? orderData.change_from ?? "" : "",
    subtotal: orderData.subtotal ?? "",
    delivery_cost: orderData.delivery_cost ?? "",
    bonus_spent: orderData.bonus_spent ?? "",
    total: orderData.total ?? 0,
    items_count: itemsCount,
    items_total_quantity: itemsTotalQuantity,
    comment: orderData.comment || "",
    items_list: buildItemsList(orderData.items),
  };
  const rendered = applyTemplate(config.message_template, placeholders);
  return rendered || formatNewOrderMessage(orderData);
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
async function sendTelegramMessage(chatId, message, { messageThreadId = null } = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };
    if (Number.isInteger(messageThreadId) && messageThreadId > 0) {
      payload.message_thread_id = messageThreadId;
    }
    const response = await axios.post(url, payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Telegram API error: ${error.response.data.description || error.message} (chat_id=${chatId}, message_thread_id=${messageThreadId || "none"})`,
      );
    }
    throw error;
  }
}
async function processTelegramNotification(job) {
  const { type, data } = job.data;
  logger.system.startup(`Processing Telegram notification: ${type} (Job ID: ${job.id})`);
  let message;
  let chatId = data.chat_id || TELEGRAM_CHAT_ID;
  const isTest = data?.is_test === true;
  let messageThreadId = null;
  let config = null;
  if (type === "new_order" || type === "status_change") {
    const settings = await getSystemSettings();
    config = normalizeNewOrderConfig(settings?.telegram_new_order_notification);
    if (!config.enabled && !isTest) {
      logger.system.startup(`Telegram ${type} notification disabled in settings (Job ID: ${job.id})`);
      return { skipped: true, reason: "disabled" };
    }
    chatId = config.group_id || chatId;
    if (config.use_city_threads) {
      const cityKey = String(Number(data.city_id));
      if (cityKey && cityKey !== "NaN") {
        messageThreadId = config.city_thread_ids[cityKey] || null;
      }
    }
  }
  switch (type) {
    case "new_order": {
      if (!config?.notify_on_new_order && !isTest) {
        logger.system.startup(`Telegram new_order event disabled in settings (Job ID: ${job.id})`);
        return { skipped: true, reason: "disabled" };
      }
      message = formatNewOrderMessageFromTemplate(data, config);
      break;
    }
    case "status_change": {
      const newStatus = String(data?.new_status || "").trim();
      if (newStatus === "completed" && !config?.notify_on_completed && !isTest) {
        logger.system.startup(`Telegram completed event disabled in settings (Job ID: ${job.id})`);
        return { skipped: true, reason: "disabled" };
      }
      if (newStatus === "cancelled" && !config?.notify_on_cancelled && !isTest) {
        logger.system.startup(`Telegram cancelled event disabled in settings (Job ID: ${job.id})`);
        return { skipped: true, reason: "disabled" };
      }
      if (newStatus !== "completed" && newStatus !== "cancelled") {
        logger.system.startup(`Telegram status_change skipped for unsupported status=${newStatus || "unknown"} (Job ID: ${job.id})`);
        return { skipped: true, reason: "unsupported_status" };
      }
      message = formatStatusChangeMessage(data);
      break;
    }
    case "custom":
      message = data.message;
      break;
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
  if (!chatId) {
    throw new Error("Chat ID is not configured");
  }
  const result = await sendTelegramMessage(chatId, message, { messageThreadId });
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
