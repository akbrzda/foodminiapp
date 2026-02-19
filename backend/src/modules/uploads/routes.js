import express from "express";
import multer from "multer";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { upload, processAndSaveImage } from "../../middleware/upload.js";
import { createLimiter, redisRateLimiter } from "../../middleware/rateLimiter.js";
import { IMAGE_CATEGORIES, deleteImage, deleteEntityImages } from "../../config/uploads.js";

const router = express.Router();

const createBadRequestError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const parseEntityId = (rawId, allowTemp = true) => {
  if (allowTemp && (rawId === "temp" || rawId === "new")) {
    return `temp-${Date.now()}`;
  }
  const parsedId = Number.parseInt(rawId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw createBadRequestError("Некорректный идентификатор сущности");
  }
  return parsedId;
};

const uploadImage = (category, { allowTemp = true } = {}) => async (req, res, next) => {
  try {
    if (!req.file) {
      throw createBadRequestError("Файл изображения не получен");
    }
    const entityId = parseEntityId(req.params.id, allowTemp);
    const result = await processAndSaveImage(req.file.buffer, category, entityId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

router.use(authenticateToken, requireRole("admin", "manager", "ceo"));
router.use(createLimiter);
router.use(
  redisRateLimiter({
    prefix: "uploads_mutation",
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: "Превышен лимит операций с файлами. Попробуйте позже",
    failOpen: false,
    fallbackStatus: 503,
    fallbackMessage: "Сервис загрузки временно недоступен",
  }),
);

router.post("/menu-products/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.MENU_ITEMS));
router.post("/menu-categories/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.MENU_CATEGORIES));
router.post("/modifiers/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.MODIFIERS));
router.post("/modifier-groups/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.MODIFIER_GROUPS, { allowTemp: false }));
router.post("/tags/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.TAGS, { allowTemp: false }));
router.post("/broadcasts/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.BROADCASTS));
router.post("/telegram-start/:id", upload.single("image"), uploadImage(IMAGE_CATEGORIES.TELEGRAM_START, { allowTemp: false }));

router.delete("/:category/:id/:filename", async (req, res, next) => {
  try {
    const { category, filename } = req.params;
    if (!Object.values(IMAGE_CATEGORIES).includes(category)) {
      throw createBadRequestError("Некорректная категория");
    }
    const entityId = parseEntityId(req.params.id, false);
    const success = await deleteImage(category, entityId, filename);
    if (success) {
      return res.json({ success: true, message: "Image deleted" });
    }
    return res.status(404).json({ error: "Image not found" });
  } catch (error) {
    next(error);
  }
});

router.delete("/:category/:id", async (req, res, next) => {
  try {
    const { category } = req.params;
    if (!Object.values(IMAGE_CATEGORIES).includes(category)) {
      throw createBadRequestError("Некорректная категория");
    }
    const entityId = parseEntityId(req.params.id, false);
    const success = await deleteEntityImages(category, entityId);
    if (success) {
      return res.json({ success: true, message: "All images deleted" });
    }
    return res.status(404).json({ error: "Images not found" });
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Файл слишком большой. Максимум 10MB" });
    }
    return res.status(400).json({ error: error.message || "Ошибка загрузки файла" });
  }
  return next(error);
});

export default router;
