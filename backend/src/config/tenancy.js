import dotenv from "dotenv";

dotenv.config();

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const normalizeString = (value, fallback = "") => {
  const normalized = String(value || "").trim();
  return normalized || fallback;
};

export const tenancyConfig = {
  runtimeEnabled: normalizeBoolean(process.env.SAAS_TENANT_RUNTIME, false),
  shadowMode: normalizeBoolean(process.env.SAAS_TENANT_SHADOW_MODE, true),
  debugEndpointEnabled: normalizeBoolean(process.env.TENANCY_DEBUG_ENDPOINT_ENABLED, false),
  ownerHost: normalizeString(process.env.TENANCY_OWNER_HOST, "owner.example.com").toLowerCase(),
  rootDomain: normalizeString(process.env.TENANCY_ROOT_DOMAIN, "example.com").toLowerCase(),
  trustedHeaderName: normalizeString(process.env.TENANCY_TRUSTED_SLUG_HEADER, "x-tenant-slug"),
  platformDbName: normalizeString(process.env.PLATFORM_DB_NAME, "platform_core"),
  dbConnectionLimit: Number.parseInt(process.env.TENANCY_DB_CONNECTION_LIMIT || "5", 10) || 5,
  maxTenantPools: Number.parseInt(process.env.TENANCY_DB_MAX_POOLS || "50", 10) || 50,
  poolIdleMs: Number.parseInt(process.env.TENANCY_DB_POOL_IDLE_MS || "600000", 10) || 600000,
  cleanupIntervalMs:
    Number.parseInt(process.env.TENANCY_DB_CLEANUP_INTERVAL_MS || "60000", 10) || 60000,
};
