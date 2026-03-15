import { getIntegrationSettings } from "../services/integrationConfigService.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function checkIikoIntegration(req, res, next) {
  try {
    if (READ_METHODS.has(req.method)) return next();
    // При включенной интеграции CRUD локального меню разрешен.
    // Ограничения контролируются правами доступа админ-панели.
    await getIntegrationSettings();

    return next();
  } catch (error) {
    return next(error);
  }
}

export default checkIikoIntegration;
