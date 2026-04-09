import { tenancyConfig } from "../../config/tenancy.js";
import { getTenantStatusCode, isTenantStatusBlocked } from "./tenant-status.service.js";

export const requireActiveTenant = (req, res, next) => {
  if (!tenancyConfig.runtimeEnabled) return next();

  const context = req.tenantContext || null;
  if (!context?.isResolved) {
    if (tenancyConfig.shadowMode) return next();
    return res.status(404).json({
      error: "Tenant not found",
      code: "TENANT_NOT_FOUND",
    });
  }

  if (isTenantStatusBlocked(context.status)) {
    return res.status(403).json({
      error: "Tenant access is blocked",
      code: getTenantStatusCode(context.status),
      tenant_status: context.status,
    });
  }

  return next();
};

