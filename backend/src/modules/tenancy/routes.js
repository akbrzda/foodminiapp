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

export { router };

