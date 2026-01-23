import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { ensureUploadDir, getImageUrl } from "../config/uploads.js";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`), false);
  }
};
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});
export async function processAndSaveImage(buffer, category, entityId, options = {}) {
  const { width = 1200, height = null, quality = 85, format = "webp" } = options;
  const hash = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  const filename = `${timestamp}-${hash}.${format}`;
  const uploadPath = await ensureUploadDir(category, entityId);
  const filePath = path.join(uploadPath, filename);
  let processor = sharp(buffer);
  if (width || height) {
    processor = processor.resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  await processor.toFormat(format, { quality }).toFile(filePath);
  const url = getImageUrl(category, entityId, filename);
  return { filename, url };
}
export async function processThumbnail(buffer, category, entityId) {
  return processAndSaveImage(buffer, category, entityId, {
    width: 300,
    height: 300,
    quality: 80,
    format: "webp",
  });
}
