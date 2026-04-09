-- Миграция: Добавление поддержки категорий цен из iiko
-- Дата: 2026-04-09
-- Описание: Расширение таблиц для хранения цен по разным категориям из iiko

-- 1. Добавить колонку price_category_id в menu_item_prices
ALTER TABLE menu_item_prices ADD COLUMN `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID категории цен из iiko (например: "delivery", "pickup")' AFTER `fulfillment_type`;
ALTER TABLE menu_item_prices ADD COLUMN `price_category_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Название категории цен (например: "Доставка")' AFTER `price_category_id`;
ALTER TABLE menu_item_prices ADD COLUMN `iiko_synced_at` timestamp NULL DEFAULT NULL COMMENT 'Последняя синхронизация с iiko' AFTER `price_category_name`;

-- Обновить unique constraint (удалить старый, добавить новый)
ALTER TABLE menu_item_prices DROP KEY unique_item_city_fulfillment;
ALTER TABLE menu_item_prices ADD UNIQUE KEY `unique_item_city_fulfillment_category` (
  `item_id`,
  `city_id`,
  `fulfillment_type`,
  `price_category_id`
);

-- 2. Добавить индексы для быстрого поиска цен по категориям
ALTER TABLE menu_item_prices ADD KEY `idx_price_category_id` (`price_category_id`);
ALTER TABLE menu_item_prices ADD KEY `idx_item_city_category` (`item_id`, `city_id`, `price_category_id`);

-- 3. Добавить колонку price_category_id в menu_variant_prices
ALTER TABLE menu_variant_prices ADD COLUMN `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID категории цен из iiko' AFTER `fulfillment_type`;
ALTER TABLE menu_variant_prices ADD COLUMN `price_category_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Название категории цен' AFTER `price_category_id`;
ALTER TABLE menu_variant_prices ADD COLUMN `iiko_synced_at` timestamp NULL DEFAULT NULL COMMENT 'Последняя синхронизация с iiko' AFTER `price_category_name`;

-- Обновить unique constraint
ALTER TABLE menu_variant_prices DROP KEY unique_variant_city_fulfillment;
ALTER TABLE menu_variant_prices ADD UNIQUE KEY `unique_variant_city_fulfillment_category` (
  `variant_id`,
  `city_id`,
  `fulfillment_type`,
  `price_category_id`
);

-- 4. Добавить индексы
ALTER TABLE menu_variant_prices ADD KEY `idx_price_category_id` (`price_category_id`);
ALTER TABLE menu_variant_prices ADD KEY `idx_variant_city_category` (`variant_id`, `city_id`, `price_category_id`);

-- 5. Создать таблицу для кэширования доступных категорий цен из iiko
CREATE TABLE IF NOT EXISTS `iiko_price_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `iiko_category_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE COMMENT 'ID категории цен из iiko',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Название категории (например: "Доставка", "Самовывоз")',
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) DEFAULT '1',
  `last_synced_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_iiko_category_id` (`iiko_category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Кэш доступных категорий цен из iiko';

-- 6. Обновить orders таблицу для сохранения price_category_id заказа
ALTER TABLE orders ADD COLUMN `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID категории цен, использованной при создании заказа' AFTER `iiko_last_sync_at`;
ALTER TABLE orders ADD KEY `idx_price_category_id` (`price_category_id`);

-- 7. Update schema version
INSERT INTO migrations (name, executed_at) 
VALUES ('032_add_price_categories_support', NOW())
ON DUPLICATE KEY UPDATE executed_at = NOW();
