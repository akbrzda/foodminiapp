import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";

const router = express.Router();

// ==================== Публичные эндпоинты ====================

// Получить активные категории меню по городу
router.get("/categories", async (req, res, next) => {
  try {
    const { city_id } = req.query;

    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }

    const [categories] = await db.query(
      `SELECT id, city_id, name, description, image_url, sort_order, 
              is_active, created_at, updated_at
       FROM menu_categories
       WHERE city_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [city_id]
    );

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// Получить категорию по ID
router.get("/categories/:id", async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    const [categories] = await db.query(
      `SELECT id, city_id, name, description, image_url, sort_order, 
              is_active, created_at, updated_at
       FROM menu_categories
       WHERE id = ? AND is_active = TRUE`,
      [categoryId]
    );

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({ category: categories[0] });
  } catch (error) {
    next(error);
  }
});

// Получить активные позиции категории
router.get("/categories/:categoryId/items", async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId;

    const [items] = await db.query(
      `SELECT id, category_id, name, description, price, image_url, 
              weight, calories, sort_order, is_active, created_at, updated_at
       FROM menu_items
       WHERE category_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [categoryId]
    );

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// Получить позицию меню по ID
router.get("/items/:id", async (req, res, next) => {
  try {
    const itemId = req.params.id;

    const [items] = await db.query(
      `SELECT id, category_id, name, description, price, image_url, 
              weight, calories, sort_order, is_active, created_at, updated_at
       FROM menu_items
       WHERE id = ? AND is_active = TRUE`,
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ item: items[0] });
  } catch (error) {
    next(error);
  }
});

// Получить активные модификаторы позиции
router.get("/items/:itemId/modifiers", async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [modifiers] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active, created_at, updated_at
       FROM menu_modifiers
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY name`,
      [itemId]
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
});

// ==================== Админские эндпоинты ====================

// Получить все категории города (включая неактивные)
router.get("/admin/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_id } = req.query;

    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(parseInt(city_id))) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [categories] = await db.query(
      `SELECT id, city_id, name, description, image_url, sort_order, 
                is_active, gulyash_category_id, created_at, updated_at
         FROM menu_categories
         WHERE city_id = ?
         ORDER BY sort_order, name`,
      [city_id]
    );

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// Создать категорию
router.post("/admin/categories", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { city_id, name, description, image_url, sort_order } = req.body;

    if (!city_id || !name) {
      return res.status(400).json({
        error: "city_id and name are required",
      });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(parseInt(city_id))) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [result] = await db.query(
      `INSERT INTO menu_categories (city_id, name, description, image_url, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      [city_id, name, description || null, image_url || null, sort_order || 0]
    );

    const [newCategory] = await db.query(
      `SELECT id, city_id, name, description, image_url, sort_order, 
                is_active, gulyash_category_id, created_at, updated_at
         FROM menu_categories WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ category: newCategory[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить категорию
router.put("/admin/categories/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.id;
    const { name, description, image_url, sort_order, is_active } = req.body;

    // Проверяем существование и доступ
    const [categories] = await db.query("SELECT city_id FROM menu_categories WHERE id = ?", [categoryId]);

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(categories[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (image_url !== undefined) {
      updates.push("image_url = ?");
      values.push(image_url);
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      values.push(sort_order);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(categoryId);
    await db.query(`UPDATE menu_categories SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedCategory] = await db.query(
      `SELECT id, city_id, name, description, image_url, sort_order, 
                is_active, gulyash_category_id, created_at, updated_at
         FROM menu_categories WHERE id = ?`,
      [categoryId]
    );

    res.json({ category: updatedCategory[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить категорию
router.delete("/admin/categories/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    // Проверяем существование и доступ
    const [categories] = await db.query("SELECT city_id FROM menu_categories WHERE id = ?", [categoryId]);

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(categories[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    // Проверяем есть ли позиции в категории
    const [items] = await db.query("SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?", [categoryId]);

    if (items[0].count > 0) {
      return res.status(400).json({
        error: "Cannot delete category with items. Delete items first.",
      });
    }

    await db.query("DELETE FROM menu_categories WHERE id = ?", [categoryId]);

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Получить все позиции категории (включая неактивные)
router.get("/admin/categories/:categoryId/items", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId;

    // Проверяем существование и доступ
    const [categories] = await db.query("SELECT city_id FROM menu_categories WHERE id = ?", [categoryId]);

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(categories[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [items] = await db.query(
      `SELECT id, category_id, name, description, price, image_url, 
                weight, calories, sort_order, is_active, 
                gulyash_item_id, created_at, updated_at
         FROM menu_items
         WHERE category_id = ?
         ORDER BY sort_order, name`,
      [categoryId]
    );

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// Создать позицию меню
router.post("/admin/items", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { category_id, name, description, price, image_url, weight, calories, sort_order } = req.body;

    if (!category_id || !name || price === undefined) {
      return res.status(400).json({
        error: "category_id, name, and price are required",
      });
    }

    // Проверяем существование категории и доступ
    const [categories] = await db.query("SELECT city_id FROM menu_categories WHERE id = ?", [category_id]);

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(categories[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [result] = await db.query(
      `INSERT INTO menu_items 
         (category_id, name, description, price, image_url, weight, calories, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [category_id, name, description || null, price, image_url || null, weight || null, calories || null, sort_order || 0]
    );

    const [newItem] = await db.query(
      `SELECT id, category_id, name, description, price, image_url, 
                weight, calories, sort_order, is_active, 
                gulyash_item_id, created_at, updated_at
         FROM menu_items WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ item: newItem[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить позицию меню
router.put("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const { category_id, name, description, price, image_url, weight, calories, sort_order, is_active } = req.body;

    // Проверяем существование позиции
    const [items] = await db.query(
      `SELECT mi.id, mc.city_id 
         FROM menu_items mi
         JOIN menu_categories mc ON mi.category_id = mc.id
         WHERE mi.id = ?`,
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(items[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const updates = [];
    const values = [];

    if (category_id !== undefined) {
      // Проверяем существование новой категории
      const [newCategories] = await db.query("SELECT city_id FROM menu_categories WHERE id = ?", [category_id]);
      if (newCategories.length === 0) {
        return res.status(404).json({ error: "Category not found" });
      }
      updates.push("category_id = ?");
      values.push(category_id);
    }
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (price !== undefined) {
      updates.push("price = ?");
      values.push(price);
    }
    if (image_url !== undefined) {
      updates.push("image_url = ?");
      values.push(image_url);
    }
    if (weight !== undefined) {
      updates.push("weight = ?");
      values.push(weight);
    }
    if (calories !== undefined) {
      updates.push("calories = ?");
      values.push(calories);
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      values.push(sort_order);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(itemId);
    await db.query(`UPDATE menu_items SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedItem] = await db.query(
      `SELECT id, category_id, name, description, price, image_url, 
                weight, calories, sort_order, is_active, 
                gulyash_item_id, created_at, updated_at
         FROM menu_items WHERE id = ?`,
      [itemId]
    );

    res.json({ item: updatedItem[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить позицию меню
router.delete("/admin/items/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.id;

    // Проверяем существование позиции
    const [items] = await db.query(
      `SELECT mi.id, mc.city_id 
         FROM menu_items mi
         JOIN menu_categories mc ON mi.category_id = mc.id
         WHERE mi.id = ?`,
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(items[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    await db.query("DELETE FROM menu_items WHERE id = ?", [itemId]);

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Получить все модификаторы позиции (включая неактивные)
router.get("/admin/items/:itemId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    // Проверяем существование позиции и доступ
    const [items] = await db.query(
      `SELECT mi.id, mc.city_id 
         FROM menu_items mi
         JOIN menu_categories mc ON mi.category_id = mc.id
         WHERE mi.id = ?`,
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(items[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [modifiers] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active, 
                gulyash_modifier_id, created_at, updated_at
         FROM menu_modifiers
         WHERE item_id = ?
         ORDER BY name`,
      [itemId]
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
});

// Создать модификатор
router.post("/admin/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { item_id, name, price, is_required } = req.body;

    if (!item_id || !name) {
      return res.status(400).json({
        error: "item_id and name are required",
      });
    }

    // Проверяем существование позиции и доступ
    const [items] = await db.query(
      `SELECT mi.id, mc.city_id 
         FROM menu_items mi
         JOIN menu_categories mc ON mi.category_id = mc.id
         WHERE mi.id = ?`,
      [item_id]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(items[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const [result] = await db.query(
      `INSERT INTO menu_modifiers (item_id, name, price, is_required)
         VALUES (?, ?, ?, ?)`,
      [item_id, name, price || 0, is_required || false]
    );

    const [newModifier] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active, 
                gulyash_modifier_id, created_at, updated_at
         FROM menu_modifiers WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ modifier: newModifier[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить модификатор
router.put("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.id;
    const { name, price, is_required, is_active } = req.body;

    // Проверяем существование модификатора и доступ
    const [modifiers] = await db.query(
      `SELECT mm.id, mc.city_id 
         FROM menu_modifiers mm
         JOIN menu_items mi ON mm.item_id = mi.id
         JOIN menu_categories mc ON mi.category_id = mc.id
         WHERE mm.id = ?`,
      [modifierId]
    );

    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(modifiers[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (price !== undefined) {
      updates.push("price = ?");
      values.push(price);
    }
    if (is_required !== undefined) {
      updates.push("is_required = ?");
      values.push(is_required);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(modifierId);
    await db.query(`UPDATE menu_modifiers SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedModifier] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active, 
                gulyash_modifier_id, created_at, updated_at
         FROM menu_modifiers WHERE id = ?`,
      [modifierId]
    );

    res.json({ modifier: updatedModifier[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить модификатор
router.delete("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.id;

    // Проверяем существование модификатора и доступ
    const [modifiers] = await db.query(
      `SELECT mm.id, mc.city_id 
         FROM menu_modifiers mm
         JOIN menu_items mi ON mm.item_id = mi.id
         JOIN menu_categories mc ON mi.category_id = mc.id
         WHERE mm.id = ?`,
      [modifierId]
    );

    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(modifiers[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    await db.query("DELETE FROM menu_modifiers WHERE id = ?", [modifierId]);

    res.json({ message: "Modifier deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
