import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { getSystemSettings, getSettingsList, updateSystemSettings } from "../../utils/settings.js";
import { logger } from "../../utils/logger.js";
import { sendTelegramStartMessage } from "../../utils/telegram.js";
import { addTelegramNotification } from "../../queues/config.js";

const router = express.Router();

const PUBLIC_SETTINGS_ALLOWLIST = new Set([
  "bonuses_enabled",
  "orders_enabled",
  "delivery_enabled",
  "pickup_enabled",
  "iiko_enabled",
  "premiumbonus_enabled",
  "integration_mode",
]);

const filterPublicSettings = (settings) => {
  const result = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (PUBLIC_SETTINGS_ALLOWLIST.has(key)) {
      result[key] = value;
    }
  }
  return result;
};

router.get("/", async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({ settings: filterPublicSettings(settings) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      settings,
      items: getSettingsList(settings),
    });
  } catch (error) {
    next(error);
  }
});

router.put("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { settings: patch } = req.body || {};
    const { updated, errors } = await updateSystemSettings(patch);

    if (errors) {
      return res.status(400).json({ errors });
    }

    await logger.admin.action(req.user?.id, "update_settings", "settings", null, JSON.stringify(updated), req);

    const settings = await getSystemSettings();
    res.json({ settings, items: getSettingsList(settings) });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/telegram-start/test", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const telegramIdRaw = req.body?.telegram_id;
    const telegramId = Number(telegramIdRaw);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return res.status(400).json({ error: "Укажите корректный telegram_id" });
    }

    const settings = await getSystemSettings();
    const sent = await sendTelegramStartMessage(telegramId, settings);
    if (!sent) {
      return res.status(400).json({ error: "Не удалось отправить тестовое сообщение" });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/telegram-orders/test", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const eventTypeRaw = String(req.body?.event_type || "new_order").trim().toLowerCase();
    const allowedEventTypes = new Set(["new_order", "completed", "cancelled"]);
    if (!allowedEventTypes.has(eventTypeRaw)) {
      return res.status(400).json({ error: "event_type должен быть new_order, completed или cancelled" });
    }

    const cityIdRaw = req.body?.city_id;
    let cityId = null;
    if (cityIdRaw !== undefined && cityIdRaw !== null && String(cityIdRaw).trim() !== "") {
      const parsedCityId = Number(cityIdRaw);
      if (!Number.isInteger(parsedCityId) || parsedCityId <= 0) {
        return res.status(400).json({ error: "city_id должен быть положительным числом" });
      }
      cityId = parsedCityId;
    }

    const settings = await getSystemSettings();
    const orderSettings = settings?.telegram_new_order_notification || {};
    const groupId = String(orderSettings.group_id || "").trim();
    if (!groupId) {
      return res.status(400).json({ error: "Укажите group_id в настройках Telegram-уведомлений по заказам" });
    }

    if (eventTypeRaw === "new_order") {
      await addTelegramNotification({
        type: "new_order",
        priority: 1,
        data: {
          is_test: true,
          city_id: cityId,
          order_number: "TEST-0001",
          order_type: "delivery",
          city_name: "Тестовый город",
          branch_name: "Тестовый филиал",
          delivery_street: "Тестовая улица",
          delivery_house: "1",
          delivery_apartment: "1",
          delivery_entrance: "1",
          total: 999,
          items: [
            {
              item_name: "Тестовая позиция",
              variant_name: "Стандарт",
              quantity: 1,
              subtotal: 999,
              modifiers: [],
            },
          ],
          payment_method: "cash",
          comment: "Тестовое уведомление",
        },
      });
    } else {
      await addTelegramNotification({
        type: "status_change",
        priority: 1,
        data: {
          is_test: true,
          city_id: cityId,
          order_number: "TEST-0001",
          old_status: eventTypeRaw === "completed" ? "delivering" : "confirmed",
          new_status: eventTypeRaw,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
