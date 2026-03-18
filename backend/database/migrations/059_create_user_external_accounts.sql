CREATE TABLE IF NOT EXISTS `user_external_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `platform` enum('telegram','max') NOT NULL,
  `external_id` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_external_accounts_platform_external_id` (`platform`,`external_id`),
  KEY `idx_user_external_accounts_user_id` (`user_id`),
  CONSTRAINT `fk_user_external_accounts_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `user_external_accounts` (`user_id`, `platform`, `external_id`)
SELECT `id`, 'telegram', CAST(`telegram_id` AS CHAR)
FROM `users`
WHERE `telegram_id` IS NOT NULL
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);

