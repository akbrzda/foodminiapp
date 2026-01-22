import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CDN configuration
export const CDN_BASE_URL = process.env.CDN_BASE_URL || "https://cdn.akbrzda.ru";
export const CDN_IMAGES_PATH = process.env.CDN_IMAGES_PATH || "/var/www/cdn.akbrzda.ru/images";

// Image categories
export const IMAGE_CATEGORIES = {
  MENU_ITEMS: "menu-items",
  MENU_CATEGORIES: "menu-categories",
  MODIFIERS: "modifiers",
  MODIFIER_GROUPS: "modifier-groups",
  TAGS: "tags",
};

/**
 * Get upload path for a specific entity
 * @param {string} category - Image category (from IMAGE_CATEGORIES)
 * @param {number} entityId - Entity ID
 * @returns {string} Full path to upload directory
 */
export function getUploadPath(category, entityId) {
  return path.join(CDN_IMAGES_PATH, category, String(entityId));
}

/**
 * Get public URL for an image
 * @param {string} category - Image category
 * @param {number} entityId - Entity ID
 * @param {string} filename - Image filename
 * @returns {string} Public URL
 */
export function getImageUrl(category, entityId, filename) {
  return `${CDN_BASE_URL}/images/${category}/${entityId}/${filename}`;
}

/**
 * Ensure upload directory exists
 * @param {string} category - Image category
 * @param {number} entityId - Entity ID
 */
export async function ensureUploadDir(category, entityId) {
  const uploadPath = getUploadPath(category, entityId);
  await fs.mkdir(uploadPath, { recursive: true });
  return uploadPath;
}

/**
 * Delete image file
 * @param {string} category - Image category
 * @param {number} entityId - Entity ID
 * @param {string} filename - Image filename
 */
export async function deleteImage(category, entityId, filename) {
  const filePath = path.join(getUploadPath(category, entityId), filename);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`Failed to delete image: ${filePath}`, error);
    return false;
  }
}

/**
 * Delete all images for an entity
 * @param {string} category - Image category
 * @param {number} entityId - Entity ID
 */
export async function deleteEntityImages(category, entityId) {
  const dirPath = getUploadPath(category, entityId);
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Failed to delete entity images: ${dirPath}`, error);
    return false;
  }
}
