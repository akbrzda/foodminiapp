import { Worker } from "bullmq";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";
import { CDN_IMAGES_PATH } from "../config/uploads.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = CDN_IMAGES_PATH;
const OPTIMIZED_DIR = path.join(UPLOAD_DIR, "optimized");
const THUMBNAILS_DIR = path.join(UPLOAD_DIR, "thumbnails");
const MAX_FILE_SIZE = 500 * 1024;
async function ensureDirectories() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(OPTIMIZED_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directories:", error);
  }
}
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}
async function optimizeImage(inputPath, outputPath, options = {}) {
  const { maxWidth = 1200, maxHeight = 1200, quality = 80, format = "webp" } = options;
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    let resizeOptions = null;
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      resizeOptions = {
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      };
    }
    let pipeline = image;
    if (resizeOptions) {
      pipeline = pipeline.resize(resizeOptions);
    }
    if (format === "webp") {
      pipeline = pipeline.webp({ quality });
    } else if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality, progressive: true });
    } else if (format === "png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    }
    await pipeline.toFile(outputPath);
    const outputSize = await getFileSize(outputPath);
    return {
      success: true,
      originalSize: metadata.size,
      optimizedSize: outputSize,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      outputFormat: format,
    };
  } catch (error) {
    throw new Error(`Image optimization failed: ${error.message}`);
  }
}
async function createThumbnail(inputPath, outputPath, options = {}) {
  const { width = 200, height = 200, quality = 80, format = "webp" } = options;
  try {
    let pipeline = sharp(inputPath).resize(width, height, {
      fit: "cover",
      position: "center",
    });
    if (format === "webp") {
      pipeline = pipeline.webp({ quality });
    } else if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality });
    }
    await pipeline.toFile(outputPath);
    const outputSize = await getFileSize(outputPath);
    return {
      success: true,
      thumbnailSize: outputSize,
      width,
      height,
    };
  } catch (error) {
    throw new Error(`Thumbnail creation failed: ${error.message}`);
  }
}
async function processImageOptimization(job) {
  const { inputPath, filename, options = {} } = job.data;
  logger.system.startup(`Processing image optimization: ${filename} (Job ID: ${job.id})`);
  await ensureDirectories();
  const fileBasename = path.basename(filename, path.extname(filename));
  const outputFormat = options.format || "webp";
  const optimizedFilename = `${fileBasename}_optimized.${outputFormat}`;
  const thumbnailFilename = `${fileBasename}_thumb.${outputFormat}`;
  const optimizedPath = path.join(OPTIMIZED_DIR, optimizedFilename);
  const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);
  try {
    try {
      await fs.access(inputPath);
    } catch (error) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    const optimizationResult = await optimizeImage(inputPath, optimizedPath, {
      maxWidth: options.maxWidth || 1200,
      maxHeight: options.maxHeight || 1200,
      quality: options.quality || 80,
      format: outputFormat,
    });
    const thumbnailResult = await createThumbnail(inputPath, thumbnailPath, {
      width: options.thumbnailWidth || 200,
      height: options.thumbnailHeight || 200,
      quality: options.thumbnailQuality || 80,
      format: outputFormat,
    });
    if (optimizationResult.optimizedSize > MAX_FILE_SIZE) {
      logger.system.startup(`File too large (${optimizationResult.optimizedSize}), re-optimizing with lower quality`);
      await optimizeImage(inputPath, optimizedPath, {
        maxWidth: options.maxWidth || 1200,
        maxHeight: options.maxHeight || 1200,
        quality: 60,
        format: outputFormat,
      });
      const finalSize = await getFileSize(optimizedPath);
      if (finalSize > MAX_FILE_SIZE) {
        throw new Error(`Unable to optimize image to target size (${finalSize} > ${MAX_FILE_SIZE})`);
      }
      optimizationResult.optimizedSize = finalSize;
    }
    const result = {
      success: true,
      originalPath: inputPath,
      optimizedPath,
      thumbnailPath,
      optimization: optimizationResult,
      thumbnail: thumbnailResult,
    };
    logger.system.startup(`✅ Image optimization completed: ${filename} (Job ID: ${job.id})`);
    return result;
  } catch (error) {
    logger.system.redisError(`Image optimization failed: ${error.message}`);
    throw error;
  }
}
export function createImageWorker(connection) {
  const worker = new Worker("image-processing", processImageOptimization, {
    connection,
    concurrency: 3,
  });
  worker.on("completed", (job, result) => {
    console.log(`   Original: ${(result.optimization.originalSize / 1024).toFixed(2)} KB`);
    console.log(`   Optimized: ${(result.optimization.optimizedSize / 1024).toFixed(2)} KB`);
  });
  worker.on("failed", (job, err) => {
    console.error(`❌ Image processing failed: Job ${job?.id}`, err.message);
    logger.system.redisError(`Image worker failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error("❌ Image worker error:", err);
  });
  return worker;
}
export default {
  createImageWorker,
  optimizeImage,
  createThumbnail,
};
