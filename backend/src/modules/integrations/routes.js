import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { logger } from "../../utils/logger.js";
import {
  getAdminIntegrationSettings,
  getIikoReadiness,
  listIikoMappingCandidates,
  listIikoManualMappingTargets,
  getIikoNomenclatureOverview,
  getIntegrationSyncStatus,
  getIntegrationQueuesStatus,
  listIntegrationSyncLogs,
  refreshIikoReadinessNow,
  retryAllFailed,
  retrySingleEntity,
  resolveIikoMappingCandidate,
  runIikoOnboarding,
  syncIikoMenuNow,
  syncIikoStopListNow,
  syncIikoDeliveryZonesNow,
  testIikoConnection,
  testPremiumBonusConnection,
  updateAdminIntegrationSettings,
} from "./services/integrationAdminService.js";

const router = express.Router();

router.use(authenticateToken, requireRole("admin", "ceo"));

router.get("/settings", async (req, res, next) => {
  try {
    const data = await getAdminIntegrationSettings();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/iiko/nomenclature-overview", async (req, res, next) => {
  try {
    const data = await getIikoNomenclatureOverview({
      externalMenuId: req.query?.external_menu_id,
      priceCategoryId: req.query?.price_category_id,
    });
    return res.json(data);
  } catch (error) {
    next(error);
  }
});

router.put("/settings", async (req, res, next) => {
  try {
    const { settings } = req.body || {};
    const result = await updateAdminIntegrationSettings(settings || {});
    if (result.errors) {
      return res.status(400).json({ errors: result.errors });
    }

    await logger.admin.action(req.user?.id, "update_integrations_settings", "settings", null, JSON.stringify(result.updated), req);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/test-connection", async (req, res, next) => {
  try {
    const result = await testIikoConnection();
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/premiumbonus/test-connection", async (req, res, next) => {
  try {
    const result = await testPremiumBonusConnection();
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/sync-menu", async (req, res, next) => {
  try {
    const result = await syncIikoMenuNow({ cityId: req.body?.city_id || null });
    if (!result.accepted) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/sync-stoplist", async (req, res, next) => {
  try {
    const result = await syncIikoStopListNow({ branchId: req.body?.branch_id || null });
    if (!result.accepted) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/sync-delivery-zones", async (req, res, next) => {
  try {
    const result = await syncIikoDeliveryZonesNow();
    if (!result.accepted) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/iiko/sync-status", async (req, res, next) => {
  try {
    const data = await getIntegrationSyncStatus();
    return res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/iiko/readiness", async (req, res, next) => {
  try {
    const data = await getIikoReadiness();
    return res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/readiness/refresh", async (req, res, next) => {
  try {
    const result = await refreshIikoReadinessNow();
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/iiko/mapping-candidates", async (req, res, next) => {
  try {
    const result = await listIikoMappingCandidates(req.query || {});
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/iiko/mapping-options", async (req, res, next) => {
  try {
    const result = await listIikoManualMappingTargets(req.query || {});
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/mapping/resolve", async (req, res, next) => {
  try {
    const result = await resolveIikoMappingCandidate({
      candidate_id: req.body?.candidate_id,
      action: req.body?.action,
      resolved_by: req.user?.id || null,
      target_local_id: req.body?.target_local_id || null,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/iiko/onboarding", async (req, res, next) => {
  try {
    const result = await runIikoOnboarding({
      action: req.body?.action,
      admin_user_id: req.user?.id || null,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get("/sync-logs", async (req, res, next) => {
  try {
    const result = await listIntegrationSyncLogs(req.query || {});
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/queues", async (req, res, next) => {
  try {
    const result = await getIntegrationQueuesStatus();
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/retry-failed", async (req, res, next) => {
  try {
    const result = await retryAllFailed();
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/retry-entity", async (req, res, next) => {
  try {
    const { type, id } = req.body || {};
    const result = await retrySingleEntity({ type, id });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
