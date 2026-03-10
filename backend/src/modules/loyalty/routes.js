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
  adminRouter.get("/levels", authenticateToken, requirePermission("system.loyalty_levels.manage"), adminController.getLevels);
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
