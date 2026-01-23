import express from "express";
import db from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { getBonusHistory, calculateMaxUsableBonuses, getLoyaltyLevelsFromSettings, getMaxUsePercentFromSettings, getRedeemPercentForLevel } from "../utils/bonuses.js";
import { getSystemSettings } from "../utils/settings.js";
const router = express.Router();
const ensureBonusesEnabled = async (res) => {
  const settings = await getSystemSettings();
  if (!settings.bonuses_enabled) {
    res.status(403).json({ error: "Бонусная система отключена" });
    return false;
  }
  return true;
};
router.get("/balance", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      balance: parseFloat(users[0].bonus_balance),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/history", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    const history = await getBonusHistory(userId, parseInt(limit), parseInt(offset));
    res.json({ history });
  } catch (error) {
    next(error);
  }
});
router.post("/calculate-usable", authenticateToken, async (req, res, next) => {
  try {
    if (!(await ensureBonusesEnabled(res))) return;
    const userId = req.user.id;
    const { order_subtotal } = req.body;
    if (!order_subtotal || order_subtotal <= 0) {
      return res.status(400).json({
        error: "order_subtotal is required and must be greater than 0",
      });
    }
    const [users] = await db.query("SELECT bonus_balance, loyalty_level FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const userBalance = parseFloat(users[0].bonus_balance);
    const loyaltyLevel = users[0]?.loyalty_level || 1;
    const settings = await getSystemSettings();
    const loyaltyLevels = getLoyaltyLevelsFromSettings(settings);
    const maxUsePercent = getRedeemPercentForLevel(loyaltyLevel, loyaltyLevels, getMaxUsePercentFromSettings(settings));
    const maxUsable = calculateMaxUsableBonuses(order_subtotal, maxUsePercent);
    const available = Math.min(userBalance, maxUsable);
    res.json({
      user_balance: userBalance,
      max_usable_for_order: maxUsable,
      available_to_use: available,
    });
  } catch (error) {
    next(error);
  }
});
export default router;
