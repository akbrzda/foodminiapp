-- Приведение удаленной схемы к спецификации бонусной системы

SET FOREIGN_KEY_CHECKS = 0;

-- Удаляем устаревшие таблицы, которых нет в спецификации
DROP TABLE IF EXISTS `loyalty_exclusions`;
DROP TABLE IF EXISTS `user_loyalty_stats`;

-- Актуализируем таблицу пользователей
ALTER TABLE `users`
  CHANGE COLUMN `bonus_balance` `loyalty_balance` decimal(10,2) DEFAULT '0.00',
  CHANGE COLUMN `loyalty_registered_at` `loyalty_joined_at` timestamp NULL DEFAULT NULL,
  DROP COLUMN `loyalty_level`,
  DROP COLUMN `total_spent`,
  DROP COLUMN `registration_bonus_granted`,
  DROP COLUMN `birthday_bonus_last_granted_year`;

CREATE INDEX `idx_loyalty_joined_at` ON `users` (`loyalty_joined_at`);

-- Актуализируем таблицу заказов
ALTER TABLE `orders`
  CHANGE COLUMN `bonus_used` `bonus_spent` decimal(10,2) DEFAULT '0.00';

CREATE INDEX `idx_user_status_created` ON `orders` (`user_id`, `status`, `created_at`);

-- Пересоздаем логи лояльности
CREATE TABLE `loyalty_logs_new` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `event_type` varchar(50) NOT NULL,
  `old_value` text DEFAULT NULL,
  `new_value` text DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_loyalty_event_type` (`event_type`),
  KEY `idx_loyalty_user` (`user_id`),
  KEY `idx_loyalty_order` (`order_id`),
  KEY `idx_loyalty_created` (`created_at`),
  CONSTRAINT `loyalty_logs_new_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_logs_new_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

INSERT INTO `loyalty_logs_new` (
  `id`,
  `user_id`,
  `order_id`,
  `event_type`,
  `old_value`,
  `new_value`,
  `metadata`,
  `created_at`
)
SELECT
  CAST(`id` AS SIGNED),
  `user_id`,
  `order_id`,
  `event_type`,
  NULL,
  NULL,
  JSON_OBJECT(
    'message', `message`,
    'details', `details`,
    'severity', `severity`,
    'transaction_id', `transaction_id`
  ),
  `created_at`
FROM `loyalty_logs`;

DROP TABLE `loyalty_logs`;
RENAME TABLE `loyalty_logs_new` TO `loyalty_logs`;

-- Пересоздаем транзакции лояльности
CREATE TABLE `loyalty_transactions_new` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` enum('earn','spend','expire','registration','birthday','adjustment') NOT NULL,
  `status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'completed',
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `remaining_amount` decimal(10,2) DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `related_transaction_id` int DEFAULT NULL,
  `description` text DEFAULT NULL,
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
  CONSTRAINT `loyalty_transactions_new_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loyalty_transactions_new_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_transactions_new_ibfk_3` FOREIGN KEY (`related_transaction_id`) REFERENCES `loyalty_transactions_new` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loyalty_transactions_new_ibfk_4` FOREIGN KEY (`admin_id`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

INSERT INTO `loyalty_transactions_new` (
  `id`,
  `user_id`,
  `type`,
  `status`,
  `amount`,
  `remaining_amount`,
  `order_id`,
  `related_transaction_id`,
  `description`,
  `expires_at`,
  `admin_id`,
  `created_at`,
  `updated_at`
)
SELECT
  CAST(`id` AS SIGNED),
  `user_id`,
  CASE `type`
    WHEN 'register_bonus' THEN 'registration'
    WHEN 'birthday_bonus' THEN 'birthday'
    WHEN 'refund_earn' THEN 'adjustment'
    WHEN 'refund_spend' THEN 'adjustment'
    ELSE `type`
  END,
  `status`,
  CAST(`amount` AS DECIMAL(10,2)),
  CASE
    WHEN `type` IN ('earn','register_bonus','birthday_bonus') AND `status` = 'completed' THEN CAST(`amount` AS DECIMAL(10,2))
    ELSE NULL
  END,
  `order_id`,
  `cancels_transaction_id`,
  TRIM(CONCAT_WS(' | ', `description`, IF(`metadata` IS NULL, NULL, CAST(`metadata` AS CHAR)))),
  `expires_at`,
  NULL,
  `created_at`,
  `updated_at`
FROM `loyalty_transactions`;

DROP TABLE `loyalty_transactions`;
RENAME TABLE `loyalty_transactions_new` TO `loyalty_transactions`;

-- Пересоздаем историю уровней лояльности
CREATE TABLE `user_loyalty_levels_new` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `loyalty_level_id` int NOT NULL,
  `previous_level_id` int DEFAULT NULL,
  `reason` varchar(255) NOT NULL,
  `threshold_sum` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  CONSTRAINT `user_loyalty_levels_new_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_loyalty_levels_new_ibfk_2` FOREIGN KEY (`loyalty_level_id`) REFERENCES `loyalty_levels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `user_loyalty_levels_new_ibfk_3` FOREIGN KEY (`previous_level_id`) REFERENCES `loyalty_levels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

INSERT INTO `user_loyalty_levels_new` (
  `id`,
  `user_id`,
  `loyalty_level_id`,
  `previous_level_id`,
  `reason`,
  `threshold_sum`,
  `created_at`
)
SELECT
  CAST(`id` AS SIGNED),
  `user_id`,
  `level_id`,
  NULL,
  `reason`,
  CAST(`total_spent_amount` AS DECIMAL(10,2)),
  `started_at`
FROM `user_loyalty_levels`;

DROP TABLE `user_loyalty_levels`;
RENAME TABLE `user_loyalty_levels_new` TO `user_loyalty_levels`;

SET FOREIGN_KEY_CHECKS = 1;
