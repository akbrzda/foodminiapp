SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE `cities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `iiko_city_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'Europe/Moscow',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cities_iiko_city_id` (`iiko_city_id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `loyalty_levels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `threshold_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `earn_percentage` int NOT NULL,
  `max_spend_percentage` int NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `pb_group_id` varchar(255) DEFAULT NULL,
  `pb_group_name` varchar(120) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_loyalty_threshold` (`threshold_amount`),
  UNIQUE KEY `uniq_loyalty_levels_pb_group_id` (`pb_group_id`),
  KEY `idx_loyalty_levels_sort_order` (`sort_order`),
  KEY `idx_loyalty_levels_pb_group_name` (`pb_group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3;


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


CREATE TABLE `migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `modifier_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Название группы (например: "Уровень прожарки")',
  `iiko_modifier_group_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL,
  `type` enum('single','multiple') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single' COMMENT 'Одиночный или множественный выбор',
  `is_required` tinyint(1) DEFAULT '0' COMMENT 'Обязательность выбора модификатора из группы',
  `is_global` tinyint(1) DEFAULT '0' COMMENT 'Глобальная группа (переиспользуемая)',
  `min_selections` int DEFAULT '0' COMMENT 'Минимальное количество выборов',
  `max_selections` int DEFAULT '1' COMMENT 'Максимальное количество выборов',
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active_sort` (`is_active`,`sort_order`),
  KEY `idx_iiko_modifier_group_id` (`iiko_modifier_group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `order_number_sequence` (
  `id` int NOT NULL,
  `last_number` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(100) NOT NULL,
  `value` json NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_setting_key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `telegram_id` bigint DEFAULT NULL,
  `max_id` bigint DEFAULT NULL,
  `registration_type` enum('bot_only','miniapp') NOT NULL DEFAULT 'bot_only',
  `bot_registered_at` timestamp NULL DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `email` varchar(1024) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `pb_client_id` varchar(255) DEFAULT NULL,
  `pb_external_id` varchar(255) DEFAULT NULL,
  `loyalty_mode` enum('local','premiumbonus') NOT NULL DEFAULT 'local',
  `pb_sync_status` enum('pending','synced','error','failed') NOT NULL DEFAULT 'pending',
  `pb_sync_error` text,
  `pb_sync_attempts` int NOT NULL DEFAULT '0',
  `pb_last_sync_at` timestamp NULL DEFAULT NULL,
  `loyalty_balance` decimal(10,2) DEFAULT '0.00',
  `current_loyalty_level_id` int DEFAULT NULL,
  `loyalty_joined_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `telegram_id` (`telegram_id`),
  UNIQUE KEY `uq_users_max_id` (`max_id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `idx_phone` (`phone`),
  KEY `idx_telegram_id` (`telegram_id`),
  KEY `idx_users_max_id` (`max_id`),
  KEY `idx_birth_date` (`date_of_birth`),
  KEY `idx_pb_client_id` (`pb_client_id`),
  KEY `idx_pb_sync_status` (`pb_sync_status`),
  KEY `idx_loyalty_mode` (`loyalty_mode`),
  KEY `idx_users_registration_type` (`registration_type`),
  KEY `idx_users_timezone` (`timezone`),
  KEY `idx_current_loyalty_level` (`current_loyalty_level_id`),
  KEY `idx_loyalty_joined_at` (`loyalty_joined_at`),
  CONSTRAINT `chk_loyalty_balance` CHECK (`loyalty_balance` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3;


CREATE TABLE `branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `city_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_organization_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_terminal_group_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL,
  `working_hours` json DEFAULT NULL,
  `prep_time` int DEFAULT '0',
  `assembly_time` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_city_active` (`city_id`,`is_active`),
  UNIQUE KEY `uq_branches_iiko_terminal_group_id` (`iiko_terminal_group_id`),
  KEY `idx_branches_iiko_organization_id` (`iiko_organization_id`),
  CONSTRAINT `branches_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `menu_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active_sort` (`is_active`,`sort_order`),
  KEY `idx_iiko_category_id` (`iiko_category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) DEFAULT '0.00',
  `weight` decimal(10,2) DEFAULT NULL COMMENT 'Вес модификатора',
  `weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Единица измерения веса',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL изображения модификатора',
  `iiko_modifier_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_group_active_sort` (`group_id`,`is_active`,`sort_order`),
  KEY `idx_iiko_modifier_id` (`iiko_modifier_id`),
  CONSTRAINT `modifiers_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `delivery_addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `city_id` int NOT NULL,
  `street` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `house` text COLLATE utf8mb4_unicode_ci NOT NULL,
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


CREATE TABLE `admin_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `telegram_id` bigint DEFAULT NULL,
  `eruda_enabled` tinyint(1) DEFAULT '0',
  `permission_version` int NOT NULL DEFAULT '1',
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


CREATE TABLE `admin_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_roles_code` (`code`),
  KEY `idx_admin_roles_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_permissions_code` (`code`),
  KEY `idx_admin_permissions_module` (`module`),
  KEY `idx_admin_permissions_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_role_permissions` (
  `role_id` int NOT NULL,
  `permission_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `idx_admin_role_permissions_permission` (`permission_id`),
  CONSTRAINT `fk_admin_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_admin_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_user_permission_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_user_id` int NOT NULL,
  `permission_id` int NOT NULL,
  `effect` enum('allow','deny') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_user_permission_override` (`admin_user_id`,`permission_id`),
  KEY `idx_admin_user_permission_effect` (`effect`),
  KEY `idx_admin_user_permission_permission` (`permission_id`),
  CONSTRAINT `fk_admin_user_permission_overrides_user` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_admin_user_permission_overrides_permission` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `admin_users`
  ADD CONSTRAINT `fk_admin_users_role_code`
  FOREIGN KEY (`role`) REFERENCES `admin_roles` (`code`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;


CREATE TABLE `delivery_polygons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` enum('local','iiko') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'local',
  `external_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_terminal_group_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  KEY `idx_delivery_polygons_source` (`source`),
  KEY `idx_delivery_polygons_iiko_terminal_group_id` (`iiko_terminal_group_id`),
  KEY `idx_blocked` (`is_blocked`,`blocked_from`,`blocked_until`),
  UNIQUE KEY `uq_delivery_polygons_source_external_id` (`source`,`external_id`),
  KEY `fk_polygon_blocked_by` (`blocked_by`),
  CONSTRAINT `delivery_polygons_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_polygon_blocked_by` FOREIGN KEY (`blocked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `menu_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `composition` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) DEFAULT '0.00' COMMENT 'Базовая цена (используется если нет вариантов)',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_item_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL,
  `item_type` enum('item','combo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item' COMMENT 'Тип позиции: обычное блюдо или комбо',
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
  `is_new` tinyint(1) DEFAULT NULL COMMENT 'Бейдж: Новинка (NULL = авто-режим)',
  `is_hit` tinyint(1) DEFAULT NULL COMMENT 'Бейдж: Хит (NULL = авто-режим)',
  `is_spicy` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Бейдж: Острое',
  `is_vegetarian` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Бейдж: Вегетарианское',
  `is_piquant` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Бейдж: Пикантное',
  `is_value` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Бейдж: Выгодно',
  `bonus_spend_allowed` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Разрешено ли списание бонусов на позицию',
  `bonus_earn_allowed` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Участвует ли позиция в начислении бонусов',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active_sort` (`is_active`,`sort_order`),
  KEY `idx_iiko_item_id` (`iiko_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `iiko_price_categories` (
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


CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_number` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `city_id` int NOT NULL,
  `branch_id` int DEFAULT NULL,
  `order_type` enum('delivery','pickup','dine_in') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','confirmed','preparing','ready','delivering','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `iiko_order_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_sync_status` enum('pending','synced','error','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `iiko_sync_error` text COLLATE utf8mb4_unicode_ci,
  `iiko_sync_attempts` int NOT NULL DEFAULT '0',
  `iiko_last_sync_at` timestamp NULL DEFAULT NULL,
  `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID категории цен, использованной при создании заказа',
  `pb_purchase_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pb_sync_status` enum('pending','synced','error','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `pb_sync_error` text COLLATE utf8mb4_unicode_ci,
  `pb_sync_attempts` int NOT NULL DEFAULT '0',
  `pb_last_sync_at` timestamp NULL DEFAULT NULL,
  `delivery_address_id` int DEFAULT NULL,
  `delivery_latitude` decimal(10,8) DEFAULT NULL,
  `delivery_longitude` decimal(11,8) DEFAULT NULL,
  `delivery_street` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_house` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_entrance` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_floor` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_apartment` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_intercom` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `bonus_earn_amount` decimal(10,2) DEFAULT '0.00' COMMENT 'Зафиксированная сумма начисления при первом delivered',
  `bonus_earn_locked` tinyint(1) DEFAULT '0' COMMENT 'Флаг блокировки для защиты от дублирования начислений',
  PRIMARY KEY (`id`),
  KEY `city_id` (`city_id`),
  KEY `branch_id` (`branch_id`),
  KEY `delivery_address_id` (`delivery_address_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_order_number` (`order_number`),
  KEY `idx_iiko_order_id` (`iiko_order_id`),
  KEY `idx_iiko_sync_status` (`iiko_sync_status`),
  KEY `idx_pb_purchase_id` (`pb_purchase_id`),
  KEY `idx_pb_sync_status` (`pb_sync_status`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_bonus_earn_locked` (`bonus_earn_locked`),
  KEY `idx_user_status_created` (`user_id`,`status`,`created_at`),
  KEY `idx_price_category_id` (`price_category_id`),
  CONSTRAINT `chk_bonus_spent` CHECK (`bonus_spent` >= 0 AND `bonus_spent` <= `subtotal`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_4` FOREIGN KEY (`delivery_address_id`) REFERENCES `delivery_addresses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `delivery_tariffs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `polygon_id` int NOT NULL,
  `amount_from` int NOT NULL,
  `amount_to` int DEFAULT NULL,
  `delivery_cost` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_delivery_tariffs_polygon` (`polygon_id`),
  KEY `idx_delivery_tariffs_range` (`polygon_id`,`amount_from`),
  CONSTRAINT `delivery_tariffs_ibfk_1` FOREIGN KEY (`polygon_id`) REFERENCES `delivery_polygons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Фото конкретной вариации',
  `iiko_variant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_item_active_sort` (`item_id`,`is_active`,`sort_order`),
  KEY `idx_iiko_variant_id` (`iiko_variant_id`),
  CONSTRAINT `item_variants_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `integration_sync_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `integration_type` enum('iiko','premiumbonus') COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` enum('menu','orders','stoplist','delivery_zones','clients','purchases','loyalty','promocode') COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','success','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `request_data` json DEFAULT NULL,
  `response_data` json DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `duration_ms` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_integration_module` (`integration_type`,`module`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_entity` (`entity_type`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `integration_readiness` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider` enum('iiko','premiumbonus') COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` enum('menu','stoplist','delivery_zones','modifiers','orders','clients','loyalty') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('not_configured','needs_mapping','ready') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_configured',
  `total_count` int NOT NULL DEFAULT '0',
  `linked_count` int NOT NULL DEFAULT '0',
  `unlinked_count` int NOT NULL DEFAULT '0',
  `stats` json DEFAULT NULL,
  `policy` json DEFAULT NULL,
  `last_checked_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_integration_readiness_provider_module` (`provider`,`module`),
  KEY `idx_integration_readiness_status` (`status`),
  KEY `idx_integration_readiness_last_checked_at` (`last_checked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `integration_mapping_candidates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider` enum('iiko','premiumbonus') COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` enum('menu','stoplist','delivery_zones','modifiers','orders','clients','loyalty') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` enum('category','item','variant','modifier','stoplist_entity') COLLATE utf8mb4_unicode_ci NOT NULL,
  `local_entity_type` enum('category','item','variant','modifier','unknown') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `local_entity_id` int DEFAULT NULL,
  `local_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_entity_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `external_context` json DEFAULT NULL,
  `external_payload` json DEFAULT NULL,
  `confidence` decimal(5,2) DEFAULT NULL,
  `state` enum('suggested','confirmed','rejected','ignored','requires_review') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'suggested',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `resolved_by` int DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_integration_mapping_candidates_lookup` (`provider`,`module`,`state`),
  KEY `idx_integration_mapping_candidates_local` (`local_entity_type`,`local_entity_id`),
  KEY `idx_integration_mapping_candidates_external` (`external_entity_id`),
  KEY `idx_integration_mapping_candidates_entity` (`entity_type`),
  CONSTRAINT `integration_mapping_candidates_ibfk_1` FOREIGN KEY (`resolved_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `menu_item_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `city_id` int NOT NULL COMMENT 'ID города',
  `fulfillment_type` enum('delivery','pickup','dine_in') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Способ получения: доставка, самовывоз, зал',
  `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID категории цен из iiko (например: "delivery", "pickup")',
  `price_category_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Название категории цен (например: "Доставка")',
  `price` decimal(10,2) NOT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL COMMENT 'Последняя синхронизация с iiko',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_city_fulfillment_category` (`item_id`,`city_id`,`fulfillment_type`,`price_category_id`),
  KEY `idx_item` (`item_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_fulfillment` (`fulfillment_type`),
  KEY `idx_price_category_id` (`price_category_id`),
  KEY `idx_item_city_category` (`item_id`, `city_id`, `price_category_id`),
  CONSTRAINT `menu_item_prices_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_item_prices_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены блюд по городам, способам получения и категориям цен из iiko';


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


CREATE TABLE `menu_combo_components` (
  `id` int NOT NULL AUTO_INCREMENT,
  `combo_item_id` int NOT NULL COMMENT 'ID позиции-комбо в menu_items',
  `component_item_id` int NOT NULL COMMENT 'ID базового блюда из menu_items',
  `component_variant_id` int NOT NULL COMMENT 'ID варианта блюда из item_variants',
  `quantity` int NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_combo_variant` (`combo_item_id`,`component_variant_id`),
  KEY `idx_combo_item` (`combo_item_id`),
  KEY `idx_component_item` (`component_item_id`),
  KEY `idx_component_variant` (`component_variant_id`),
  CONSTRAINT `fk_menu_combo_components_combo_item` FOREIGN KEY (`combo_item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_menu_combo_components_component_item` FOREIGN KEY (`component_item_id`) REFERENCES `menu_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_menu_combo_components_component_variant` FOREIGN KEY (`component_variant_id`) REFERENCES `item_variants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Фиксированный состав комбо по вариантам блюд';


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
  `external_source` varchar(32) DEFAULT NULL,
  `external_ref` varchar(255) DEFAULT NULL,
  `external_payload` json DEFAULT NULL,
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
  KEY `idx_loyalty_external_source` (`external_source`),
  KEY `idx_loyalty_external_user_created` (`user_id`,`external_source`,`created_at`),
  UNIQUE KEY `uq_loyalty_external_ref` (`user_id`,`external_source`,`external_ref`),
  KEY `loyalty_transactions_new_ibfk_3` (`related_transaction_id`),
  KEY `loyalty_transactions_new_ibfk_4` (`admin_id`),
  CONSTRAINT `loyalty_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loyalty_transactions_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_transactions_ibfk_3` FOREIGN KEY (`related_transaction_id`) REFERENCES `loyalty_transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_transactions_ibfk_4` FOREIGN KEY (`admin_id`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3;


CREATE TABLE `loyalty_bulk_accruals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','processing','completed','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `segment_config` json NOT NULL,
  `bonus_amount` int NOT NULL,
  `message_template` text COLLATE utf8mb4_unicode_ci,
  `audience_count` int NOT NULL DEFAULT '0',
  `success_count` int NOT NULL DEFAULT '0',
  `failed_count` int NOT NULL DEFAULT '0',
  `skipped_count` int NOT NULL DEFAULT '0',
  `requested_total_amount` int NOT NULL DEFAULT '0',
  `actual_total_amount` int NOT NULL DEFAULT '0',
  `created_by` int NOT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_loyalty_bulk_accruals_status` (`status`),
  KEY `idx_loyalty_bulk_accruals_created_by` (`created_by`),
  KEY `idx_loyalty_bulk_accruals_created_at` (`created_at`),
  CONSTRAINT `loyalty_bulk_accruals_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_loyalty_bulk_accruals_bonus_amount` CHECK ((`bonus_amount` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `loyalty_bulk_accrual_recipients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `accrual_id` int NOT NULL,
  `user_id` int NOT NULL,
  `status` enum('pending','completed','failed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `transaction_id` int DEFAULT NULL,
  `notification_status` enum('pending','sent','failed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'skipped',
  `notification_error` text COLLATE utf8mb4_unicode_ci,
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_loyalty_bulk_accrual_user` (`accrual_id`,`user_id`),
  KEY `idx_loyalty_bulk_recipients_status` (`status`),
  KEY `idx_loyalty_bulk_recipients_user` (`user_id`),
  KEY `idx_loyalty_bulk_recipients_processed_at` (`processed_at`),
  CONSTRAINT `loyalty_bulk_accrual_recipients_ibfk_1` FOREIGN KEY (`accrual_id`) REFERENCES `loyalty_bulk_accruals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loyalty_bulk_accrual_recipients_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loyalty_bulk_accrual_recipients_ibfk_3` FOREIGN KEY (`transaction_id`) REFERENCES `loyalty_transactions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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


CREATE TABLE `order_ratings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `user_id` int NOT NULL,
  `rating` tinyint NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_order_ratings_order_user` (`order_id`,`user_id`),
  KEY `idx_order_ratings_user` (`user_id`),
  KEY `idx_order_ratings_rating` (`rating`),
  KEY `idx_order_ratings_created_at` (`created_at`),
  CONSTRAINT `order_ratings_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_ratings_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_order_ratings_rating` CHECK ((`rating` >= 1) AND (`rating` <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `monthly_nps_surveys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `survey_month` date NOT NULL,
  `score` tinyint DEFAULT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `notified_at` timestamp NULL DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_monthly_nps_user_month` (`user_id`,`survey_month`),
  KEY `idx_monthly_nps_survey_month` (`survey_month`),
  KEY `idx_monthly_nps_score` (`score`),
  KEY `idx_monthly_nps_submitted_at` (`submitted_at`),
  CONSTRAINT `monthly_nps_surveys_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_monthly_nps_score` CHECK (`score` IS NULL OR (`score` >= 0 AND `score` <= 10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `broadcast_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` enum('manual','trigger','subscription_campaign') COLLATE utf8mb4_unicode_ci NOT NULL,
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


CREATE TABLE `subscription_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tag` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `welcome_message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `success_message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `already_subscribed_message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `media_type` enum('photo') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_reward_unique` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_perpetual` tinyint(1) NOT NULL DEFAULT '0',
  `start_date` timestamp NULL DEFAULT NULL,
  `end_date` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subscription_campaigns_tag` (`tag`),
  KEY `idx_subscription_campaigns_active_dates` (`is_active`,`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `subscription_attempts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `user_id` int NOT NULL,
  `telegram_id` bigint NOT NULL,
  `first_click_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_check_at` timestamp NULL DEFAULT NULL,
  `first_subscribed_at` timestamp NULL DEFAULT NULL,
  `last_reward_claimed_at` timestamp NULL DEFAULT NULL,
  `attempts_count` int NOT NULL DEFAULT '1',
  `rewards_claimed_count` int NOT NULL DEFAULT '0',
  `is_currently_subscribed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_subscription_attempts_campaign_user` (`campaign_id`,`user_id`),
  KEY `idx_subscription_attempts_telegram_id` (`telegram_id`),
  KEY `idx_subscription_attempts_campaign_subscribed` (`campaign_id`,`is_currently_subscribed`),
  KEY `idx_subscription_attempts_campaign_first_subscribed` (`campaign_id`,`first_subscribed_at`),
  CONSTRAINT `fk_subscription_attempts_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `subscription_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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

CREATE TABLE `menu_variant_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `variant_id` int NOT NULL,
  `city_id` int NOT NULL COMMENT 'ID города',
  `fulfillment_type` enum('delivery','pickup','dine_in') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Способ получения: доставка, самовывоз, зал',
  `price_category_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID категории цен из iiko',
  `price_category_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Название категории цен',
  `price` decimal(10,2) NOT NULL,
  `iiko_synced_at` timestamp NULL DEFAULT NULL COMMENT 'Последняя синхронизация с iiko',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_variant_city_fulfillment_category` (`variant_id`,`city_id`,`fulfillment_type`,`price_category_id`),
  KEY `idx_variant` (`variant_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_fulfillment` (`fulfillment_type`),
  KEY `idx_price_category_id` (`price_category_id`),
  KEY `idx_variant_city_category` (`variant_id`, `city_id`, `price_category_id`),
  CONSTRAINT `menu_variant_prices_ibfk_1` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_variant_prices_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=95 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены вариаций по городам, способам получения и категориям цен из iiko';


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


CREATE TABLE `order_item_modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_item_id` int NOT NULL,
  `modifier_id` int DEFAULT NULL COMMENT 'ID модификатора из таблицы modifiers (новая система)',
  `modifier_group_id` int DEFAULT NULL COMMENT 'ID группы модификаторов',
  `modifier_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `modifier_price` decimal(10,2) NOT NULL,
  `modifier_weight` decimal(10,2) DEFAULT NULL,
  `modifier_weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_item_id` (`order_item_id`),
  KEY `idx_modifier_id` (`modifier_id`),
  KEY `fk_order_item_modifiers_group` (`modifier_group_id`),
  CONSTRAINT `fk_order_item_modifiers_group` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_item_modifiers_modifier` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_item_modifiers_ibfk_1` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_item_modifiers_ibfk_2` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_item_modifiers_ibfk_4` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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

CREATE TABLE `stories_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `placement` enum('home') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'home',
  `status` enum('draft','active','paused','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `priority` int NOT NULL DEFAULT '0',
  `cover_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_at` timestamp NULL DEFAULT NULL,
  `end_at` timestamp NULL DEFAULT NULL,
  `city_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `segment_config` json DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stories_campaigns_status` (`status`),
  KEY `idx_stories_campaigns_placement_status` (`placement`,`status`,`is_active`),
  KEY `idx_stories_campaigns_dates` (`start_at`,`end_at`),
  KEY `idx_stories_campaigns_city_id` (`city_id`),
  KEY `idx_stories_campaigns_branch_id` (`branch_id`),
  KEY `idx_stories_campaigns_created_by` (`created_by`),
  CONSTRAINT `fk_stories_campaigns_branch_id` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stories_campaigns_city_id` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stories_campaigns_created_by` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `stories_slides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtitle` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cta_text` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cta_type` enum('none','route','url','category','product','promo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `cta_value` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_seconds` int NOT NULL DEFAULT '6',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stories_slides_campaign_id` (`campaign_id`),
  KEY `idx_stories_slides_campaign_sort` (`campaign_id`,`sort_order`,`is_active`),
  CONSTRAINT `fk_stories_slides_campaign_id` FOREIGN KEY (`campaign_id`) REFERENCES `stories_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `stories_impressions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `slide_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `placement` enum('home') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'home',
  `platform` enum('telegram','max','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `viewed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stories_impressions_campaign_id` (`campaign_id`),
  KEY `idx_stories_impressions_user_id` (`user_id`),
  KEY `idx_stories_impressions_campaign_user` (`campaign_id`,`user_id`),
  KEY `idx_stories_impressions_viewed_at` (`viewed_at`),
  CONSTRAINT `fk_stories_impressions_campaign_id` FOREIGN KEY (`campaign_id`) REFERENCES `stories_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stories_impressions_slide_id` FOREIGN KEY (`slide_id`) REFERENCES `stories_slides` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stories_impressions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `stories_clicks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `slide_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `placement` enum('home') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'home',
  `platform` enum('telegram','max','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `cta_type` enum('none','route','url','category','product','promo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `cta_value` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clicked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stories_clicks_campaign_id` (`campaign_id`),
  KEY `idx_stories_clicks_user_id` (`user_id`),
  KEY `idx_stories_clicks_campaign_user` (`campaign_id`,`user_id`),
  KEY `idx_stories_clicks_clicked_at` (`clicked_at`),
  CONSTRAINT `fk_stories_clicks_campaign_id` FOREIGN KEY (`campaign_id`) REFERENCES `stories_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stories_clicks_slide_id` FOREIGN KEY (`slide_id`) REFERENCES `stories_slides` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stories_clicks_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `stories_user_state` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `campaign_id` int NOT NULL,
  `last_slide_index` int NOT NULL DEFAULT '0',
  `completed_at` timestamp NULL DEFAULT NULL,
  `last_viewed_at` timestamp NULL DEFAULT NULL,
  `views_count` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stories_user_state` (`user_id`,`campaign_id`),
  KEY `idx_stories_user_state_campaign_id` (`campaign_id`),
  KEY `idx_stories_user_state_completed_at` (`completed_at`),
  CONSTRAINT `fk_stories_user_state_campaign_id` FOREIGN KEY (`campaign_id`) REFERENCES `stories_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stories_user_state_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO `loyalty_levels` (`id`, `name`, `threshold_amount`, `earn_percentage`, `max_spend_percentage`, `is_enabled`, `sort_order`, `pb_group_id`, `pb_group_name`) VALUES
(1, 'Бронза', 0.00, 3, 25, 1, 10, NULL, NULL),
(2, 'Серебро', 10000.00, 5, 25, 1, 20, NULL, NULL),
(3, 'Золото', 20000.00, 7, 25, 1, 30, NULL, NULL);

INSERT INTO `order_number_sequence` (`id`, `last_number`) VALUES (1, 0);

INSERT INTO `admin_roles` (`id`, `code`, `name`, `is_system`, `is_active`) VALUES
(1, 'ceo', 'CEO', 1, 1),
(2, 'admin', 'Администратор', 1, 1),
(3, 'manager', 'Менеджер', 1, 1);

INSERT INTO `admin_permissions` (`id`, `code`, `module`, `action`, `description`, `is_active`) VALUES
(1, 'dashboard.view', 'dashboard', 'view', 'Просмотр дашборда', 1),
(2, 'orders.view', 'orders', 'view', 'Просмотр заказов', 1),
(3, 'orders.manage', 'orders', 'manage', 'Управление заказами', 1),
(4, 'orders.delete', 'orders', 'delete', 'Удаление заказов', 1),
(5, 'clients.view', 'clients', 'view', 'Просмотр клиентов', 1),
(6, 'clients.manage', 'clients', 'manage', 'Редактирование клиентов', 1),
(7, 'clients.loyalty.adjust', 'clients', 'loyalty_adjust', 'Ручная корректировка бонусов', 1),
(8, 'locations.cities.manage', 'locations', 'cities_manage', 'Управление городами', 1),
(9, 'locations.branches.view', 'locations', 'branches_view', 'Просмотр филиалов', 1),
(10, 'locations.branches.manage', 'locations', 'branches_manage', 'Управление филиалами', 1),
(11, 'locations.delivery_zones.view', 'locations', 'delivery_zones_view', 'Просмотр зон доставки', 1),
(12, 'locations.delivery_zones.manage', 'locations', 'delivery_zones_manage', 'Управление зонами доставки', 1),
(13, 'menu.products.manage', 'menu', 'products_manage', 'Управление блюдами', 1),
(14, 'menu.categories.manage', 'menu', 'categories_manage', 'Управление категориями', 1),
(15, 'menu.modifiers.manage', 'menu', 'modifiers_manage', 'Управление модификаторами', 1),
(16, 'menu.tags.manage', 'menu', 'tags_manage', 'Управление тегами', 1),
(17, 'menu.stop_list.manage', 'menu', 'stop_list_manage', 'Управление стоп-листом', 1),
(18, 'marketing.broadcasts.manage', 'marketing', 'broadcasts_manage', 'Управление рассылками', 1),
(19, 'marketing.campaigns.manage', 'marketing', 'campaigns_manage', 'Управление кампаниями подписки', 1),
(20, 'system.settings.manage', 'system', 'settings_manage', 'Управление системными настройками', 1),
(21, 'system.integrations.manage', 'system', 'integrations_manage', 'Управление интеграциями', 1),
(22, 'system.roles.view', 'system', 'roles_view', 'Просмотр справочника ролей', 1),
(23, 'system.loyalty_levels.manage', 'system', 'loyalty_levels_manage', 'Управление уровнями лояльности', 1),
(24, 'system.admin_users.manage', 'system', 'admin_users_manage', 'Управление admin-users', 1),
(25, 'system.logs.view', 'system', 'logs_view', 'Просмотр административных логов', 1),
(26, 'system.queues.manage', 'system', 'queues_manage', 'Управление очередями', 1),
(27, 'system.access.manage', 'system', 'access_manage', 'Управление ролями и доступами', 1),
(28, 'system.auth_limits.manage', 'system', 'auth_limits_manage', 'Управление auth-лимитами', 1),
(29, 'locations.delivery_zones.toggle', 'locations', 'delivery_zones_toggle', 'Блокировка/разблокировка и переключение зон доставки', 1),
(30, 'marketing.stories.manage', 'marketing', 'stories_manage', 'Управление stories-кампаниями', 1);

INSERT INTO `admin_role_permissions` (`role_id`, `permission_id`) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9), (1, 10), (1, 11), (1, 12), (1, 13), (1, 14), (1, 15), (1, 16), (1, 17), (1, 18), (1, 19), (1, 20), (1, 21), (1, 22), (1, 23), (1, 24), (1, 25), (1, 26), (1, 27), (1, 28), (1, 29), (1, 30),
(2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7), (2, 8), (2, 9), (2, 10), (2, 11), (2, 12), (2, 13), (2, 14), (2, 15), (2, 16), (2, 17), (2, 18), (2, 19), (2, 20), (2, 21), (2, 22), (2, 23), (2, 24), (2, 25), (2, 26), (2, 27), (2, 28), (2, 29), (2, 30),
(3, 1), (3, 2), (3, 3), (3, 5), (3, 6), (3, 9), (3, 11), (3, 12), (3, 17);

SET FOREIGN_KEY_CHECKS=1;
