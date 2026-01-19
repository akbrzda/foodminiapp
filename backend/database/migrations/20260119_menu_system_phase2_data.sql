-- =====================================================
-- Миграция: Перенос существующих данных - Фаза 2
-- Дата: 2026-01-19
-- Описание: Миграция связей категорий, цен блюд и вариаций
-- ВАЖНО: Запускать после 20260119_menu_system_phase1.sql
-- =====================================================

-- ====================
-- 1. Миграция связей категорий
-- ====================

-- Перенести связи menu_items.category_id → menu_item_categories
-- Проверяем, есть ли еще поле category_id в menu_items
INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order)
SELECT id, category_id, sort_order
FROM menu_items
WHERE category_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = 'menu_items'
      AND table_schema = DATABASE()
      AND column_name = 'category_id'
  );

-- ====================
-- 2. Миграция цен блюд
-- ====================

-- Перенести цены блюд в menu_item_prices (для трех способов получения)
INSERT IGNORE INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
SELECT id, NULL, 'delivery', price
FROM menu_items
WHERE price IS NOT NULL AND price > 0
UNION ALL
SELECT id, NULL, 'pickup', price
FROM menu_items
WHERE price IS NOT NULL AND price > 0
UNION ALL
SELECT id, NULL, 'dine_in', price
FROM menu_items
WHERE price IS NOT NULL AND price > 0;

-- ====================
-- 3. Миграция цен вариаций
-- ====================

-- Перенести цены вариантов в menu_variant_prices
INSERT IGNORE INTO menu_variant_prices (variant_id, city_id, fulfillment_type, price)
SELECT id, NULL, 'delivery', price
FROM item_variants
WHERE price IS NOT NULL AND price > 0
UNION ALL
SELECT id, NULL, 'pickup', price
FROM item_variants
WHERE price IS NOT NULL AND price > 0
UNION ALL
SELECT id, NULL, 'dine_in', price
FROM item_variants
WHERE price IS NOT NULL AND price > 0;

-- ====================
-- 4. Создание привязок категорий к городам
-- ====================

-- Создать привязку всех существующих категорий ко всем городам (все активны по умолчанию)
INSERT IGNORE INTO menu_category_cities (category_id, city_id, is_active)
SELECT DISTINCT mc.id, c.id, TRUE
FROM menu_categories mc
CROSS JOIN cities c;

-- Если категории уже привязаны к конкретным городам, активируем только для них
-- (оставляем NULL для всех остальных)
UPDATE menu_category_cities mcc
JOIN menu_categories mc ON mc.id = mcc.category_id
SET mcc.is_active = TRUE
WHERE mc.city_id = mcc.city_id;

-- ====================
-- 5. Создание привязок блюд к городам
-- ====================

-- Создать привязку всех блюд ко всем городам (все активны по умолчанию)
INSERT IGNORE INTO menu_item_cities (item_id, city_id, is_active)
SELECT DISTINCT mi.id, c.id, TRUE
FROM menu_items mi
CROSS JOIN cities c;

-- ====================
-- 6. Обновление min/max_selections для групп модификаторов
-- ====================

-- Установить min_selections = 1 для обязательных групп
UPDATE modifier_groups
SET min_selections = 1,
    max_selections = 1
WHERE is_required = TRUE
  AND min_selections = 0;

-- Установить min_selections = 0 для необязательных групп с множественным выбором
UPDATE modifier_groups
SET min_selections = 0,
    max_selections = 10
WHERE is_required = FALSE
  AND type = 'multiple';

-- Установить min_selections = 0, max_selections = 1 для необязательных групп с одиночным выбором
UPDATE modifier_groups
SET min_selections = 0,
    max_selections = 1
WHERE is_required = FALSE
  AND type = 'single';

-- ====================
-- 7. Создание тестовых тегов (опционально)
-- ====================

INSERT IGNORE INTO tags (name, icon, color) VALUES
('Острое', '🌶️', '#FF6B6B'),
('Веган', '🌱', '#51CF66'),
('Без глютена', '🌾', '#FFD43B'),
('Новинка', '⭐', '#4DABF7'),
('Хит продаж', '🔥', '#FF922B'),
('Острая', '🌶️', '#FF6B6B');

-- ====================
-- Миграция данных завершена
-- ====================

-- Примечание: Удаление поля category_id из menu_items следует делать после
-- полного тестирования новой системы
-- ALTER TABLE menu_items DROP FOREIGN KEY menu_items_ibfk_1;
-- ALTER TABLE menu_items DROP COLUMN category_id;
