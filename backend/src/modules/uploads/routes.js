import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { upload, processAndSaveImage } from "../../middleware/upload.js";
import { createLimiter, redisRateLimiter } from "../../middleware/rateLimiter.js";
import { IMAGE_CATEGORIES, deleteImage, deleteEntityImages } from "../../config/uploads.js";

const router = express.Router();
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

router.post("/menu-items/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    const entityId = id === "temp" ? `temp-${Date.now()}` : parseInt(id);
    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.MENU_ITEMS, entityId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload image" });
  }
});

router.post("/menu-categories/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    const entityId = id === "temp" ? `temp-${Date.now()}` : parseInt(id);
    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.MENU_CATEGORIES, entityId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/* Accepts 'temp' as ID for temporary uploads
 */
router.post("/modifiers/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    const entityId = id === "temp" ? `temp-${Date.now()}` : parseInt(id);
    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.MODIFIERS, entityId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload image" });
  }
});

router.post("/modifier-groups/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.MODIFIER_GROUPS, parseInt(id));
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload image" });
  }
});

router.post("/tags/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.TAGS, parseInt(id));
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload image" });
  }
});

router.post("/broadcasts/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "Файл изображения не получен" });
    }
    const entityId = id === "temp" ? `temp-${Date.now()}` : parseInt(id);
    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.BROADCASTS, entityId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: "Не удалось загрузить изображение" });
  }
});

router.delete("/:category/:id/:filename", async (req, res) => {
  try {
    const { category, id, filename } = req.params;
    if (!Object.values(IMAGE_CATEGORIES).includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }
    const success = await deleteImage(category, parseInt(id), filename);
    if (success) {
      res.json({ success: true, message: "Image deleted" });
    } else {
      res.status(404).json({ error: "Image not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to delete image" });
  }
});

router.delete("/:category/:id", async (req, res) => {
  try {
    const { category, id } = req.params;
    if (!Object.values(IMAGE_CATEGORIES).includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }
    const success = await deleteEntityImages(category, parseInt(id));
    if (success) {
      res.json({ success: true, message: "All images deleted" });
    } else {
      res.status(404).json({ error: "Images not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to delete images" });
  }
});

export default router;
