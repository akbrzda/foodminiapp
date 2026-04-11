import { tenancyConfig } from "../../config/tenancy.js";
import { logger } from "../../utils/logger.js";
import { parseTenantSlugFromHost, normalizeTenantSlug } from "./slug.js";
import { platformCoreTenantService } from "./platform-core-tenant.service.js";

const getTrustedHeaderValue = (req) => {
  const headerName = tenancyConfig.trustedHeaderName;
  const rawValue = req.headers?.[headerName];
  if (!rawValue) return "";
  return Array.isArray(rawValue) ? rawValue[0] : rawValue;
};

const getRequestHost = (req) => {
  const forwardedHost = req.headers?.["x-forwarded-host"];
  const hostFromForwarded = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  return String(hostFromForwarded || req.headers?.host || "").trim();
};

const buildDefaultContext = () => ({
  enabled: tenancyConfig.runtimeEnabled,
  shadowMode: tenancyConfig.shadowMode,
  source: "none",
  host: "",
  slug: null,
  tenantId: null,
  dbName: null,
  status: null,
  isResolved: false,
  error: null,
});

const sendTenantNotFound = (res) =>
  res.status(404).json({
    error: "Tenant not found",
    code: "TENANT_NOT_FOUND",
  });

export const attachTenantContext = async (req, res, next) => {
  const context = buildDefaultContext();
  req.tenantContext = context;

  if (!tenancyConfig.runtimeEnabled) {
    return next();
  }

  const requestHost = getRequestHost(req);
  const hostSlug = parseTenantSlugFromHost({
    host: requestHost,
    ownerHost: tenancyConfig.ownerHost,
    rootDomain: tenancyConfig.rootDomain,
  });
  const trustedHeaderSlug = normalizeTenantSlug(getTrustedHeaderValue(req));
  const candidateSlug = hostSlug || trustedHeaderSlug || null;

  context.host = requestHost;
  context.slug = candidateSlug;
  context.source = hostSlug ? "host" : trustedHeaderSlug ? "trusted-header" : "none";

  if (!candidateSlug) {
    if (tenancyConfig.shadowMode) return next();
    return sendTenantNotFound(res);
  }

  try {
    const tenant = await platformCoreTenantService.getBySlug(candidateSlug);
    if (!tenant) {
      if (tenancyConfig.shadowMode) {
        logger.system.warn("Tenant not found in shadow mode", {
          host: requestHost,
          slug: candidateSlug,
        });
        return next();
      }
      return sendTenantNotFound(res);
    }

    context.tenantId = tenant.id;
    context.dbName = tenant.db_name;
    context.status = tenant.status;
    context.isResolved = true;
    return next();
  } catch (error) {
    context.error = error?.message || "Unknown tenant resolution error";
    logger.system.warn("Tenant resolution failed", {
      error: context.error,
      host: requestHost,
      slug: candidateSlug,
      shadowMode: tenancyConfig.shadowMode,
    });
    if (tenancyConfig.shadowMode) return next();
    return res.status(503).json({
      error: "Tenant resolution unavailable",
      code: "TENANT_RESOLUTION_UNAVAILABLE",
    });
  }
};
