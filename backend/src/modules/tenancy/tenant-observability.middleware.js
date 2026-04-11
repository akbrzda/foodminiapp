import { tenancyConfig } from "../../config/tenancy.js";
import { logger } from "../../utils/logger.js";

export const logTenantAccess = (moduleName) => (req, _res, next) => {
  if (!tenancyConfig.runtimeEnabled) return next();
  const context = req.tenantContext || null;
  if (!context?.isResolved) return next();

  logger.system.info("Tenant module access", {
    module: moduleName,
    method: req.method,
    path: req.originalUrl || req.url,
    tenant_id: context.tenantId,
    slug: context.slug,
    tenant_slug: context.slug,
    tenant_status: context.status,
    tenant_source: context.source,
  });
  return next();
};

