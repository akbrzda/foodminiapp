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
