import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

// Импорт контроллеров
import * as publicMenuController from "./controllers/publicMenuController.js";
import * as categoriesController from "./controllers/categoriesController.js";
import * as itemsController from "./controllers/itemsController.js";
import * as modifiersController from "./controllers/modifiersController.js";
import * as variantsAndPricesController from "./controllers/variantsAndPricesController.js";
import * as tagsAndStopListController from "./controllers/tagsAndStopListController.js";

const router = express.Router();

// ==================== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ====================

// Получение полного меню
router.get("/", publicMenuController.getMenu);

// Получение категорий
router.get("/categories", publicMenuController.getCategories);
router.get("/categories/:id", publicMenuController.getCategoryById);
router.get("/categories/:categoryId/items", publicMenuController.getCategoryItems);

// Получение товаров
router.get("/items/:id", publicMenuController.getItemById);
router.get("/items/:itemId/modifiers", publicMenuController.getItemModifiers);
router.get("/items/:itemId/variants", publicMenuController.getItemVariants);

// Получение групп модификаторов
router.get("/modifier-groups", publicMenuController.getModifierGroups);
router.get("/modifier-groups/:id", publicMenuController.getModifierGroupById);
router.get("/modifier-groups/:groupId/modifiers", publicMenuController.getGroupModifiers);

// ==================== АДМИН: КАТЕГОРИИ ====================

router.get("/admin/all-categories", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.getAllCategories);
router.get("/admin/categories", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.getAdminCategories);
router.post("/admin/categories", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.createCategory);
router.put("/admin/categories/:id", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.updateCategory);
router.delete("/admin/categories/:id", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.deleteCategory);
router.get("/admin/categories/:categoryId/items", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.getCategoryAdminItems);

// Управление городами категорий
router.post("/admin/categories/:categoryId/cities", authenticateToken, requireRole("admin", "ceo"), categoriesController.addCategoryCity);
router.put("/admin/categories/:categoryId/cities/:cityId", authenticateToken, requireRole("admin", "ceo"), categoriesController.updateCategoryCity);
router.get("/admin/categories/:categoryId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), categoriesController.getCategoryCities);

// ==================== АДМИН: ТОВАРЫ ====================

router.post("/admin/items", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.createItem);
router.get("/admin/items", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.getAdminItems);
router.get("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.getAdminItemById);
router.put("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.updateItem);
router.delete("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.deleteItem);

// Управление модификаторами товаров
router.get("/admin/items/:itemId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.getItemModifierGroups);
router.put("/admin/items/:itemId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.updateItemModifierGroups);

// Управление вариантами товаров
router.get("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.getAdminItemVariants);
router.post("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.createItemVariant);
router.put("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.updateItemVariants);

// Управление городами товаров
router.post("/admin/items/:itemId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.addItemCity);
router.put("/admin/items/:itemId/cities/:cityId", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.updateItemCity);
router.get("/admin/items/:itemId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.getItemCities);
router.put("/admin/items/:itemId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), itemsController.updateItemCities);

// ==================== АДМИН: МОДИФИКАТОРЫ ====================

// Управление группами модификаторов
router.get("/admin/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.getAdminModifierGroups);
router.post("/admin/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.createModifierGroup);
router.put("/admin/modifier-groups/:id", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.updateModifierGroup);
router.delete("/admin/modifier-groups/:id", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.deleteModifierGroup);

// Привязка групп модификаторов к товарам
router.post("/admin/items/:itemId/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.addModifierGroupToItem);
router.get("/admin/items/:itemId/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.getItemAdminModifierGroups);
router.delete(
  "/admin/items/:itemId/modifier-groups/:groupId",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  modifiersController.removeModifierGroupFromItem,
);

// Управление модификаторами
router.post("/admin/modifier-groups/:groupId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.createModifier);
router.put("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.updateModifier);
router.delete("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.deleteModifier);
router.get("/admin/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.getAdminModifiers);

// Управление ценами модификаторов
router.get("/admin/modifiers/:modifierId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.getModifierPrices);
router.post("/admin/modifiers/:modifierId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.createModifierPrice);
router.put("/admin/modifiers/:modifierId/cities", authenticateToken, requireRole("admin", "manager", "ceo"), modifiersController.updateModifierCities);

// ==================== АДМИН: ВАРИАНТЫ И ЦЕНЫ ====================

// Управление вариантами
router.put("/admin/variants/:id", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.updateVariant);
router.delete("/admin/variants/:id", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.deleteVariant);
router.get("/admin/variants", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.getAdminVariants);

// Управление ценами товаров
router.get("/admin/items/:itemId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.getItemPrices);
router.post("/admin/items/:itemId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.createItemPrice);
router.delete("/admin/items/:itemId/prices/:priceId", authenticateToken, requireRole("admin", "ceo"), variantsAndPricesController.deleteItemPrice);

// Управление ценами вариантов
router.get("/admin/variants/:variantId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.getVariantPrices);
router.post("/admin/variants/:variantId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.createVariantPrice);
router.put("/admin/variants/:variantId/prices", authenticateToken, requireRole("admin", "manager", "ceo"), variantsAndPricesController.updateVariantPrices);

// ==================== АДМИН: ТЕГИ И СТОП-ЛИСТ ====================

// Управление тегами
router.get("/admin/tags", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.getTags);
router.post("/admin/tags", authenticateToken, requireRole("admin", "ceo"), tagsAndStopListController.createTag);
router.put("/admin/tags/:id", authenticateToken, requireRole("admin", "ceo"), tagsAndStopListController.updateTag);
router.delete("/admin/tags/:id", authenticateToken, requireRole("admin", "ceo"), tagsAndStopListController.deleteTag);

// Привязка тегов к товарам
router.post("/admin/items/:itemId/tags", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.addTagToItem);
router.delete("/admin/items/:itemId/tags/:tagId", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.removeTagFromItem);
router.get("/admin/items/:itemId/tags", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.getItemTags);
router.put("/admin/items/:itemId/tags", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.updateItemTags);

// Привязка товаров к категориям
router.post("/admin/items/:itemId/categories", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.addItemToCategory);
router.delete(
  "/admin/items/:itemId/categories/:categoryId",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  tagsAndStopListController.removeItemFromCategory,
);
router.get("/admin/items/:itemId/categories", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.getItemCategories);
router.put("/admin/items/:itemId/categories", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.updateItemCategories);

// Управление стоп-листом
router.get("/admin/stop-list", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.getStopList);
router.get("/admin/stop-list-reasons", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.getStopListReasons);
router.post("/admin/stop-list-reasons", authenticateToken, requireRole("admin", "ceo"), tagsAndStopListController.createStopListReason);
router.put("/admin/stop-list-reasons/:id", authenticateToken, requireRole("admin", "ceo"), tagsAndStopListController.updateStopListReason);
router.delete("/admin/stop-list-reasons/:id", authenticateToken, requireRole("admin", "ceo"), tagsAndStopListController.deleteStopListReason);
router.post("/admin/stop-list", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.addToStopList);
router.delete("/admin/stop-list/:id", authenticateToken, requireRole("admin", "manager", "ceo"), tagsAndStopListController.removeFromStopList);

// Управление отключенными модификаторами для товаров
router.post(
  "/admin/items/:itemId/disabled-modifiers",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  tagsAndStopListController.disableModifierForItem,
);
router.delete(
  "/admin/items/:itemId/disabled-modifiers/:modifierId",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  tagsAndStopListController.enableModifierForItem,
);
router.get(
  "/admin/items/:itemId/disabled-modifiers",
  authenticateToken,
  requireRole("admin", "manager", "ceo"),
  tagsAndStopListController.getItemDisabledModifiers,
);

export default router;
