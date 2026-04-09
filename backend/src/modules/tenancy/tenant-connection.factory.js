import { tenancyConfig } from "../../config/tenancy.js";
import { tenantDbManager } from "./tenant-db-manager.js";

export const getTenantPoolByRequest = async (req) => {
  if (!tenancyConfig.runtimeEnabled) return null;
  const context = req.tenantContext || null;
  if (!context?.isResolved || !context?.dbName) return null;
  return tenantDbManager.getPool(context.dbName);
};

export const getTenantConnectionByRequest = async (req) => {
  const pool = await getTenantPoolByRequest(req);
  if (!pool) return null;
  return pool.getConnection();
};

