import express from "express";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { createLimiter, orderLimiter, redisRateLimiter } from "../../middleware/rateLimiter.js";
import { adminActionLogger } from "../../utils/logger.js";

// Контроллеры
import { calculateOrder } from "./controllers/calculateController.js";
import { createOrder } from "./controllers/createOrderController.js";
import { getUserOrders, getUserOrderById, repeatOrder, getUserOrderRating, createUserOrderRating } from "./controllers/userOrdersController.js";
import {
  getAdminOrders,
  getShiftOrders,
  getOrdersCount,
  getAdminOrderById,
  updateOrderStatus,
  getOrderRatings,
  getOrdersStats,
  deleteAdminOrder,
} from "./controllers/adminOrdersController.js";

const router = express.Router();
const adminOrderMutationLimiter = redisRateLimiter({
  prefix: "admin_order_mutation",
  windowMs: 60 * 1000,
  max: 60,
  message: "Слишком много действий с заказами. Попробуйте через минуту",
  failOpen: false,
  fallbackStatus: 503,
  fallbackMessage: "Сервис управления заказами временно недоступен",
});

// Пользовательские эндпоинты
router.post("/calculate", authenticateToken, createLimiter, calculateOrder);
router.post("/", authenticateToken, orderLimiter, createLimiter, createOrder);
router.get("/", authenticateToken, getUserOrders);
router.get("/:id/rating", authenticateToken, getUserOrderRating);
router.post("/:id/rating", authenticateToken, createLimiter, createUserOrderRating);
router.get("/:id", authenticateToken, getUserOrderById);
router.post("/:id/repeat", authenticateToken, orderLimiter, createLimiter, repeatOrder);

// Админские эндпоинты
router.get("/admin/all", authenticateToken, requirePermission("orders.view"), getAdminOrders);
router.get("/admin/shift", authenticateToken, requirePermission("orders.view"), getShiftOrders);
router.get("/admin/count", authenticateToken, requirePermission("orders.view"), getOrdersCount);
router.get("/admin/ratings", authenticateToken, requirePermission("orders.view"), getOrderRatings);
router.get("/admin/:id", authenticateToken, requirePermission("orders.view"), getAdminOrderById);

router.put(
  "/admin/:id/status",
  authenticateToken,
  requirePermission("orders.manage"),
  adminOrderMutationLimiter,
  adminActionLogger("update_order_status", "order"),
  async (req, res, next) => {
    await updateOrderStatus(req, res, next);
  },
);

router.put(
  "/admin/:id/cancel",
  authenticateToken,
  requirePermission("orders.manage"),
  adminOrderMutationLimiter,
  adminActionLogger("cancel_order", "order"),
  async (req, res, next) => {
    await updateOrderStatus(req, res, next, "cancelled");
  },
);

router.delete(
  "/admin/:id",
  authenticateToken,
  requirePermission("orders.delete"),
  adminOrderMutationLimiter,
  adminActionLogger("delete_order", "order"),
  deleteAdminOrder,
);

router.get("/admin/stats", authenticateToken, requirePermission("orders.view"), getOrdersStats);

export default router;
