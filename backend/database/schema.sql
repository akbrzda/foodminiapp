/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_action_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_user_id` int NOT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_user_id` (`admin_user_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `admin_action_logs_ibfk_1` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=90 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_user_branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_user_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_admin_branch` (`admin_user_id`,`branch_id`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `admin_user_branches_ibfk_1` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admin_user_branches_ibfk_2` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_user_cities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_user_id` int NOT NULL,
  `city_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_admin_city` (`admin_user_id`,`city_id`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `admin_user_cities_ibfk_1` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admin_user_cities_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','manager','ceo') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `telegram_id` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `branch_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_admin_users_branch_id` (`branch_id`),
  CONSTRAINT `fk_admin_users_branch_id` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `city_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `working_hours` json DEFAULT NULL,
  `prep_time` int DEFAULT '0',
  `assembly_time` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_city_active` (`city_id`,`is_active`),
  CONSTRAINT `branches_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'Europe/Moscow',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `city_id` int NOT NULL,
  `street` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `house` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entrance` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `apartment` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `intercom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `city_id` (`city_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `delivery_addresses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `delivery_addresses_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_polygons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `polygon` polygon NOT NULL,
  `delivery_time` int DEFAULT '30',
  `min_order_amount` decimal(10,2) DEFAULT '0.00',
  `delivery_cost` decimal(10,2) DEFAULT '0.00',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_blocked` tinyint(1) DEFAULT '0' COMMENT 'Блокировка полигона (постоянная или временная)',
  `blocked_from` datetime DEFAULT NULL COMMENT 'Начало периода блокировки (для временной блокировки)',
  `blocked_until` datetime DEFAULT NULL COMMENT 'Конец периода блокировки (для временной блокировки)',
  `block_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Причина блокировки',
  `blocked_by` int DEFAULT NULL COMMENT 'ID пользователя, который заблокировал',
  `blocked_at` timestamp NULL DEFAULT NULL COMMENT 'Время блокировки',
  PRIMARY KEY (`id`),
  SPATIAL KEY `idx_polygon` (`polygon`),
  KEY `idx_branch_active` (`branch_id`,`is_active`),
  KEY `idx_blocked` (`is_blocked`,`blocked_from`,`blocked_until`),
  KEY `fk_polygon_blocked_by` (`blocked_by`),
  CONSTRAINT `delivery_polygons_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_polygon_blocked_by` FOREIGN KEY (`blocked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_modifier_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `modifier_group_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_modifier_group` (`item_id`,`modifier_group_id`),
  KEY `idx_item_id` (`item_id`),
  KEY `idx_modifier_group_id` (`modifier_group_id`),
  CONSTRAINT `item_modifier_groups_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `item_modifier_groups_ibfk_2` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_variants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Название варианта (например: "Маленькая (25см)")',
  `price` decimal(10,2) NOT NULL,
  `weight_value` decimal(10,2) DEFAULT NULL,
  `weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `calories_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Калории на 100г',
  `proteins_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Белки на 100г',
  `fats_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Жиры на 100г',
  `carbs_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Углеводы на 100г',
  `calories_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Калории на порцию',
  `proteins_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Белки на порцию',
  `fats_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Жиры на порцию',
  `carbs_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Углеводы на порцию',
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_item_active_sort` (`item_id`,`is_active`,`sort_order`),
  CONSTRAINT `item_variants_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_levels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `threshold_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `earn_percentage` int NOT NULL,
  `max_spend_percentage` int NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_loyalty_threshold` (`threshold_amount`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

-- Базовые уровни лояльности
INSERT INTO `loyalty_levels` (`id`, `name`, `threshold_amount`, `earn_percentage`, `max_spend_percentage`, `is_enabled`) VALUES
(1, 'Бронза', 0.00, 3, 25, 1),
(2, 'Серебро', 10000.00, 5, 25, 1),
(3, 'Золото', 20000.00, 7, 25, 1);

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `event_type` varchar(50) NOT NULL,
  `old_value` text,
  `new_value` text,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_loyalty_event_type` (`event_type`),
  KEY `idx_loyalty_user` (`user_id`),
  KEY `idx_loyalty_order` (`order_id`),
  KEY `idx_loyalty_created` (`created_at`),
  CONSTRAINT `loyalty_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_logs_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` enum('earn','spend','expire','registration','birthday','adjustment') NOT NULL,
  `status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'completed',
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `remaining_amount` decimal(10,2) DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `related_transaction_id` int DEFAULT NULL,
  `description` text,
  `expires_at` timestamp NULL DEFAULT NULL,
  `admin_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_loyalty_user` (`user_id`),
  KEY `idx_loyalty_order` (`order_id`),
  KEY `idx_loyalty_type` (`type`),
  KEY `idx_loyalty_status` (`status`),
  KEY `idx_loyalty_expires` (`expires_at`),
  KEY `idx_loyalty_user_type_created` (`user_id`,`type`,`created_at`),
  KEY `idx_loyalty_type_status_expires` (`type`,`status`,`expires_at`),
  KEY `loyalty_transactions_new_ibfk_3` (`related_transaction_id`),
  KEY `loyalty_transactions_new_ibfk_4` (`admin_id`),
  CONSTRAINT `loyalty_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loyalty_transactions_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_transactions_ibfk_3` FOREIGN KEY (`related_transaction_id`) REFERENCES `loyalty_transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_transactions_ibfk_4` FOREIGN KEY (`admin_id`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `city_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_city_active_sort` (`city_id`,`is_active`,`sort_order`),
  CONSTRAINT `menu_categories_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_category_cities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL,
  `city_id` int NOT NULL,
  `is_active` tinyint(1) DEFAULT '1' COMMENT 'Включена ли категория для данного города',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_category_city` (`category_id`,`city_id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `menu_category_cities_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `menu_categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_category_cities_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Доступность категорий по городам';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_item_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `category_id` int NOT NULL,
  `sort_order` int DEFAULT '0' COMMENT 'Порядок отображения блюда в категории',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_category` (`item_id`,`category_id`),
  KEY `idx_item` (`item_id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_category_sort` (`category_id`,`sort_order`),
  CONSTRAINT `menu_item_categories_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_item_categories_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `menu_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Связь блюд с несколькими категориями';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_item_cities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `city_id` int NOT NULL,
  `is_active` tinyint(1) DEFAULT '1' COMMENT 'Включено ли блюдо для данного города',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_city` (`item_id`,`city_id`),
  KEY `idx_item` (`item_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `menu_item_cities_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_item_cities_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Доступность блюд по городам';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_item_disabled_modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `modifier_id` int NOT NULL COMMENT 'Модификатор из глобальной группы, который отключен для данного блюда',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_modifier` (`item_id`,`modifier_id`),
  KEY `idx_item` (`item_id`),
  KEY `idx_modifier` (`modifier_id`),
  CONSTRAINT `menu_item_disabled_modifiers_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_item_disabled_modifiers_ibfk_2` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Отключенные модификаторы из глобальных групп';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_item_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `city_id` int DEFAULT NULL COMMENT 'NULL = цена для всех городов',
  `fulfillment_type` enum('delivery','pickup','dine_in') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Способ получения: доставка, самовывоз, зал',
  `price` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_city_fulfillment` (`item_id`,`city_id`,`fulfillment_type`),
  KEY `idx_item` (`item_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_fulfillment` (`fulfillment_type`),
  CONSTRAINT `menu_item_prices_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_item_prices_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены блюд по городам и способам получения';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_item_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `tag_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_tag` (`item_id`,`tag_id`),
  KEY `idx_item` (`item_id`),
  KEY `idx_tag` (`tag_id`),
  CONSTRAINT `menu_item_tags_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_item_tags_ibfk_2` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Связь блюд с тегами';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `composition` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) DEFAULT '0.00' COMMENT 'Базовая цена (используется если нет вариантов)',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weight` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weight_value` decimal(10,2) DEFAULT NULL,
  `weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `calories_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Калории на 100г',
  `proteins_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Белки на 100г',
  `fats_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Жиры на 100г',
  `carbs_per_100g` decimal(10,2) DEFAULT NULL COMMENT 'Углеводы на 100г',
  `calories_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Калории на порцию',
  `proteins_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Белки на порцию',
  `fats_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Жиры на порцию',
  `carbs_per_serving` decimal(10,2) DEFAULT NULL COMMENT 'Углеводы на порцию',
  `calories` int DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category_active_sort` (`category_id`,`is_active`,`sort_order`),
  CONSTRAINT `menu_items_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `menu_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_modifier_variant_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modifier_id` int NOT NULL,
  `variant_id` int NOT NULL COMMENT 'Вариация, для которой действует данная цена модификатора',
  `price` decimal(10,2) NOT NULL,
  `weight` decimal(10,2) DEFAULT NULL COMMENT 'Вес модификатора для данной вариации',
  `weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_modifier_variant` (`modifier_id`,`variant_id`),
  KEY `idx_modifier` (`modifier_id`),
  KEY `idx_variant` (`variant_id`),
  CONSTRAINT `menu_modifier_variant_prices_ibfk_1` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_modifier_variant_prices_ibfk_2` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены модификаторов для разных вариаций';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) DEFAULT '0.00',
  `is_required` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_item_active` (`item_id`,`is_active`),
  CONSTRAINT `menu_modifiers_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_stop_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `entity_type` enum('item','variant','modifier') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Тип сущности: блюдо, вариация, модификатор',
  `entity_id` int NOT NULL COMMENT 'ID блюда, вариации или модификатора',
  `fulfillment_types` json DEFAULT NULL COMMENT 'Способы получения',
  `reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Причина добавления в стоп-лист',
  `auto_remove` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Автоматически снять со стопа',
  `remove_at` timestamp NULL DEFAULT NULL COMMENT 'Дата автоматического снятия',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL COMMENT 'ID администратора, добавившего в стоп-лист',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_branch_entity` (`branch_id`,`entity_type`,`entity_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_stop_list_remove_at` (`remove_at`),
  CONSTRAINT `menu_stop_list_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_stop_list_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Стоп-лист позиций по филиалам';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_stop_list_reasons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reason_name` (`name`),
  KEY `idx_sort` (`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_variant_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `variant_id` int NOT NULL,
  `city_id` int DEFAULT NULL COMMENT 'NULL = цена для всех городов',
  `fulfillment_type` enum('delivery','pickup','dine_in') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Способ получения: доставка, самовывоз, зал',
  `price` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_variant_city_fulfillment` (`variant_id`,`city_id`,`fulfillment_type`),
  KEY `idx_variant` (`variant_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_fulfillment` (`fulfillment_type`),
  CONSTRAINT `menu_variant_prices_ibfk_1` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_variant_prices_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=95 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены вариаций по городам и способам получения';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `modifier_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Название группы (например: "Уровень прожарки")',
  `type` enum('single','multiple') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single' COMMENT 'Одиночный или множественный выбор',
  `is_required` tinyint(1) DEFAULT '0' COMMENT 'Обязательность выбора модификатора из группы',
  `is_global` tinyint(1) DEFAULT '0' COMMENT 'Глобальная группа (переиспользуемая)',
  `min_selections` int DEFAULT '0' COMMENT 'Минимальное количество выборов',
  `max_selections` int DEFAULT '1' COMMENT 'Максимальное количество выборов',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) DEFAULT '0.00',
  `weight` decimal(10,2) DEFAULT NULL COMMENT 'Вес модификатора',
  `weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Единица измерения веса',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL изображения модификатора',
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `gulyash_modifier_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_group_active_sort` (`group_id`,`is_active`,`sort_order`),
  CONSTRAINT `modifiers_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_item_modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_item_id` int NOT NULL,
  `modifier_id` int DEFAULT NULL COMMENT 'ID модификатора из таблицы modifiers (новая система)',
  `old_modifier_id` int DEFAULT NULL COMMENT 'ID модификатора из таблицы menu_modifiers (старая система, для обратной совместимости)',
  `modifier_group_id` int DEFAULT NULL COMMENT 'ID группы модификаторов',
  `modifier_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `modifier_price` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `old_modifier_id` (`old_modifier_id`),
  KEY `idx_order_item_id` (`order_item_id`),
  KEY `idx_modifier_id` (`modifier_id`),
  KEY `fk_order_item_modifiers_group` (`modifier_group_id`),
  CONSTRAINT `fk_order_item_modifiers_group` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_item_modifiers_modifier` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_item_modifiers_ibfk_1` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_item_modifiers_ibfk_2` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_item_modifiers_ibfk_3` FOREIGN KEY (`old_modifier_id`) REFERENCES `menu_modifiers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_item_modifiers_ibfk_4` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `item_id` int DEFAULT NULL,
  `variant_id` int DEFAULT NULL COMMENT 'ID варианта позиции (если выбран вариант)',
  `item_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Название варианта для истории заказа',
  `item_price` decimal(10,2) NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `subtotal` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `item_id` (`item_id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_variant_id` (`variant_id`),
  CONSTRAINT `fk_order_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_items_ibfk_3` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_number` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `city_id` int NOT NULL,
  `branch_id` int DEFAULT NULL,
  `order_type` enum('delivery','pickup') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','confirmed','preparing','ready','delivering','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `delivery_address_id` int DEFAULT NULL,
  `delivery_latitude` decimal(10,8) DEFAULT NULL,
  `delivery_longitude` decimal(11,8) DEFAULT NULL,
  `delivery_street` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_house` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_entrance` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_floor` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_apartment` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_intercom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_comment` text COLLATE utf8mb4_unicode_ci,
  `payment_method` enum('cash','card') COLLATE utf8mb4_unicode_ci NOT NULL,
  `change_from` decimal(10,2) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `delivery_cost` decimal(10,2) DEFAULT '0.00',
  `bonus_spent` decimal(10,2) DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `desired_time` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `user_timezone_offset` int DEFAULT '0',
  `auto_status_date` date DEFAULT NULL,
  `gulyash_order_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sync_status` enum('pending','synced','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `sync_attempts` int DEFAULT '0',
  `sync_error` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `bonus_earn_amount` decimal(10,2) DEFAULT '0.00' COMMENT 'Зафиксированная сумма начисления при первом delivered',
  `bonus_earn_locked` tinyint(1) DEFAULT '0' COMMENT 'Флаг блокировки для защиты от дублирования начислений',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `city_id` (`city_id`),
  KEY `branch_id` (`branch_id`),
  KEY `delivery_address_id` (`delivery_address_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_order_number` (`order_number`),
  KEY `idx_status` (`status`),
  KEY `idx_sync_status` (`sync_status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_bonus_earn_locked` (`bonus_earn_locked`),
  KEY `idx_user_status_created` (`user_id`,`status`,`created_at`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_4` FOREIGN KEY (`delivery_address_id`) REFERENCES `delivery_addresses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `old_status` enum('pending','confirmed','preparing','ready','delivering','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `new_status` enum('pending','confirmed','preparing','ready','delivering','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed_by_type` enum('admin','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `changed_by_admin_id` int DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_status_history_order` (`order_id`),
  KEY `idx_order_status_history_changed_at` (`changed_at`),
  KEY `idx_order_status_history_admin` (`changed_by_admin_id`),
  CONSTRAINT `order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_status_history_ibfk_2` FOREIGN KEY (`changed_by_admin_id`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(100) NOT NULL,
  `value` json NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_setting_key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Иконка или эмодзи для тега',
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Цвет тега для отображения',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Теги для фильтрации и поиска блюд';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_loyalty_levels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `loyalty_level_id` int NOT NULL,
  `previous_level_id` int DEFAULT NULL,
  `reason` varchar(255) NOT NULL,
  `threshold_sum` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  KEY `user_loyalty_levels_new_ibfk_2` (`loyalty_level_id`),
  KEY `user_loyalty_levels_new_ibfk_3` (`previous_level_id`),
  CONSTRAINT `user_loyalty_levels_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_loyalty_levels_ibfk_2` FOREIGN KEY (`loyalty_level_id`) REFERENCES `loyalty_levels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `user_loyalty_levels_ibfk_3` FOREIGN KEY (`previous_level_id`) REFERENCES `loyalty_levels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_states` (
  `user_id` int NOT NULL,
  `selected_city_id` int DEFAULT NULL,
  `selected_branch_id` int DEFAULT NULL,
  `delivery_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'delivery',
  `delivery_address` text COLLATE utf8mb4_unicode_ci,
  `delivery_coords` json DEFAULT NULL,
  `delivery_details` json DEFAULT NULL,
  `cart` json DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_user_state_city` (`selected_city_id`),
  KEY `idx_user_state_branch` (`selected_branch_id`),
  CONSTRAINT `user_states_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_states_ibfk_2` FOREIGN KEY (`selected_city_id`) REFERENCES `cities` (`id`) ON DELETE SET NULL,
  CONSTRAINT `user_states_ibfk_3` FOREIGN KEY (`selected_branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `telegram_id` bigint DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `loyalty_balance` decimal(10,2) DEFAULT '0.00',
  `current_loyalty_level_id` int DEFAULT NULL,
  `loyalty_joined_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `telegram_id` (`telegram_id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `idx_phone` (`phone`),
  KEY `idx_telegram_id` (`telegram_id`),
  KEY `idx_birth_date` (`date_of_birth`),
  KEY `idx_users_timezone` (`timezone`),
  KEY `idx_current_loyalty_level` (`current_loyalty_level_id`),
  KEY `idx_loyalty_joined_at` (`loyalty_joined_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_segments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `config` json NOT NULL,
  `estimated_size` int DEFAULT NULL,
  `estimated_at` timestamp NULL DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_segments_created_by` (`created_by`),
  KEY `idx_broadcast_segments_created_at` (`created_at`),
  CONSTRAINT `broadcast_segments_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` enum('manual','trigger') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','scheduled','sending','completed','cancelled','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trigger_type` enum('inactive_users','birthday','new_registration') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trigger_config` json DEFAULT NULL,
  `segment_id` int DEFAULT NULL,
  `segment_config` json NOT NULL,
  `content_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content_buttons` json DEFAULT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `use_user_timezone` tinyint(1) DEFAULT '1',
  `target_hour` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_by` int NOT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_campaigns_type` (`type`),
  KEY `idx_broadcast_campaigns_status` (`status`),
  KEY `idx_broadcast_campaigns_trigger_type` (`trigger_type`),
  KEY `idx_broadcast_campaigns_scheduled_at` (`scheduled_at`),
  KEY `idx_broadcast_campaigns_is_active` (`is_active`),
  KEY `idx_broadcast_campaigns_created_by` (`created_by`),
  KEY `idx_broadcast_campaigns_created_at` (`created_at`),
  KEY `idx_broadcast_campaigns_segment_id` (`segment_id`),
  CONSTRAINT `broadcast_campaigns_ibfk_1` FOREIGN KEY (`segment_id`) REFERENCES `broadcast_segments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `broadcast_campaigns_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `user_id` int NOT NULL,
  `status` enum('pending','sending','sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `telegram_message_id` bigint DEFAULT NULL,
  `personalized_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `retry_count` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_messages_campaign_id` (`campaign_id`),
  KEY `idx_broadcast_messages_user_id` (`user_id`),
  KEY `idx_broadcast_messages_status` (`status`),
  KEY `idx_broadcast_messages_scheduled_at` (`scheduled_at`),
  KEY `idx_broadcast_messages_campaign_status` (`campaign_id`,`status`),
  KEY `idx_broadcast_messages_status_scheduled` (`status`,`scheduled_at`),
  KEY `idx_broadcast_messages_status_retry` (`status`,`retry_count`),
  CONSTRAINT `broadcast_messages_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_messages_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_clicks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `button_index` int NOT NULL,
  `button_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clicked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_clicks` (`message_id`,`button_index`,`user_id`),
  KEY `idx_broadcast_clicks_campaign_id` (`campaign_id`),
  KEY `idx_broadcast_clicks_message_id` (`message_id`),
  KEY `idx_broadcast_clicks_user_id` (`user_id`),
  KEY `idx_broadcast_clicks_clicked_at` (`clicked_at`),
  CONSTRAINT `broadcast_clicks_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_clicks_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `broadcast_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_clicks_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_conversions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `order_id` int NOT NULL,
  `order_total` decimal(10,2) NOT NULL,
  `order_created_at` timestamp NULL DEFAULT NULL,
  `days_after_broadcast` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_conversions_order` (`order_id`),
  KEY `idx_broadcast_conversions_campaign_id` (`campaign_id`),
  KEY `idx_broadcast_conversions_message_id` (`message_id`),
  KEY `idx_broadcast_conversions_user_id` (`user_id`),
  KEY `idx_broadcast_conversions_order_id` (`order_id`),
  CONSTRAINT `broadcast_conversions_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_conversions_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `broadcast_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_conversions_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_conversions_ibfk_4` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint NOT NULL,
  `priority` int DEFAULT '0',
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `locked_at` timestamp NULL DEFAULT NULL,
  `locked_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_queue_message_id` (`message_id`),
  KEY `idx_broadcast_queue_schedule_lock` (`scheduled_at`,`locked_at`,`priority`),
  KEY `idx_broadcast_queue_locked_by` (`locked_by`),
  CONSTRAINT `broadcast_queue_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `broadcast_messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_stats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `total_recipients` int DEFAULT '0',
  `sent_count` int DEFAULT '0',
  `failed_count` int DEFAULT '0',
  `click_count` int DEFAULT '0',
  `unique_clicks` int DEFAULT '0',
  `conversion_count` int DEFAULT '0',
  `conversion_amount` decimal(10,2) DEFAULT '0.00',
  `avg_send_time_seconds` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_stats_campaign` (`campaign_id`),
  CONSTRAINT `broadcast_stats_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `broadcast_trigger_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `user_id` int NOT NULL,
  `trigger_date` date NOT NULL,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_trigger_log` (`campaign_id`,`user_id`,`trigger_date`),
  KEY `idx_broadcast_trigger_log_executed` (`executed_at`),
  CONSTRAINT `broadcast_trigger_log_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_trigger_log_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
