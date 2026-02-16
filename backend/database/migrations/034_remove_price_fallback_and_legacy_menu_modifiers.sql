-- Удаление fallback-цен и легаси структуры модификаторов

-- 1) Удаляем fallback-записи цен (city_id IS NULL), чтобы больше не было неявных подстановок
DELETE FROM menu_item_prices WHERE city_id IS NULL;
DELETE FROM menu_variant_prices WHERE city_id IS NULL;

-- 2) Делаем город обязательным для цен
ALTER TABLE menu_item_prices
  MODIFY city_id INT NOT NULL COMMENT 'ID города';

ALTER TABLE menu_variant_prices
  MODIFY city_id INT NOT NULL COMMENT 'ID города';

-- 3) Удаляем легаси-обратную совместимость со старой таблицей menu_modifiers
ALTER TABLE order_item_modifiers
  DROP FOREIGN KEY order_item_modifiers_ibfk_3;

ALTER TABLE order_item_modifiers
  DROP INDEX old_modifier_id;

ALTER TABLE order_item_modifiers
  DROP COLUMN old_modifier_id;

DROP TABLE IF EXISTS menu_modifiers;

-- 4) Удаляем неиспользуемую старую таблицу групповых цен вариантов модификаторов (если осталась)
DROP TABLE IF EXISTS menu_modifier_variant_group_prices;
