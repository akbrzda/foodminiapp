import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { getSystemSettings, getSettingsList, updateSystemSettings } from "../../utils/settings.js";
import { logger } from "../../utils/logger.js";
import { sendTelegramStartMessage } from "../../utils/telegram.js";

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

export default router;
