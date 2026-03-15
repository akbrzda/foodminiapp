import express from "express";
import { authenticateToken } from "../../middleware/auth.js";
import {
  authLimiter,
  createLimiter,
  refreshLimiter,
  telegramAuthLimiter,
} from "../../middleware/rateLimiter.js";
import { authController } from "./auth.controller.js";

const router = express.Router();

router.post("/telegram", telegramAuthLimiter, authController.telegram);
router.post("/eruda", authController.eruda);
router.post("/admin/login", authLimiter, authController.adminLogin);
router.post("/ws-ticket", authenticateToken, createLimiter, authController.wsTicket);
router.post("/refresh", refreshLimiter, authController.refresh);
router.get("/csrf", authController.csrf);
router.get("/session", authenticateToken, authController.session);
router.post("/logout", authController.logout);

export default router;
