import express from "express";
import db from "../config/database.js";
import { authenticateToken, requireRole, checkCityAccess } from "../middleware/auth.js";

const router = express.Router();

// ==================== Публичные эндпоинты ====================

// Получить полное меню города (категории + позиции + варианты + модификаторы)
router.get("/", async (req, res, next) => {
  try {
    const { city_id } = req.query;

    if (!city_id) {
      return res.status(400).json({ error: "city_id is required" });
    }

    // Получаем категории
    const [categories] = await db.query(
      `SELECT id, city_id, name, description, image_url, sort_order, 
              is_active, created_at, updated_at
       FROM menu_categories
       WHERE city_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [city_id]
    );

    // Для каждой категории получаем позиции
    for (const category of categories) {
      const [items] = await db.query(
        `SELECT id, category_id, name, description, price, image_url, 
                weight, calories, sort_order, is_active, created_at, updated_at
         FROM menu_items
         WHERE category_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [category.id]
      );

      // Для каждой позиции получаем варианты
      for (const item of items) {
        const [variants] = await db.query(
          `SELECT id, item_id, name, price, sort_order, is_active
           FROM item_variants
           WHERE item_id = ? AND is_active = TRUE
           ORDER BY sort_order, name`,
          [item.id]
        );
        item.variants = variants;

        // Получаем группы модификаторов для позиции
        const [modifierGroups] = await db.query(
          `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_active
           FROM modifier_groups mg
           JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
           WHERE img.item_id = ? AND mg.is_active = TRUE
           ORDER BY mg.name`,
          [item.id]
        );

        // Для каждой группы получаем модификаторы
        for (const group of modifierGroups) {
          const [modifiers] = await db.query(
            `SELECT id, group_id, name, price, sort_order, is_active
             FROM modifiers
             WHERE group_id = ? AND is_active = TRUE
             ORDER BY sort_order, name`,
            [group.id]
          );
          group.modifiers = modifiers;
        }

        item.modifier_groups = modifierGroups;

        // Получаем старые модификаторы (для обратной совместимости)
        const [oldModifiers] = await db.query(
          `SELECT id, item_id, name, price, is_required, is_active
           FROM menu_modifiers
           WHERE item_id = ? AND is_active = TRUE
           ORDER BY name`,
          [item.id]
        );
        item.modifiers = oldModifiers;
      }

      category.items = items;
    }

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

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

    // Для каждой позиции получаем варианты
    for (const item of items) {
      const [variants] = await db.query(
        `SELECT id, item_id, name, price, sort_order, is_active
         FROM item_variants
         WHERE item_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [item.id]
      );
      item.variants = variants;

      // Получаем группы модификаторов для позиции
      const [modifierGroups] = await db.query(
        `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_active
         FROM modifier_groups mg
         JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
         WHERE img.item_id = ? AND mg.is_active = TRUE
         ORDER BY mg.name`,
        [item.id]
      );

      // Для каждой группы получаем модификаторы
      for (const group of modifierGroups) {
        const [modifiers] = await db.query(
          `SELECT id, group_id, name, price, sort_order, is_active
           FROM modifiers
           WHERE group_id = ? AND is_active = TRUE
           ORDER BY sort_order, name`,
          [group.id]
        );
        group.modifiers = modifiers;
      }

      item.modifier_groups = modifierGroups;
    }

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// Получить позицию меню по ID с вариантами и группами модификаторов
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

    const item = items[0];

    // Получаем варианты позиции
    const [variants] = await db.query(
      `SELECT id, item_id, name, price, sort_order, is_active
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId]
    );

    // Получаем группы модификаторов для позиции
    const [modifierGroups] = await db.query(
      `SELECT mg.id, mg.name, mg.type, mg.is_required, mg.is_active
       FROM modifier_groups mg
       JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
       WHERE img.item_id = ? AND mg.is_active = TRUE
       ORDER BY mg.name`,
      [itemId]
    );

    // Для каждой группы получаем модификаторы
    for (const group of modifierGroups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, sort_order, is_active
         FROM modifiers
         WHERE group_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [group.id]
      );
      group.modifiers = modifiers;
    }

    // Получаем старые модификаторы (для обратной совместимости)
    const [oldModifiers] = await db.query(
      `SELECT id, item_id, name, price, is_required, is_active
       FROM menu_modifiers
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY name`,
      [itemId]
    );

    res.json({
      item: {
        ...item,
        variants: variants,
        modifier_groups: modifierGroups,
        modifiers: oldModifiers, // Старая система для обратной совместимости
      },
    });
  } catch (error) {
    next(error);
  }
});

// Получить активные модификаторы позиции (старая система)
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

// Получить варианты позиции
router.get("/items/:itemId/variants", async (req, res, next) => {
  try {
    const itemId = req.params.itemId;

    const [variants] = await db.query(
      `SELECT id, item_id, name, price, sort_order, is_active, created_at, updated_at
       FROM item_variants
       WHERE item_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [itemId]
    );

    res.json({ variants });
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

// Создать позицию меню (с вариантами и привязкой групп модификаторов)
router.post("/admin/items", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { category_id, name, description, price, image_url, weight, calories, sort_order, variants, modifier_group_ids } = req.body;

    if (!category_id || !name) {
      return res.status(400).json({
        error: "category_id and name are required",
      });
    }

    // Если нет вариантов, то price обязателен
    if ((!variants || variants.length === 0) && price === undefined) {
      return res.status(400).json({
        error: "price is required if no variants provided",
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

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Создаем позицию
      const [result] = await connection.query(
        `INSERT INTO menu_items 
         (category_id, name, description, price, image_url, weight, calories, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [category_id, name, description || null, price || 0, image_url || null, weight || null, calories || null, sort_order || 0]
      );

      const itemId = result.insertId;

      // Создаем варианты, если они переданы
      if (variants && Array.isArray(variants) && variants.length > 0) {
        for (const variant of variants) {
          if (!variant.name || variant.price === undefined) {
            throw new Error("Variant name and price are required");
          }
          await connection.query(
            `INSERT INTO item_variants (item_id, name, price, sort_order)
             VALUES (?, ?, ?, ?)`,
            [itemId, variant.name, variant.price, variant.sort_order || 0]
          );
        }
      }

      // Привязываем группы модификаторов, если они переданы
      if (modifier_group_ids && Array.isArray(modifier_group_ids) && modifier_group_ids.length > 0) {
        for (const groupId of modifier_group_ids) {
          // Проверяем существование группы
          const [groups] = await connection.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);
          if (groups.length > 0) {
            await connection.query(
              "INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES (?, ?)",
              [itemId, groupId]
            );
          }
        }
      }

      await connection.commit();

      // Получаем созданную позицию с вариантами и группами
      const [newItem] = await connection.query(
        `SELECT id, category_id, name, description, price, image_url, 
                weight, calories, sort_order, is_active, 
                gulyash_item_id, created_at, updated_at
         FROM menu_items WHERE id = ?`,
        [itemId]
      );

      const [itemVariants] = await connection.query(
        `SELECT id, item_id, name, price, sort_order, is_active
         FROM item_variants WHERE item_id = ?`,
        [itemId]
      );

      const [itemModifierGroups] = await connection.query(
        `SELECT mg.id, mg.name, mg.type, mg.is_required
         FROM modifier_groups mg
         JOIN item_modifier_groups img ON mg.id = img.modifier_group_id
         WHERE img.item_id = ?`,
        [itemId]
      );

      newItem[0].variants = itemVariants;
      newItem[0].modifier_groups = itemModifierGroups;

      res.status(201).json({ item: newItem[0] });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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

// ==================== API для вариантов позиций ====================

// Получить все варианты позиции (включая неактивные)
router.get("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
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

    const [variants] = await db.query(
      `SELECT id, item_id, name, price, sort_order, is_active, created_at, updated_at
       FROM item_variants
       WHERE item_id = ?
       ORDER BY sort_order, name`,
      [itemId]
    );

    res.json({ variants });
  } catch (error) {
    next(error);
  }
});

// Создать вариант позиции
router.post("/admin/items/:itemId/variants", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { name, price, sort_order } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        error: "name and price are required",
      });
    }

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

    const [result] = await db.query(
      `INSERT INTO item_variants (item_id, name, price, sort_order)
       VALUES (?, ?, ?, ?)`,
      [itemId, name, price, sort_order || 0]
    );

    const [newVariant] = await db.query(
      `SELECT id, item_id, name, price, sort_order, is_active, created_at, updated_at
       FROM item_variants WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ variant: newVariant[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить вариант позиции
router.put("/admin/variants/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const variantId = req.params.id;
    const { name, price, sort_order, is_active } = req.body;

    // Проверяем существование варианта и доступ
    const [variants] = await db.query(
      `SELECT iv.id, mc.city_id 
       FROM item_variants iv
       JOIN menu_items mi ON iv.item_id = mi.id
       JOIN menu_categories mc ON mi.category_id = mc.id
       WHERE iv.id = ?`,
      [variantId]
    );

    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(variants[0].city_id)) {
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

    values.push(variantId);
    await db.query(`UPDATE item_variants SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedVariant] = await db.query(
      `SELECT id, item_id, name, price, sort_order, is_active, created_at, updated_at
       FROM item_variants WHERE id = ?`,
      [variantId]
    );

    res.json({ variant: updatedVariant[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить вариант позиции
router.delete("/admin/variants/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const variantId = req.params.id;

    // Проверяем существование варианта и доступ
    const [variants] = await db.query(
      `SELECT iv.id, mc.city_id 
       FROM item_variants iv
       JOIN menu_items mi ON iv.item_id = mi.id
       JOIN menu_categories mc ON mi.category_id = mc.id
       WHERE iv.id = ?`,
      [variantId]
    );

    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Проверка доступа к городу для менеджеров
    if (req.user.role === "manager" && !req.user.cities.includes(variants[0].city_id)) {
      return res.status(403).json({
        error: "You do not have access to this city",
      });
    }

    await db.query("DELETE FROM item_variants WHERE id = ?", [variantId]);

    res.json({ message: "Variant deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// ==================== API для групп модификаторов ====================

// Получить все группы модификаторов
router.get("/modifier-groups", async (req, res, next) => {
  try {
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_active, created_at, updated_at
       FROM modifier_groups
       WHERE is_active = TRUE
       ORDER BY name`,
      []
    );

    // Для каждой группы получаем модификаторы
    for (const group of groups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, sort_order, is_active
         FROM modifiers
         WHERE group_id = ? AND is_active = TRUE
         ORDER BY sort_order, name`,
        [group.id]
      );
      group.modifiers = modifiers;
    }

    res.json({ modifier_groups: groups });
  } catch (error) {
    next(error);
  }
});

// Получить группу модификаторов по ID
router.get("/modifier-groups/:id", async (req, res, next) => {
  try {
    const groupId = req.params.id;

    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_active, created_at, updated_at
       FROM modifier_groups
       WHERE id = ? AND is_active = TRUE`,
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    const group = groups[0];

    // Получаем модификаторы группы
    const [modifiers] = await db.query(
      `SELECT id, group_id, name, price, sort_order, is_active
       FROM modifiers
       WHERE group_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [groupId]
    );

    group.modifiers = modifiers;

    res.json({ modifier_group: group });
  } catch (error) {
    next(error);
  }
});

// Получить все группы модификаторов (админ, включая неактивные)
router.get("/admin/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const [groups] = await db.query(
      `SELECT id, name, type, is_required, is_active, created_at, updated_at
       FROM modifier_groups
       ORDER BY name`,
      []
    );

    // Для каждой группы получаем модификаторы
    for (const group of groups) {
      const [modifiers] = await db.query(
        `SELECT id, group_id, name, price, sort_order, is_active
         FROM modifiers
         WHERE group_id = ?
         ORDER BY sort_order, name`,
        [group.id]
      );
      group.modifiers = modifiers;
    }

    res.json({ modifier_groups: groups });
  } catch (error) {
    next(error);
  }
});

// Создать группу модификаторов
router.post("/admin/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const { name, type, is_required, modifiers } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        error: "name and type are required",
      });
    }

    if (!["single", "multiple"].includes(type)) {
      return res.status(400).json({
        error: "type must be 'single' or 'multiple'",
      });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Создаем группу
      const [groupResult] = await connection.query(
        `INSERT INTO modifier_groups (name, type, is_required)
         VALUES (?, ?, ?)`,
        [name, type, is_required || false]
      );

      const groupId = groupResult.insertId;

      // Создаем модификаторы, если они переданы
      if (modifiers && Array.isArray(modifiers) && modifiers.length > 0) {
        for (const modifier of modifiers) {
          await connection.query(
            `INSERT INTO modifiers (group_id, name, price, sort_order)
             VALUES (?, ?, ?, ?)`,
            [groupId, modifier.name, modifier.price || 0, modifier.sort_order || 0]
          );
        }
      }

      await connection.commit();

      // Получаем созданную группу с модификаторами
      const [newGroup] = await connection.query(
        `SELECT id, name, type, is_required, is_active, created_at, updated_at
         FROM modifier_groups WHERE id = ?`,
        [groupId]
      );

      const [groupModifiers] = await connection.query(
        `SELECT id, group_id, name, price, sort_order, is_active
         FROM modifiers WHERE group_id = ?`,
        [groupId]
      );

      newGroup[0].modifiers = groupModifiers;

      res.status(201).json({ modifier_group: newGroup[0] });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
});

// Обновить группу модификаторов
router.put("/admin/modifier-groups/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { name, type, is_required, is_active } = req.body;

    // Проверяем существование группы
    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (type !== undefined) {
      if (!["single", "multiple"].includes(type)) {
        return res.status(400).json({ error: "type must be 'single' or 'multiple'" });
      }
      updates.push("type = ?");
      values.push(type);
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

    values.push(groupId);
    await db.query(`UPDATE modifier_groups SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedGroup] = await db.query(
      `SELECT id, name, type, is_required, is_active, created_at, updated_at
       FROM modifier_groups WHERE id = ?`,
      [groupId]
    );

    res.json({ modifier_group: updatedGroup[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить группу модификаторов
router.delete("/admin/modifier-groups/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const groupId = req.params.id;

    // Проверяем существование группы
    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    // Проверяем, используется ли группа в позициях
    const [items] = await db.query(
      "SELECT COUNT(*) as count FROM item_modifier_groups WHERE modifier_group_id = ?",
      [groupId]
    );

    if (items[0].count > 0) {
      return res.status(400).json({
        error: "Cannot delete modifier group that is used in menu items. Remove associations first.",
      });
    }

    await db.query("DELETE FROM modifier_groups WHERE id = ?", [groupId]);

    res.json({ message: "Modifier group deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Привязать группу модификаторов к позиции
router.post("/admin/items/:itemId/modifier-groups", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const { modifier_group_id } = req.body;

    if (!modifier_group_id) {
      return res.status(400).json({ error: "modifier_group_id is required" });
    }

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

    // Проверяем существование группы
    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [modifier_group_id]);

    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    // Проверяем, не привязана ли уже группа
    const [existing] = await db.query(
      "SELECT id FROM item_modifier_groups WHERE item_id = ? AND modifier_group_id = ?",
      [itemId, modifier_group_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Modifier group is already associated with this item" });
    }

    await db.query(
      "INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES (?, ?)",
      [itemId, modifier_group_id]
    );

    res.status(201).json({ message: "Modifier group associated with item successfully" });
  } catch (error) {
    next(error);
  }
});

// Отвязать группу модификаторов от позиции
router.delete("/admin/items/:itemId/modifier-groups/:groupId", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const groupId = req.params.groupId;

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

    await db.query(
      "DELETE FROM item_modifier_groups WHERE item_id = ? AND modifier_group_id = ?",
      [itemId, groupId]
    );

    res.json({ message: "Modifier group unassociated from item successfully" });
  } catch (error) {
    next(error);
  }
});

// ==================== API для модификаторов в группах ====================

// Получить все модификаторы группы
router.get("/modifier-groups/:groupId/modifiers", async (req, res, next) => {
  try {
    const groupId = req.params.groupId;

    const [modifiers] = await db.query(
      `SELECT id, group_id, name, price, sort_order, is_active, created_at, updated_at
       FROM modifiers
       WHERE group_id = ? AND is_active = TRUE
       ORDER BY sort_order, name`,
      [groupId]
    );

    res.json({ modifiers });
  } catch (error) {
    next(error);
  }
});

// Создать модификатор в группе
router.post("/admin/modifier-groups/:groupId/modifiers", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const { name, price, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "name is required",
      });
    }

    // Проверяем существование группы
    const [groups] = await db.query("SELECT id FROM modifier_groups WHERE id = ?", [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: "Modifier group not found" });
    }

    const [result] = await db.query(
      `INSERT INTO modifiers (group_id, name, price, sort_order)
       VALUES (?, ?, ?, ?)`,
      [groupId, name, price || 0, sort_order || 0]
    );

    const [newModifier] = await db.query(
      `SELECT id, group_id, name, price, sort_order, is_active, created_at, updated_at
       FROM modifiers WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ modifier: newModifier[0] });
  } catch (error) {
    next(error);
  }
});

// Обновить модификатор в группе
router.put("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.id;
    const { name, price, sort_order, is_active } = req.body;

    // Проверяем существование модификатора
    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifierId]);

    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
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

    values.push(modifierId);
    await db.query(`UPDATE modifiers SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updatedModifier] = await db.query(
      `SELECT id, group_id, name, price, sort_order, is_active, created_at, updated_at
       FROM modifiers WHERE id = ?`,
      [modifierId]
    );

    res.json({ modifier: updatedModifier[0] });
  } catch (error) {
    next(error);
  }
});

// Удалить модификатор из группы
router.delete("/admin/modifiers/:id", authenticateToken, requireRole("admin", "manager", "ceo"), async (req, res, next) => {
  try {
    const modifierId = req.params.id;

    // Проверяем существование модификатора
    const [modifiers] = await db.query("SELECT id FROM modifiers WHERE id = ?", [modifierId]);

    if (modifiers.length === 0) {
      return res.status(404).json({ error: "Modifier not found" });
    }

    await db.query("DELETE FROM modifiers WHERE id = ?", [modifierId]);

    res.json({ message: "Modifier deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
