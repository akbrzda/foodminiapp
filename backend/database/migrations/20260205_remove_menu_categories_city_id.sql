-- Перенос привязки категорий к городам в таблицу menu_category_cities.
INSERT INTO menu_category_cities (category_id, city_id, is_active)
SELECT mc.id, mc.city_id, mc.is_active
FROM menu_categories mc
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active);

-- Удаляем старую связь с городом из menu_categories.
ALTER TABLE menu_categories DROP FOREIGN KEY menu_categories_ibfk_1;
ALTER TABLE menu_categories DROP INDEX idx_city_active_sort;
ALTER TABLE menu_categories DROP COLUMN city_id;

-- Новый индекс под актуальную модель.
CREATE INDEX idx_active_sort ON menu_categories (is_active, sort_order);
