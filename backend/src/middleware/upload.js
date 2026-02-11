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
const createUploadValidationError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const fileFilter = (req, file, cb) => {
  // Проверка MIME типа
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(createUploadValidationError(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`), false);
  }

  // Проверка расширения файла
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(createUploadValidationError(`Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`), false);
  }

  // Проверка имени файла на технически опасные значения.
  // Символы языка (в т.ч. кириллица) не ограничиваем, т.к. финальное имя файла генерируется на сервере.
  const filename = path.basename(String(file.originalname || "").normalize("NFC")).trim();
  if (!filename) {
    return cb(createUploadValidationError("Filename is empty"), false);
  }
  if (filename.includes("\0") || /[\\/]/.test(filename)) {
    return cb(createUploadValidationError("Filename contains invalid path characters"), false);
  }
  if (filename.length > 255) {
    return cb(createUploadValidationError("Filename is too long"), false);
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
      throw createUploadValidationError("Invalid image format");
    }

    // Проверяем разумные размеры (защита от бомб)
    if (metadata.width > 10000 || metadata.height > 10000) {
      throw createUploadValidationError("Image dimensions are too large");
    }

    return true;
  } catch (error) {
    if (error?.status === 400) {
      throw error;
    }
    throw createUploadValidationError(`Image validation failed: ${error.message}`);
  }
}

export async function processAndSaveImage(buffer, category, entityId, options = {}) {
  // Валидируем содержимое изображения
  await validateImageContent(buffer);

  const { width = 1200, height = null, quality = 85 } = options;

  const hash = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  const safeEntityId = String(entityId)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "entity";
  const filename = `${safeEntityId}-${timestamp}-${hash}.webp`;

  const uploadPath = await ensureUploadDir(category, entityId);
  const filePath = path.join(uploadPath, filename);

  let processor = sharp(buffer);

  if (width || height) {
    processor = processor.resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // По умолчанию sharp не сохраняет метаданные (EXIF/ICC), поэтому
  // дополнительный вызов withMetadata здесь не нужен.

  await processor.webp({ quality }).toFile(filePath);

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
