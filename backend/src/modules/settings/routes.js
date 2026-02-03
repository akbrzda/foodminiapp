import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { getSystemSettings, getSettingsList, updateSystemSettings } from "../../utils/settings.js";
import { logger } from "../../utils/logger.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({ settings });
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

export default router;
