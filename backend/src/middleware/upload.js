import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { ensureUploadDir, getImageUrl } from "../config/uploads.js";

// Allowed image types
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Configure multer storage
 */
const storage = multer.memoryStorage();

/**
 * File filter
 */
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`), false);
  }
};

/**
 * Multer upload middleware
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Process and save image
 * @param {Buffer} buffer - Image buffer
 * @param {string} category - Image category
 * @param {number} entityId - Entity ID
 * @param {object} options - Processing options
 * @returns {Promise<{filename: string, url: string}>}
 */
export async function processAndSaveImage(buffer, category, entityId, options = {}) {
  const { width = 1200, height = null, quality = 85, format = "webp" } = options;

  // Generate unique filename
  const hash = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  const filename = `${timestamp}-${hash}.${format}`;

  // Ensure upload directory exists
  const uploadPath = await ensureUploadDir(category, entityId);
  const filePath = path.join(uploadPath, filename);

  // Process image with sharp
  let processor = sharp(buffer);

  // Resize if dimensions specified
  if (width || height) {
    processor = processor.resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Convert and save
  await processor.toFormat(format, { quality }).toFile(filePath);

  // Get public URL
  const url = getImageUrl(category, entityId, filename);

  return { filename, url };
}

/**
 * Process and save thumbnail
 * @param {Buffer} buffer - Image buffer
 * @param {string} category - Image category
 * @param {number} entityId - Entity ID
 * @returns {Promise<{filename: string, url: string}>}
 */
export async function processThumbnail(buffer, category, entityId) {
  return processAndSaveImage(buffer, category, entityId, {
    width: 300,
    height: 300,
    quality: 80,
    format: "webp",
  });
}
