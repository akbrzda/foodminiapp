import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { adminActionLogger } from "../../utils/logger.js";

// Контроллеры
import { calculateOrder } from "./controllers/calculateController.js";
import { createOrder } from "./controllers/createOrderController.js";
import { getUserOrders, getUserOrderById, repeatOrder } from "./controllers/userOrdersController.js";
import {
  getAdminOrders,
  getShiftOrders,
  getOrdersCount,
  getAdminOrderById,
  updateOrderStatus,
  getOrdersStats,
} from "./controllers/adminOrdersController.js";

const router = express.Router();

// Пользовательские эндпоинты
router.post("/calculate", authenticateToken, calculateOrder);
router.post("/", authenticateToken, createOrder);
router.get("/", authenticateToken, getUserOrders);
router.get("/:id", authenticateToken, getUserOrderById);
router.post("/:id/repeat", authenticateToken, repeatOrder);

// Админские эндпоинты
router.get("/admin/all", authenticateToken, requireRole("admin", "manager", "ceo"), getAdminOrders);
router.get("/admin/shift", authenticateToken, requireRole("admin", "manager", "ceo"), getShiftOrders);
router.get("/admin/count", authenticateToken, requireRole("admin", "manager", "ceo"), getOrdersCount);
router.get("/admin/:id", authenticateToken, requireRole("admin", "manager", "ceo"), getAdminOrderById);

router.put(
  "/admin/:id/status",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  adminActionLogger("update_order_status", "order"),
  async (req, res, next) => {
    await updateOrderStatus(req, res, next);
  },
);

router.put(
  "/admin/:id/cancel",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  adminActionLogger("cancel_order", "order"),
  async (req, res, next) => {
    await updateOrderStatus(req, res, next, "cancelled");
  },
);

router.get("/admin/stats", authenticateToken, requireRole("admin", "manager", "ceo"), getOrdersStats);

export default router;
