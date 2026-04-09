import { logger } from "../../../utils/logger.js";
import {
  earnBonuses,
  cancelOrderBonuses,
  removeEarnedBonuses,
  redeliveryEarnBonuses,
  getLoyaltyLevelsFromDb,
} from "../../loyalty/services/loyaltyService.js";
import { getSettingsByRequest } from "../../settings/settings-runtime.js";
import { notifyOrderStatusUpdate } from "../../../websocket/runtime.js";
import { addTelegramNotification } from "../../../queues/config.js";
import ordersAdapter from "../../integrations/adapters/ordersAdapter.js";
import { sendOrderStatusNotification } from "../../notifications/services/userNotificationService.js";
import { scheduleOrderRatingReminder } from "../services/orderRatingReminderService.js";
import { getOrdersDbByRequest } from "../orders-db.runtime.js";

// Вспомогательные функции для работы с временными зонами
const getTimeZoneOffset = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  const utcTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return (utcTime - date.getTime()) / 60000;
};

const zonedTimeToUtc = (localDateTime, timeZone) => {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = localDateTime;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTimeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
};

const getShiftWindowUtc = (timeZone, nowOrDate = new Date()) => {
  const now = nowOrDate instanceof Date ? nowOrDate : new Date();
  const localFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = localFormatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const localHour = Number(parts.hour || 0);
  let localYear = Number(parts.year || now.getFullYear());
  let localMonth = Number(parts.month || now.getMonth() + 1);
  let localDay = Number(parts.day || now.getDate());

  if (localHour >= 0 && localHour < 5) {
    const prevDay = new Date(localYear, localMonth - 1, localDay);
    prevDay.setDate(prevDay.getDate() - 1);
    localYear = prevDay.getFullYear();
    localMonth = prevDay.getMonth() + 1;
    localDay = prevDay.getDate();
  }

  const startUtc = zonedTimeToUtc({ year: localYear, month: localMonth, day: localDay, hour: 5, minute: 0, second: 0 }, timeZone);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc, endUtc };
};

/**
 * Получение всех заказов (админ)
 */
export const getAdminOrders = async (req, res, next) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const { city_id, status, order_type, date_from, date_to, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT o.*, 
        (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
        r.rating as user_rating,
        r.comment as user_rating_comment,
        r.created_at as user_rating_created_at,
        c.name as city_name, 
        b.name as branch_name,
        u.phone as user_phone,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM orders o
      LEFT JOIN cities c ON o.city_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_ratings r ON r.order_id = o.id AND r.user_id = o.user_id
      WHERE 1=1
    `;

    const params = [];

    // Проверка доступа менеджера
    if (req.user.role === "manager") {
      query += " AND o.city_id IN (?)";
      params.push(req.user.cities);
    } else if (city_id) {
      query += " AND o.city_id = ?";
      params.push(city_id);
    }

    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }

    if (order_type) {
      query += " AND o.order_type = ?";
      params.push(order_type);
    }

    if (date_from) {
      query += " AND DATE(o.created_at) >= ?";
      params.push(date_from);
    }

    if (date_to) {
      query += " AND DATE(o.created_at) <= ?";
      params.push(date_to);
    }

    if (search) {
      query += " AND (o.order_number LIKE ? OR u.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY o.created_at ASC, o.id ASC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [orders] = await ordersDb.query(query, params);
    res.json({ orders });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение заказов смены
 */
export const getShiftOrders = async (req, res, next) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const { branch_id, order_type, search } = req.query;

    if (!branch_id) {
      return res.status(400).json({ error: "branch_id is required" });
    }

    const [branches] = await ordersDb.query(
      `SELECT b.id, b.city_id, c.timezone
       FROM branches b
       JOIN cities c ON b.city_id = c.id
       WHERE b.id = ?`,
      [branch_id],
    );

    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }

    const branch = branches[0];

    if (req.user.role === "manager" && !req.user.cities.includes(branch.city_id)) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }

    const timeZone = branch.timezone || "UTC";
    const { startUtc, endUtc } = getShiftWindowUtc(timeZone, new Date());

    let query = `
      SELECT o.*,
        c.name as city_name,
        c.timezone as city_timezone,
        CASE
          WHEN o.order_type = 'delivery' THEN DATE_ADD(o.created_at, INTERVAL (IFNULL(b.prep_time, 0) + IFNULL(b.assembly_time, 0) + IFNULL(dp.delivery_time, 0)) MINUTE)
          WHEN o.order_type = 'pickup' THEN DATE_ADD(o.created_at, INTERVAL IFNULL(b.prep_time, 0) MINUTE)
          ELSE NULL
        END as deadline_time,
        b.name as branch_name,
        b.latitude as branch_latitude,
        b.longitude as branch_longitude,
        u.phone as user_phone,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        COALESCE(da.latitude, o.delivery_latitude) as delivery_latitude,
        COALESCE(da.longitude, o.delivery_longitude) as delivery_longitude
      FROM orders o
      LEFT JOIN cities c ON o.city_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN delivery_addresses da ON o.delivery_address_id = da.id
      LEFT JOIN delivery_polygons dp
        ON dp.branch_id = o.branch_id
        AND dp.is_active = TRUE
        AND COALESCE(da.latitude, o.delivery_latitude) IS NOT NULL
        AND COALESCE(da.longitude, o.delivery_longitude) IS NOT NULL
        AND ST_Contains(
          dp.polygon,
          ST_GeomFromText(
            CONCAT('POINT(', COALESCE(da.longitude, o.delivery_longitude), ' ', COALESCE(da.latitude, o.delivery_latitude), ')'),
            4326
          )
        )
      WHERE o.branch_id = ?
        AND o.created_at >= ?
        AND o.created_at < ?
    `;

    const params = [branch_id, startUtc, endUtc];

    if (order_type) {
      query += " AND o.order_type = ?";
      params.push(order_type);
    }

    if (search) {
      query +=
        " AND (o.order_number LIKE ? OR u.phone LIKE ? OR CONCAT_WS(' ', o.delivery_street, o.delivery_house, o.delivery_apartment, o.delivery_entrance, o.delivery_floor) LIKE ?)";
      const searchValue = `%${search}%`;
      params.push(searchValue, searchValue, searchValue);
    }

    query += " ORDER BY o.created_at DESC";

    const [orders] = await ordersDb.query(query, params);

    const orderIds = orders.map((order) => order.id);
    const itemsByOrder = new Map();

    if (orderIds.length > 0) {
      const [items] = await ordersDb.query(
        `SELECT oi.*, oim.modifier_id, oim.modifier_name, oim.modifier_price, oim.modifier_weight, oim.modifier_weight_unit, oim.order_item_id
         FROM order_items oi
         LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
         WHERE oi.order_id IN (?)`,
        [orderIds],
      );

      const itemsMap = new Map();
      items.forEach((row) => {
        if (!itemsMap.has(row.id)) {
          itemsMap.set(row.id, { ...row, modifiers: [] });
        }
        if (row.modifier_id || row.modifier_name) {
          itemsMap.get(row.id).modifiers.push({
            modifier_id: row.modifier_id,
            modifier_name: row.modifier_name,
            modifier_price: row.modifier_price,
            modifier_weight: row.modifier_weight,
            modifier_weight_unit: row.modifier_weight_unit,
          });
        }
      });

      itemsMap.forEach((item) => {
        if (!itemsByOrder.has(item.order_id)) {
          itemsByOrder.set(item.order_id, []);
        }
        itemsByOrder.get(item.order_id).push(item);
      });
    }

    const enrichedOrders = orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
    }));

    res.json({
      orders: enrichedOrders,
      shift: {
        start_at: startUtc.toISOString(),
        end_at: endUtc.toISOString(),
        timezone: timeZone,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение количества заказов
 */
export const getOrdersCount = async (req, res, next) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const { city_id, status, order_type, date_from, date_to, search } = req.query;

    let query = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN cities c ON o.city_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (req.user.role === "manager") {
      query += " AND o.city_id IN (?)";
      params.push(req.user.cities);
    } else if (city_id) {
      query += " AND o.city_id = ?";
      params.push(city_id);
    }

    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }

    if (order_type) {
      query += " AND o.order_type = ?";
      params.push(order_type);
    }

    if (date_from) {
      query += " AND DATE(o.created_at) >= ?";
      params.push(date_from);
    }

    if (date_to) {
      query += " AND DATE(o.created_at) <= ?";
      params.push(date_to);
    }

    if (search) {
      query += " AND (o.order_number LIKE ? OR u.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await ordersDb.query(query, params);
    res.json({ total: rows[0]?.total || 0 });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение детальной информации о заказе (админ)
 */
export const getAdminOrderById = async (req, res, next) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const orderId = req.params.id;

    const [orders] = await ordersDb.query(
      `SELECT o.*, 
        (SELECT COALESCE(SUM(lt.amount), 0) FROM loyalty_transactions lt WHERE lt.order_id = o.id AND lt.type = 'earn') as bonuses_earned,
        r.rating as user_rating,
        r.comment as user_rating_comment,
        r.created_at as user_rating_created_at,
        c.name as city_name, 
        c.timezone as city_timezone,
        b.name as branch_name, 
        b.address as branch_address,
        u.phone as user_phone,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        ll.name as loyalty_level_name,
        ll.earn_percentage as loyalty_earn_percentage,
        ll.max_spend_percentage as loyalty_max_spend_percentage
       FROM orders o
       LEFT JOIN cities c ON o.city_id = c.id
       LEFT JOIN branches b ON o.branch_id = b.id
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_ratings r ON r.order_id = o.id AND r.user_id = o.user_id
       LEFT JOIN loyalty_levels ll ON u.current_loyalty_level_id = ll.id
       WHERE o.id = ?`,
      [orderId],
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orders[0];

    if (req.user.role === "manager" && !req.user.cities.includes(order.city_id)) {
      return res.status(403).json({ error: "You do not have access to this city" });
    }

    const [items] = await ordersDb.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
    const itemIds = items.map((item) => item.id).filter(Boolean);
    let modifiersByItemId = new Map();

    if (itemIds.length > 0) {
      const [modifierRows] = await ordersDb.query(`SELECT * FROM order_item_modifiers WHERE order_item_id IN (?)`, [itemIds]);
      modifiersByItemId = modifierRows.reduce((acc, modifier) => {
        if (!acc.has(modifier.order_item_id)) {
          acc.set(modifier.order_item_id, []);
        }
        acc.get(modifier.order_item_id).push(modifier);
        return acc;
      }, new Map());
    }

    for (const item of items) {
      item.modifiers = modifiersByItemId.get(item.id) || [];
    }

    order.items = items;

    const [statusHistory] = await ordersDb.query(
      `SELECT osh.id, osh.old_status, osh.new_status, osh.changed_by_type, osh.changed_at,
        au.first_name as admin_first_name, au.last_name as admin_last_name
       FROM order_status_history osh
       LEFT JOIN admin_users au ON au.id = osh.changed_by_admin_id
       WHERE osh.order_id = ?
       ORDER BY osh.changed_at ASC, osh.id ASC`,
      [orderId],
    );

    order.status_history = statusHistory || [];

    // Информация о бонусах
    const [spendRows] = await ordersDb.query("SELECT status, amount FROM loyalty_transactions WHERE order_id = ? AND type = 'spend'", [orderId]);

    if (spendRows.length > 0) {
      const hasPending = spendRows.some((row) => row.status === "pending");
      const hasCompleted = spendRows.some((row) => row.status === "completed");
      const allCancelled = spendRows.every((row) => row.status === "cancelled");

      order.bonus_spend_status = allCancelled ? "cancelled" : hasPending ? "pending" : hasCompleted ? "completed" : "pending";
      order.bonus_spend_amount = spendRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
    } else {
      order.bonus_spend_status = null;
      order.bonus_spend_amount = 0;
    }

    const [earnRows] = await ordersDb.query(
      "SELECT amount, expires_at, status FROM loyalty_transactions WHERE order_id = ? AND type = 'earn' ORDER BY created_at DESC LIMIT 1",
      [orderId],
    );

    order.bonus_earn_expires_at = earnRows[0]?.expires_at || null;
    order.bonus_earn_status = earnRows[0]?.status || null;

    const bonusBase = Math.max(0, (parseFloat(order.subtotal) || 0) - (parseFloat(order.bonus_spent) || 0));
    order.bonus_base_amount = bonusBase;
    order.bonus_earn_percent = order.loyalty_earn_percentage ?? null;
    order.bonus_level_name = order.loyalty_level_name || null;

    res.json({ order });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновление статуса заказа
 */
export const updateOrderStatus = async (req, res, next, forcedStatus = null) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const orderId = req.params.id;
    const status = forcedStatus || req.body.status;

    const validStatuses = ["pending", "confirmed", "preparing", "ready", "delivering", "completed", "cancelled"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const [orders] = await ordersDb.query("SELECT city_id, order_type FROM orders WHERE id = ?", [orderId]);

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user.role === "manager" && !req.user.cities.includes(orders[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [oldOrderData] = await ordersDb.query(
      "SELECT status, user_id, total, subtotal, delivery_cost, bonus_spent, order_number, order_type, bonus_earn_amount, branch_id FROM orders WHERE id = ?",
      [orderId],
    );

    const oldStatus = oldOrderData[0]?.status;
    const userId = oldOrderData[0]?.user_id;
    const orderTotal = parseFloat(oldOrderData[0]?.total) || 0;
    const subtotal = parseFloat(oldOrderData[0]?.subtotal) || 0;
    const deliveryCost = parseFloat(oldOrderData[0]?.delivery_cost) || 0;
    const bonusUsed = parseFloat(oldOrderData[0]?.bonus_spent) || 0;
    const bonusEarnAmount = parseFloat(oldOrderData[0]?.bonus_earn_amount) || 0;
    const orderNumber = oldOrderData[0]?.order_number;

    const statusOrder = {
      pending: 0,
      confirmed: 1,
      preparing: 2,
      ready: 3,
      delivering: 3,
      completed: 4,
      cancelled: -1,
    };

    const oldStatusIndex = statusOrder[oldStatus];
    const newStatusIndex = statusOrder[status];

    if (oldStatusIndex === undefined || newStatusIndex === undefined) {
      return res.status(400).json({
        error: "Invalid status transition",
      });
    }

    const settings = await getSettingsByRequest(req);
    const useLocalBonuses = settings.bonuses_enabled && !settings.premiumbonus_enabled;
    const loyaltyLevels = await getLoyaltyLevelsFromDb(ordersDb);

    const orderData = {
      id: orderId,
      user_id: userId,
      order_number: orderNumber,
      total: orderTotal,
      subtotal,
      delivery_cost: deliveryCost,
      bonus_spent: bonusUsed,
      bonus_earn_amount: bonusEarnAmount,
    };

    // Обновление статуса с retry
    const updateStatusWithRetry = async (attempts = 3) => {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const [result] = await ordersDb.query("UPDATE orders SET status = ?, completed_at = ? WHERE id = ? AND status = ?", [
            status,
            status === "completed" ? new Date() : null,
            orderId,
            oldStatus,
          ]);

          if ((result?.affectedRows || 0) === 0) {
            return false;
          }

          return true;
        } catch (error) {
          if (error?.code !== "ER_LOCK_WAIT_TIMEOUT" || attempt === attempts) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
      }
      return false;
    };

    const updated = await updateStatusWithRetry();

    if (!updated) {
      const [currentOrders] = await ordersDb.query("SELECT * FROM orders WHERE id = ?", [orderId]);
      return res.status(409).json({ error: "Заказ уже обновлен", order: currentOrders[0] || null });
    }

    // История статусов
    if (oldStatus !== status) {
      await ordersDb.query(
        "INSERT INTO order_status_history (order_id, old_status, new_status, changed_by_type, changed_by_admin_id) VALUES (?, ?, ?, 'admin', ?)",
        [orderId, oldStatus, status, req.user?.id || null],
      );
    }

    const [updatedOrders] = await ordersDb.query("SELECT * FROM orders WHERE id = ?", [orderId]);

    await logger.order.statusChanged(orderId, oldStatus, status, req.user.id);

    // WebSocket уведомление
    try {
      notifyOrderStatusUpdate(orderId, userId, status, oldStatus, oldOrderData[0]?.branch_id || null);
    } catch (wsError) {
      logger.error("Failed to notify order status update via WebSocket", {
        error: wsError?.message || String(wsError),
        orderId,
        status,
      });
    }

    // Telegram уведомление персоналу о смене статуса (по системным настройкам)
    try {
      if (oldStatus !== status && (status === "completed" || status === "cancelled")) {
        await addTelegramNotification({
          type: "status_change",
          priority: 1,
          data: {
            order_number: updatedOrders[0]?.order_number || orderNumber,
            old_status: oldStatus,
            new_status: status,
            city_id: updatedOrders[0]?.city_id || null,
          },
        });
      }
    } catch (queueError) {
      logger.error("Failed to queue Telegram status change notification", { error: queueError });
    }

    // Пользовательское уведомление о смене статуса заказа
    try {
      const orderNumber = updatedOrders[0].order_number;
      const orderType = updatedOrders[0].order_type;
      await sendOrderStatusNotification({
        userId,
        orderId,
        orderNumber,
        status,
        orderType,
      });
    } catch (notificationError) {
      // Ошибки пользовательских уведомлений не критичны
    }

    if (status === "completed" && oldStatus !== "completed") {
      await scheduleOrderRatingReminder({
        orderId,
        userId,
        orderNumber: updatedOrders[0].order_number,
        completedAt: updatedOrders[0].completed_at || new Date(),
      });
    }

    // Трекинг конверсий
    if (status === "completed" && oldStatus !== "completed") {
      try {
        const { recordConversionForOrder } = await import("../../broadcasts/services/statisticsService.js");
        await recordConversionForOrder({
          id: orderId,
          user_id: userId,
          total: orderTotal,
          created_at: updatedOrders[0].created_at || new Date(),
        });
      } catch (conversionError) {
        // Conversion tracking errors are non-critical
      }
    }

    // Обработка бонусов выполняется синхронно, чтобы не терять откаты при отмене.
    if (useLocalBonuses) {
      try {
        if (oldStatus === "completed" && status !== "completed" && status !== "cancelled") {
          await removeEarnedBonuses(orderData, null, loyaltyLevels);
        }

        if (status === "completed" && oldStatus !== "completed" && orderTotal > 0) {
          await ordersDb.query("UPDATE loyalty_transactions SET status = 'completed' WHERE order_id = ? AND type = 'spend' AND status = 'pending'", [
            orderId,
          ]);

          if (orderData.bonus_earn_amount && orderData.bonus_earn_amount > 0) {
            await redeliveryEarnBonuses(orderData, null, loyaltyLevels);
          } else {
            await earnBonuses(orderData, null, loyaltyLevels);
          }
        }

        if (status === "cancelled" && oldStatus !== "cancelled") {
          await cancelOrderBonuses(orderData, null, loyaltyLevels);
        }
      } catch (bonusError) {
        logger.bonus.error(`Failed to process bonus side effects for order ${orderId}`, { error: bonusError.message });
      }
    }

    if (
      (settings.iiko_enabled && settings?.integration_mode?.orders === "external") ||
      settings.premiumbonus_enabled
    ) {
      logger.info("Статус заказа изменен локально при активной внешней интеграции", { orderId, status });
    }

    const pbPurchasesExternal =
      settings.premiumbonus_enabled && settings.premiumbonus_auto_sync_enabled !== false && settings?.integration_mode?.loyalty === "external";
    if (pbPurchasesExternal && oldStatus !== status) {
      await ordersDb.query(
        "UPDATE orders SET pb_sync_status = 'pending', pb_sync_error = NULL, pb_sync_attempts = 0, pb_last_sync_at = NOW() WHERE id = ?",
        [orderId],
      );
      const hasPbPurchaseId = String(updatedOrders[0]?.pb_purchase_id || "").trim().length > 0;
      const pbAction = status === "cancelled" ? (hasPbPurchaseId ? "cancel" : "create") : hasPbPurchaseId ? "status" : "create";
      try {
        const syncJob = await ordersAdapter.enqueuePurchaseSync(orderId, pbAction, { source: "admin-status-update" });
        if (!syncJob?.skipped) {
          logger.info("Покупка поставлена в очередь синхронизации PremiumBonus после смены статуса", {
            orderId,
            status,
            action: pbAction,
            jobId: syncJob.jobId || null,
          });
        }
      } catch (syncError) {
        logger.error("Ошибка постановки PB-синхронизации после смены статуса", {
          orderId,
          status,
          action: pbAction,
          error: syncError?.message || String(syncError),
        });
      }
    }

    res.json({ order: updatedOrders[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение оценок заказов (админ)
 */
export const getOrderRatings = async (req, res, next) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const { city_id, branch_id, rating, date_from, date_to, search, limit = 50, offset = 0 } = req.query;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const where = ["1=1"];
    const params = [];

    if (req.user.role === "manager") {
      where.push("o.city_id IN (?)");
      params.push(req.user.cities);
    } else if (city_id) {
      where.push("o.city_id = ?");
      params.push(Number(city_id));
    }

    if (branch_id) {
      where.push("o.branch_id = ?");
      params.push(Number(branch_id));
    }

    if (rating) {
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ error: "Фильтр rating должен быть числом от 1 до 5" });
      }
      where.push("r.rating = ?");
      params.push(numericRating);
    }

    if (date_from) {
      where.push("DATE(r.created_at) >= ?");
      params.push(date_from);
    }

    if (date_to) {
      where.push("DATE(r.created_at) <= ?");
      params.push(date_to);
    }

    if (search) {
      const searchValue = `%${String(search).trim()}%`;
      where.push(
        "(o.order_number LIKE ? OR u.phone LIKE ? OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ? OR r.comment LIKE ?)",
      );
      params.push(searchValue, searchValue, searchValue, searchValue);
    }

    const whereClause = where.join(" AND ");

    const [rows] = await ordersDb.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
              o.id as order_id, o.order_number, o.order_type, o.completed_at,
              c.id as city_id, c.name as city_name,
              b.id as branch_id, b.name as branch_name,
              u.id as user_id, u.phone as user_phone, u.first_name as user_first_name, u.last_name as user_last_name
       FROM order_ratings r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN cities c ON c.id = o.city_id
       LEFT JOIN branches b ON b.id = o.branch_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset],
    );

    const [countRows] = await ordersDb.query(
      `SELECT COUNT(*) as total
       FROM order_ratings r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE ${whereClause}`,
      params,
    );

    res.json({
      ratings: rows,
      total: Number(countRows[0]?.total || 0),
      limit: safeLimit,
      offset: safeOffset,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение статистики заказов
 */
export const getOrdersStats = async (req, res, next) => {
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const { city_id, date_from, date_to } = req.query;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (req.user.role === "manager") {
      whereClause += " AND city_id IN (?)";
      params.push(req.user.cities);
    } else if (city_id) {
      whereClause += " AND city_id = ?";
      params.push(city_id);
    }

    if (date_from) {
      whereClause += " AND created_at >= ?";
      params.push(date_from);
    }

    if (date_to) {
      whereClause += " AND created_at <= ?";
      params.push(date_to);
    }

    const [totalStats] = await ordersDb.query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(total) as total_revenue,
        AVG(total) as average_order_value
       FROM orders ${whereClause}`,
      params,
    );

    const [statusStats] = await ordersDb.query(
      `SELECT status, COUNT(*) as count
       FROM orders ${whereClause}
       GROUP BY status`,
      params,
    );

    const [typeStats] = await ordersDb.query(
      `SELECT order_type, COUNT(*) as count
       FROM orders ${whereClause}
       GROUP BY order_type`,
      params,
    );

    res.json({
      total: totalStats[0],
      by_status: statusStats,
      by_type: typeStats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Удаление заказа (только admin)
 */
export const deleteAdminOrder = async (req, res, next) => {
  let connection = null;
  try {
    const ordersDb = await getOrdersDbByRequest(req);
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: "Некорректный ID заказа" });
    }

    connection = await ordersDb.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.query(
      "SELECT id, order_number, status, user_id, total, subtotal, delivery_cost, bonus_spent, bonus_earn_amount FROM orders WHERE id = ? FOR UPDATE",
      [orderId],
    );
    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orders[0];
    const settings = await getSettingsByRequest(req);
    const useLocalBonuses = settings.bonuses_enabled && !settings.premiumbonus_enabled;

    if (useLocalBonuses) {
      const loyaltyLevels = await getLoyaltyLevelsFromDb(connection);
      const orderData = {
        id: order.id,
        user_id: order.user_id,
        order_number: order.order_number,
        total: parseFloat(order.total) || 0,
        subtotal: parseFloat(order.subtotal) || 0,
        delivery_cost: parseFloat(order.delivery_cost) || 0,
        bonus_spent: parseFloat(order.bonus_spent) || 0,
        bonus_earn_amount: parseFloat(order.bonus_earn_amount) || 0,
      };
      await cancelOrderBonuses(orderData, connection, loyaltyLevels);
    }

    const [result] = await connection.query("DELETE FROM orders WHERE id = ?", [orderId]);
    if ((result?.affectedRows || 0) === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found" });
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Заказ #${order.order_number} удален`,
      deleted_order_id: orderId,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // Игнорируем ошибку rollback.
      }
    }
    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
