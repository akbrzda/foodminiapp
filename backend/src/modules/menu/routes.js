import express from "express";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";

// Импорт контроллеров
import * as publicMenuController from "./controllers/publicMenuController.js";
import * as categoriesController from "./controllers/categoriesController.js";
import * as itemsController from "./controllers/itemsController.js";
import * as modifiersController from "./controllers/modifiersController.js";
import * as variantsAndPricesController from "./controllers/variantsAndPricesController.js";
import * as tagsAndStopListController from "./controllers/tagsAndStopListController.js";
import { checkIikoIntegration } from "../integrations/middleware/checkIikoIntegration.js";

const router = express.Router();
const canManageMenuCategories = requirePermission("menu.categories.manage");
const canManageMenuProducts = requirePermission("menu.products.manage");
const canManageMenuModifiers = requirePermission("menu.modifiers.manage");
const canManageMenuTags = requirePermission("menu.tags.manage");
const canManageMenuStopList = requirePermission("menu.stop_list.manage");

router.use("/admin", authenticateToken, checkIikoIntegration);

// ==================== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ====================

// Получение полного меню
router.get("/", publicMenuController.getMenu);
router.post("/upsell", authenticateToken, publicMenuController.getCartUpsell);

// Получение категорий
router.get("/categories", publicMenuController.getCategories);
router.get("/categories/:id", publicMenuController.getCategoryById);
router.get("/categories/:categoryId/products", publicMenuController.getCategoryItems);

// Получение товаров/блюд
router.get("/products/:id", publicMenuController.getItemById);
router.get("/products/:itemId/modifiers", publicMenuController.getItemModifiers);
router.get("/products/:itemId/variants", publicMenuController.getItemVariants);

// Получение групп модификаторов
router.get("/modifier-groups", publicMenuController.getModifierGroups);
router.get("/modifier-groups/:id", publicMenuController.getModifierGroupById);
router.get("/modifier-groups/:groupId/modifiers", publicMenuController.getGroupModifiers);

// ==================== АДМИН: КАТЕГОРИИ ====================

router.get("/admin/all-categories", authenticateToken, canManageMenuCategories, categoriesController.getAllCategories);
router.get("/admin/categories", authenticateToken, canManageMenuCategories, categoriesController.getAdminCategories);
router.post("/admin/categories", authenticateToken, canManageMenuCategories, categoriesController.createCategory);
router.put("/admin/categories/:id", authenticateToken, canManageMenuCategories, categoriesController.updateCategory);
router.delete("/admin/categories/:id", authenticateToken, canManageMenuCategories, categoriesController.deleteCategory);
router.get("/admin/categories/:categoryId/products", authenticateToken, canManageMenuCategories, categoriesController.getCategoryAdminItems);

// Управление городами категорий
router.post("/admin/categories/:categoryId/cities", authenticateToken, canManageMenuCategories, categoriesController.addCategoryCity);
router.put("/admin/categories/:categoryId/cities/:cityId", authenticateToken, canManageMenuCategories, categoriesController.updateCategoryCity);
router.get("/admin/categories/:categoryId/cities", authenticateToken, canManageMenuCategories, categoriesController.getCategoryCities);

// ==================== АДМИН: ТОВАРЫ/БЛЮДА ====================

router.post("/admin/products", authenticateToken, canManageMenuProducts, itemsController.createItem);
router.get("/admin/products", authenticateToken, canManageMenuProducts, itemsController.getAdminItems);
router.get("/admin/products/:id", authenticateToken, canManageMenuProducts, itemsController.getAdminItemById);
router.put("/admin/products/:id", authenticateToken, canManageMenuProducts, itemsController.updateItem);
router.delete("/admin/products/:id", authenticateToken, canManageMenuProducts, itemsController.deleteItem);

// Управление модификаторами товаров
router.get(
  "/admin/products/:itemId/modifiers",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  itemsController.getItemModifierGroups,
);
router.put(
  "/admin/products/:itemId/modifiers",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  itemsController.updateItemModifierGroups,
);

// Управление вариантами товаров
router.get(
  "/admin/products/:itemId/variants",
  authenticateToken,
  canManageMenuProducts,
  itemsController.getAdminItemVariants,
);
router.post(
  "/admin/products/:itemId/variants",
  authenticateToken,
  canManageMenuProducts,
  itemsController.createItemVariant,
);
router.put(
  "/admin/products/:itemId/variants",
  authenticateToken,
  canManageMenuProducts,
  itemsController.updateItemVariants,
);

// Управление городами товаров
router.post(
  "/admin/products/:itemId/cities",
  authenticateToken,
  canManageMenuProducts,
  itemsController.addItemCity,
);
router.put(
  "/admin/products/:itemId/cities/:cityId",
  authenticateToken,
  canManageMenuProducts,
  itemsController.updateItemCity,
);
router.get(
  "/admin/products/:itemId/cities",
  authenticateToken,
  canManageMenuProducts,
  itemsController.getItemCities,
);
router.put(
  "/admin/products/:itemId/cities",
  authenticateToken,
  canManageMenuProducts,
  itemsController.updateItemCities,
);

// ==================== АДМИН: МОДИФИКАТОРЫ ====================

// Управление группами модификаторов
router.get("/admin/modifier-groups", authenticateToken, canManageMenuModifiers, modifiersController.getAdminModifierGroups);
router.post("/admin/modifier-groups", authenticateToken, canManageMenuModifiers, modifiersController.createModifierGroup);
router.put("/admin/modifier-groups/:id", authenticateToken, canManageMenuModifiers, modifiersController.updateModifierGroup);
router.delete("/admin/modifier-groups/:id", authenticateToken, canManageMenuModifiers, modifiersController.deleteModifierGroup);

// Привязка групп модификаторов к товарам
router.post(
  "/admin/products/:itemId/modifier-groups",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  modifiersController.addModifierGroupToItem,
);
router.get(
  "/admin/products/:itemId/modifier-groups",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  modifiersController.getItemAdminModifierGroups,
);
router.delete(
  "/admin/products/:itemId/modifier-groups/:groupId",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  modifiersController.removeModifierGroupFromItem,
);

// Управление модификаторами
router.post("/admin/modifier-groups/:groupId/modifiers", authenticateToken, canManageMenuModifiers, modifiersController.createModifier);
router.put("/admin/modifiers/:id", authenticateToken, canManageMenuModifiers, modifiersController.updateModifier);
router.delete("/admin/modifiers/:id", authenticateToken, canManageMenuModifiers, modifiersController.deleteModifier);
router.get("/admin/modifiers", authenticateToken, canManageMenuModifiers, modifiersController.getAdminModifiers);

// Управление ценами модификаторов
router.get("/admin/modifiers/:modifierId/prices", authenticateToken, canManageMenuModifiers, modifiersController.getModifierPrices);
router.post("/admin/modifiers/:modifierId/prices", authenticateToken, canManageMenuModifiers, modifiersController.createModifierPrice);
router.put("/admin/modifiers/:modifierId/cities", authenticateToken, canManageMenuModifiers, modifiersController.updateModifierCities);
router.get(
  "/admin/modifiers/:modifierId/variant-prices",
  authenticateToken,
  canManageMenuModifiers,
  modifiersController.getModifierVariantPrices,
);
router.put(
  "/admin/modifiers/:modifierId/variant-prices",
  authenticateToken,
  canManageMenuModifiers,
  modifiersController.replaceModifierVariantPrices,
);

// ==================== АДМИН: ВАРИАНТЫ И ЦЕНЫ ====================

// Управление вариантами
router.put("/admin/variants/:id", authenticateToken, canManageMenuProducts, variantsAndPricesController.updateVariant);
router.delete("/admin/variants/:id", authenticateToken, canManageMenuProducts, variantsAndPricesController.deleteVariant);
router.get("/admin/variants", authenticateToken, canManageMenuProducts, variantsAndPricesController.getAdminVariants);

// Управление ценами товаров
router.get(
  "/admin/products/:itemId/prices",
  authenticateToken,
  canManageMenuProducts,
  variantsAndPricesController.getItemPrices,
);
router.post(
  "/admin/products/:itemId/prices",
  authenticateToken,
  canManageMenuProducts,
  variantsAndPricesController.createItemPrice,
);
router.delete(
  "/admin/products/:itemId/prices/:priceId",
  authenticateToken,
  canManageMenuProducts,
  variantsAndPricesController.deleteItemPrice,
);

// Управление ценами вариантов
router.get("/admin/variants/:variantId/prices", authenticateToken, canManageMenuProducts, variantsAndPricesController.getVariantPrices);
router.post("/admin/variants/:variantId/prices", authenticateToken, canManageMenuProducts, variantsAndPricesController.createVariantPrice);
router.put("/admin/variants/:variantId/prices", authenticateToken, canManageMenuProducts, variantsAndPricesController.updateVariantPrices);

// ==================== АДМИН: ТЕГИ И СТОП-ЛИСТ ====================

// Управление тегами
router.get("/admin/tags", authenticateToken, canManageMenuTags, tagsAndStopListController.getTags);
router.post("/admin/tags", authenticateToken, canManageMenuTags, tagsAndStopListController.createTag);
router.put("/admin/tags/:id", authenticateToken, canManageMenuTags, tagsAndStopListController.updateTag);
router.delete("/admin/tags/:id", authenticateToken, canManageMenuTags, tagsAndStopListController.deleteTag);

// Привязка тегов к товарам
router.post(
  "/admin/products/:itemId/tags",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.tags.manage"),
  tagsAndStopListController.addTagToItem,
);
router.delete(
  "/admin/products/:itemId/tags/:tagId",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.tags.manage"),
  tagsAndStopListController.removeTagFromItem,
);
router.get(
  "/admin/products/:itemId/tags",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.tags.manage"),
  tagsAndStopListController.getItemTags,
);
router.put(
  "/admin/products/:itemId/tags",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.tags.manage"),
  tagsAndStopListController.updateItemTags,
);

// Привязка товаров к категориям
router.post(
  "/admin/products/:itemId/categories",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.categories.manage"),
  tagsAndStopListController.addItemToCategory,
);
router.delete(
  "/admin/products/:itemId/categories/:categoryId",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.categories.manage"),
  tagsAndStopListController.removeItemFromCategory,
);
router.get(
  "/admin/products/:itemId/categories",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.categories.manage"),
  tagsAndStopListController.getItemCategories,
);
router.put(
  "/admin/products/:itemId/categories",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.categories.manage"),
  tagsAndStopListController.updateItemCategories,
);

// Управление стоп-листом
router.get("/admin/stop-list", authenticateToken, canManageMenuStopList, tagsAndStopListController.getStopList);
router.get("/admin/stop-list-reasons", authenticateToken, canManageMenuStopList, tagsAndStopListController.getStopListReasons);
router.post("/admin/stop-list-reasons", authenticateToken, canManageMenuStopList, tagsAndStopListController.createStopListReason);
router.put("/admin/stop-list-reasons/:id", authenticateToken, canManageMenuStopList, tagsAndStopListController.updateStopListReason);
router.delete("/admin/stop-list-reasons/:id", authenticateToken, canManageMenuStopList, tagsAndStopListController.deleteStopListReason);
router.post("/admin/stop-list", authenticateToken, canManageMenuStopList, tagsAndStopListController.addToStopList);
router.delete("/admin/stop-list/:id", authenticateToken, canManageMenuStopList, tagsAndStopListController.removeFromStopList);

// Управление отключенными модификаторами для товаров
router.post(
  "/admin/products/:itemId/disabled-modifiers",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  tagsAndStopListController.disableModifierForItem,
);
router.delete(
  "/admin/products/:itemId/disabled-modifiers/:modifierId",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  tagsAndStopListController.enableModifierForItem,
);
router.get(
  "/admin/products/:itemId/disabled-modifiers",
  authenticateToken,
  requirePermission("menu.products.manage", "menu.modifiers.manage"),
  tagsAndStopListController.getItemDisabledModifiers,
);

export default router;
