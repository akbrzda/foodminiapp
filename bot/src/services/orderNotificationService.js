import { TELEGRAM_NEW_ORDER_NOTIFICATION_DEFAULT, getSystemSettings } from "../utils/settings.js";
import { sendTextMessage } from "./telegramApi.js";

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

const formatNewOrderMessage = (orderData) => {
  const {
    order_number,
    order_type,
    city_name,
    branch_name,
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
  if (city_name) message += `🏙️ <b>Город:</b> ${city_name}\n`;
  if (branch_name) message += `🏪 <b>Филиал:</b> ${branch_name}\n`;
  if (order_type === "delivery" && delivery_street) {
    message += `📫 <b>Адрес:</b> ${delivery_street}, д. ${delivery_house}`;
    if (delivery_entrance) message += `, подъезд ${delivery_entrance}`;
    if (delivery_apartment) message += `, кв. ${delivery_apartment}`;
    message += "\n";
  }
  message += `💳 <b>Оплата:</b> ${payment_method === "cash" ? "Наличные 💵" : "Карта 💳"}\n`;
  message += `💰 <b>Сумма:</b> ${total}₽\n\n`;
  if (Array.isArray(items) && items.length > 0) {
    message += "📦 <b>Состав заказа:</b>\n";
    items.forEach((item) => {
      message += `• ${item.item_name}`;
      if (item.variant_name) message += ` (${item.variant_name})`;
      message += ` x${item.quantity} - ${item.subtotal}₽\n`;
    });
  }
  if (comment) {
    message += `\n💬 <b>Комментарий:</b> ${comment}`;
  }
  return message;
};

const formatNewOrderMessageFromTemplate = (orderData, config) => {
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
    payment_method: orderData.payment_method || "",
    payment_method_label: paymentMethodLabel,
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
};

const formatStatusChangeMessage = (orderData) => {
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
};

export const processTelegramNotificationJob = async (jobData) => {
  const { type, data } = jobData;
  const defaultChatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  const isTest = data?.is_test === true;

  let message = "";
  let chatId = data?.chat_id || defaultChatId;
  let messageThreadId = null;
  let config = null;

  if (type === "new_order" || type === "status_change") {
    const settings = await getSystemSettings();
    config = normalizeNewOrderConfig(settings?.telegram_new_order_notification);

    if (!config.enabled && !isTest) {
      return { skipped: true, reason: "disabled" };
    }

    chatId = config.group_id || chatId;
    if (config.use_city_threads) {
      const cityKey = String(Number(data?.city_id));
      if (cityKey && cityKey !== "NaN") {
        messageThreadId = config.city_thread_ids[cityKey] || null;
      }
    }
  }

  switch (type) {
    case "new_order": {
      if (!config?.notify_on_new_order && !isTest) {
        return { skipped: true, reason: "disabled" };
      }
      message = formatNewOrderMessageFromTemplate(data, config);
      break;
    }
    case "status_change": {
      const newStatus = String(data?.new_status || "").trim();
      if (newStatus === "completed" && !config?.notify_on_completed && !isTest) {
        return { skipped: true, reason: "disabled" };
      }
      if (newStatus === "cancelled" && !config?.notify_on_cancelled && !isTest) {
        return { skipped: true, reason: "disabled" };
      }
      if (newStatus !== "completed" && newStatus !== "cancelled") {
        return { skipped: true, reason: "unsupported_status" };
      }
      message = formatStatusChangeMessage(data);
      break;
    }
    case "custom": {
      message = String(data?.message || "").trim();
      break;
    }
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }

  if (!chatId) {
    throw new Error("Chat ID не настроен");
  }

  return sendTextMessage({
    chatId,
    text: message,
    parseMode: "HTML",
    messageThreadId,
  });
};

export default {
  processTelegramNotificationJob,
};
