import express from "express";
import { tenancyConfig } from "../../config/tenancy.js";
import { tenantDbManager } from "./tenant-db-manager.js";

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
  const isStatusAllowed = !["suspended", "cancelled", "deleted"].includes(
    String(context?.status || "")
      .trim()
      .toLowerCase()
  );

  const isReady = !tenancyConfig.runtimeEnabled || (isResolved && isStatusAllowed);

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? "ok" : "fail",
    checks: {
      runtime_enabled: tenancyConfig.runtimeEnabled ? "ok" : "disabled",
      tenant_resolved: isResolved ? "ok" : "fail",
      tenant_status: isStatusAllowed ? "ok" : "fail",
    },
    tenancy: context,
    dbManager: tenantDbManager.getStats(),
  });
});

export { router };
