import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

export function createLoyaltyRoutes({ clientController, adminController }) {
  const clientRouter = express.Router();
  const adminRouter = express.Router();

  clientRouter.get("/balance", authenticateToken, clientController.getBalance);
  clientRouter.get("/calculate-max-spend", authenticateToken, clientController.calculateMaxSpend);
  clientRouter.get("/history", authenticateToken, clientController.getHistory);
  clientRouter.get("/levels", authenticateToken, clientController.getLevels);

  adminRouter.get("/status", authenticateToken, requireRole("admin", "ceo"), adminController.getStatus);
  adminRouter.put("/toggle", authenticateToken, requireRole("admin", "ceo"), adminController.toggle);
  adminRouter.post("/adjust", authenticateToken, requireRole("admin", "ceo"), adminController.adjust);
  adminRouter.get("/users/:id/loyalty", authenticateToken, requireRole("admin", "manager", "ceo"), adminController.getUserLoyalty);

  return { clientRouter, adminRouter };
}

export default {
  createLoyaltyRoutes,
};
