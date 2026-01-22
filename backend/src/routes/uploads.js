import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { upload, processAndSaveImage } from "../middleware/upload.js";
import { IMAGE_CATEGORIES, deleteImage, deleteEntityImages } from "../config/uploads.js";

const router = express.Router();

/**
 * Upload image for menu item
 * POST /api/uploads/menu-items/:id
 * Accepts 'temp' as ID for temporary uploads
 */
router.post("/menu-items/:id", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    // Allow 'temp' as temporary ID, use timestamp
    const entityId = id === "temp" ? `temp-${Date.now()}` : parseInt(id);

    const result = await processAndSaveImage(req.file.buffer, IMAGE_CATEGORIES.MENU_ITEMS, entityId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/**
 * Upload image for menu category
 * POST /api/uploads/menu-categories/:id
 * Accepts 'temp' as ID for temporary uploads
 */
router.post("/menu-categories/:id", authenticateToken, upload.single("image"), async (req, res) => {
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
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/* Accepts 'temp' as ID for temporary uploads
 */
router.post("/modifiers/:id", authenticateToken, upload.single("image"), async (req, res) => {
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
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/**
 * Upload image for modifier group
 * POST /api/uploads/modifier-groups/:id
 */
router.post("/modifier-groups/:id", authenticateToken, upload.single("image"), async (req, res) => {
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
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/**
 * Upload image for tag
 * POST /api/uploads/tags/:id
 */
router.post("/tags/:id", authenticateToken, upload.single("image"), async (req, res) => {
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
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/**
 * Delete specific image
 * DELETE /api/uploads/:category/:id/:filename
 */
router.delete("/:category/:id/:filename", authenticateToken, async (req, res) => {
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
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

/**
 * Delete all images for entity
 * DELETE /api/uploads/:category/:id
 */
router.delete("/:category/:id", authenticateToken, async (req, res) => {
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
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete images" });
  }
});

export default router;
