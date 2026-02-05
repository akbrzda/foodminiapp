CREATE TABLE `menu_modifier_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modifier_id` int NOT NULL,
  `city_id` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_modifier_city` (`modifier_id`,`city_id`),
  KEY `idx_modifier_city` (`modifier_id`,`city_id`),
  CONSTRAINT `menu_modifier_prices_ibfk_1` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_modifier_prices_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены модификаторов по городам';
