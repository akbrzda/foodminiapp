import express from "express";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { checkPremiumBonusIntegration } from "../integrations/middleware/checkPremiumBonusIntegration.js";

export function createLoyaltyRoutes({ clientController, adminController }) {
  const clientRouter = express.Router();
  const adminRouter = express.Router();

  clientRouter.get("/balance", authenticateToken, clientController.getBalance);
  clientRouter.get("/calculate-max-spend", authenticateToken, clientController.calculateMaxSpend);
  clientRouter.get("/history", authenticateToken, clientController.getHistory);
  clientRouter.get("/levels", authenticateToken, clientController.getLevels);
  clientRouter.post("/promocode/activate", authenticateToken, clientController.activatePromocode);
  clientRouter.post("/confirmation/send-writeoff-code", authenticateToken, clientController.sendWriteOffConfirmationCode);
  clientRouter.post("/confirmation/verify", authenticateToken, clientController.verifyConfirmationCode);

  adminRouter.get("/status", authenticateToken, requirePermission("system.loyalty_levels.manage"), adminController.getStatus);
  adminRouter.put(
    "/toggle",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    checkPremiumBonusIntegration,
    adminController.toggle,
  );
  adminRouter.post("/adjust", authenticateToken, requirePermission("clients.loyalty.adjust"), adminController.adjust);
  adminRouter.post(
    "/accruals/calculate",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    adminController.calculateBulkAccrualAudience,
  );
  adminRouter.get(
    "/accruals",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    adminController.listBulkAccruals,
  );
  adminRouter.post(
    "/accruals",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    adminController.createBulkAccrual,
  );
  adminRouter.get(
    "/accruals/:id",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    adminController.getBulkAccrual,
  );
  adminRouter.post(
    "/accruals/:id/start",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    adminController.startBulkAccrual,
  );
  adminRouter.get(
    "/accruals/:id/recipients",
    authenticateToken,
    requirePermission("system.loyalty_levels.manage"),
    adminController.listBulkAccrualRecipients,
  );
  adminRouter.get("/levels", authenticateToken, requirePermission("system.loyalty_levels.manage"), adminController.getLevels);
  adminRouter.get("/info-sections", authenticateToken, requirePermission("system.loyalty_levels.manage"), adminController.getInfoSections);
  adminRouter.put("/info-sections", authenticateToken, requirePermission("system.loyalty_levels.manage"), adminController.saveInfoSections);
  adminRouter.put("/levels", authenticateToken, requirePermission("system.loyalty_levels.manage"), adminController.saveLevels);
  adminRouter.get(
    "/users/:id/loyalty",
    authenticateToken,
    requirePermission("clients.view", "clients.loyalty.adjust"),
    adminController.getUserLoyalty,
  );

  return { clientRouter, adminRouter };
}

export default {
  createLoyaltyRoutes,
};
