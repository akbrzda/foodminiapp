-- Нормализация price_category_id для устранения дублей при ON DUPLICATE KEY UPDATE.
-- Причина: в MySQL UNIQUE-индекс допускает множество строк с NULL в уникальном поле.

-- 1) Удаляем дубли по позициям, оставляя последнюю запись.
CREATE TEMPORARY TABLE tmp_menu_item_prices_keep_ids AS
SELECT MAX(id) AS id
FROM menu_item_prices
GROUP BY item_id, city_id, fulfillment_type, COALESCE(price_category_id, '');

DELETE mip
FROM menu_item_prices mip
LEFT JOIN tmp_menu_item_prices_keep_ids keep_rows ON keep_rows.id = mip.id
WHERE keep_rows.id IS NULL;

DROP TEMPORARY TABLE tmp_menu_item_prices_keep_ids;

-- 2) Удаляем дубли по вариантам, оставляя последнюю запись.
CREATE TEMPORARY TABLE tmp_menu_variant_prices_keep_ids AS
SELECT MAX(id) AS id
FROM menu_variant_prices
GROUP BY variant_id, city_id, fulfillment_type, COALESCE(price_category_id, '');

DELETE mvp
FROM menu_variant_prices mvp
LEFT JOIN tmp_menu_variant_prices_keep_ids keep_rows ON keep_rows.id = mvp.id
WHERE keep_rows.id IS NULL;

DROP TEMPORARY TABLE tmp_menu_variant_prices_keep_ids;

-- 3) Убираем NULL и фиксируем поле как NOT NULL.
UPDATE menu_item_prices SET price_category_id = '' WHERE price_category_id IS NULL;
UPDATE menu_variant_prices SET price_category_id = '' WHERE price_category_id IS NULL;

ALTER TABLE menu_item_prices
  MODIFY COLUMN `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'ID категории цен из iiko (например: "delivery", "pickup")';

ALTER TABLE menu_variant_prices
  MODIFY COLUMN `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'ID категории цен из iiko';
