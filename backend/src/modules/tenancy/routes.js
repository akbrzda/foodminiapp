import express from "express";
import { tenancyConfig } from "../../config/tenancy.js";
import { tenantDbManager } from "./tenant-db-manager.js";
import { platformCoreTenantService } from "./platform-core-tenant.service.js";

const router = express.Router();

router.get("/tenant-context", (req, res) => {
  if (!tenancyConfig.debugEndpointEnabled || process.env.NODE_ENV === "production") {
    return res.status(404).json({
      error: "Not found",
    });
  }

  return res.json({
    tenancy: req.tenantContext || null,
    dbManager: tenantDbManager.getStats(),
  });
});

router.get("/tenant-runtime-ready", (req, res) => {
  if (!tenancyConfig.debugEndpointEnabled || process.env.NODE_ENV === "production") {
    return res.status(404).json({
      error: "Not found",
    });
  }

  const context = req.tenantContext || null;
  const isResolved = Boolean(context?.isResolved);
  const isStatusAllowed = !platformCoreTenantService.isBlockedStatus(context?.status);

  const isReady = !tenancyConfig.runtimeEnabled || (isResolved && isStatusAllowed);
  const reasons = [];
  if (tenancyConfig.runtimeEnabled && !isResolved) reasons.push("TENANT_UNRESOLVED");
  if (tenancyConfig.runtimeEnabled && isResolved && !isStatusAllowed) reasons.push("TENANT_BLOCKED");
  if ((tenantDbManager.getStats()?.connectionErrors || 0) > 0) reasons.push("TENANT_DB_CONNECTION_ERRORS");

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? "ok" : "fail",
    checks: {
      runtime_enabled: tenancyConfig.runtimeEnabled ? "ok" : "disabled",
      tenant_resolved: isResolved ? "ok" : "fail",
      tenant_status: isStatusAllowed ? "ok" : "fail",
    },
    reasons,
    tenancy: context,
    dbManager: tenantDbManager.getStats(),
  });
});

export { router };
