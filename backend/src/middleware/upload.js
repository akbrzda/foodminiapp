import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { ensureUploadDir, getImageUrl } from "../config/uploads.js";

// Белый список допустимых MIME типов
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Белый список расширений файлов
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// Максимальный размер файла (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Проверка MIME типа
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`), false);
  }

  // Проверка расширения файла
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`), false);
  }

  // Проверка имени файла на опасные символы
  const filename = path.basename(file.originalname);
  const safeFilenamePattern = /^[a-zA-Z0-9_\-. ]+$/;
  if (!safeFilenamePattern.test(filename)) {
    return cb(new Error("Filename contains invalid characters"), false);
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Только один файл за раз
  },
});

/**
 * Дополнительная валидация изображения через sharp
 * Проверяет, что файл действительно является изображением
 */
async function validateImageContent(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();

    // Проверяем, что формат соответствует разрешенным
    const allowedFormats = ["jpeg", "png", "webp", "gif"];
    if (!allowedFormats.includes(metadata.format)) {
      throw new Error("Invalid image format");
    }

    // Проверяем разумные размеры (защита от бомб)
    if (metadata.width > 10000 || metadata.height > 10000) {
      throw new Error("Image dimensions are too large");
    }

    return true;
  } catch (error) {
    throw new Error(`Image validation failed: ${error.message}`);
  }
}

export async function processAndSaveImage(buffer, category, entityId, options = {}) {
  // Валидируем содержимое изображения
  await validateImageContent(buffer);

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

  // Удаляем метаданные для безопасности и уменьшения размера
  processor = processor.withMetadata({
    exif: {},
    icc: {},
  });

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
