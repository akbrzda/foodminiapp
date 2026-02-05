-- Перенос связей блюд и категорий в menu_item_categories.
INSERT INTO menu_item_categories (item_id, category_id, sort_order)
SELECT mi.id, mi.category_id, 0
FROM menu_items mi
WHERE mi.category_id IS NOT NULL
ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order);

-- Удаляем старую связь с категорией из menu_items.
ALTER TABLE menu_items DROP FOREIGN KEY menu_items_ibfk_1;
ALTER TABLE menu_items DROP INDEX idx_category_active_sort;
ALTER TABLE menu_items DROP COLUMN category_id;

-- Новый индекс под актуальную модель.
CREATE INDEX idx_active_sort ON menu_items (is_active, sort_order);
