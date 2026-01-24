import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";
import { getLoyaltySettings, getLoyaltySettingsList, updateLoyaltySettings } from "../utils/loyaltySettings.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const settings = await getLoyaltySettings();
    const [levels] = await db.query(
      "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order FROM loyalty_levels WHERE is_active = TRUE ORDER BY sort_order ASC, level_number ASC",
    );
    res.json({ settings, levels });
  } catch (error) {
    next(error);
  }
});

router.get("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const settings = await getLoyaltySettings();
    const [levels] = await db.query(
      "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order FROM loyalty_levels ORDER BY sort_order ASC, level_number ASC",
    );
    res.json({
      settings,
      items: getLoyaltySettingsList(settings),
      levels,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/admin", authenticateToken, requireRole("admin", "ceo"), async (req, res, next) => {
  try {
    const { settings: patch } = req.body || {};
    const { updated, errors } = await updateLoyaltySettings(patch);

    if (errors) {
      return res.status(400).json({ errors });
    }

    await logger.admin.action(req.user?.id, "update_loyalty_settings", "loyalty_settings", null, JSON.stringify(updated), req);

    const settings = await getLoyaltySettings();
    const [levels] = await db.query(
      "SELECT id, name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order FROM loyalty_levels ORDER BY sort_order ASC, level_number ASC",
    );
    res.json({ settings, items: getLoyaltySettingsList(settings), levels });
  } catch (error) {
    next(error);
  }
});

export default router;
