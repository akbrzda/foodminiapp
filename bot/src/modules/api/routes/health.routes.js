import { Router } from "express";

export const createHealthRoutes = () => {
  const router = Router();

  router.get("/health", (req, res) => {
    res.json({
      success: true,
      service: "foodminiapp-bot-service",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
};

export default {
  createHealthRoutes,
};
