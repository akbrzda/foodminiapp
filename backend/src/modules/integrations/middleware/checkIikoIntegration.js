import { getIntegrationSettings } from "../services/integrationConfigService.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function checkIikoIntegration(req, res, next) {
  try {
    if (READ_METHODS.has(req.method)) return next();

    const settings = await getIntegrationSettings();
    const menuMode = String(settings?.integrationMode?.menu || "local").trim().toLowerCase();
    if (settings.iikoEnabled && menuMode === "external") {
      return res.status(403).json({
        error: "Редактирование локальных данных отключено. Активна интеграция с iiko.",
        message: "Управляйте данными в системе iiko",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export default checkIikoIntegration;
