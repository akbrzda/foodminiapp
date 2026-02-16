import { getIntegrationSettings } from "../services/integrationConfigService.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function checkPremiumBonusIntegration(req, res, next) {
  try {
    if (READ_METHODS.has(req.method)) return next();

    const settings = await getIntegrationSettings();
    if (settings.premiumbonusEnabled) {
      return res.status(403).json({
        error: "Управление лояльностью отключено. Активна интеграция с PremiumBonus.",
        message: "Управляйте правилами лояльности в PremiumBonus",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export default checkPremiumBonusIntegration;
