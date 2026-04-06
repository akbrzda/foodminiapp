import redis from "../../config/redis.js";
import { tenancyConfig } from "../../config/tenancy.js";
import { tenantDbManager } from "../tenancy/tenant-db-manager.js";
import { getSystemSettings, updateSystemSettings } from "../../utils/settings.js";

const getTenantRuntime = async (req) => {
  if (!tenancyConfig.runtimeEnabled) return null;
  const context = req.tenantContext || null;
  if (!context?.isResolved || !context?.dbName || !context?.tenantId) return null;
  const dbConn = await tenantDbManager.getPool(context.dbName);
  return {
    dbConn,
    redisClient: redis,
    cacheKey: `settings:tenant:${context.tenantId}`,
  };
};

export const getSettingsByRequest = async (req) => {
  const tenantRuntime = await getTenantRuntime(req);
  if (!tenantRuntime) {
    return getSystemSettings();
  }
  return getSystemSettings(tenantRuntime);
};

export const updateSettingsByRequest = async (req, patch) => {
  const tenantRuntime = await getTenantRuntime(req);
  if (!tenantRuntime) {
    return updateSystemSettings(patch);
  }
  return updateSystemSettings(patch, tenantRuntime);
};

