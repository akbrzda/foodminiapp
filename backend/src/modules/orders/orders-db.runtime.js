import db from "../../config/database.js";
import { tenancyConfig } from "../../config/tenancy.js";
import { getTenantPoolByRequest } from "../tenancy/tenant-connection.factory.js";

export const getOrdersDbByRequest = async (req) => {
  if (!tenancyConfig.runtimeEnabled) return db;
  const tenantPool = await getTenantPoolByRequest(req);
  return tenantPool || db;
};

