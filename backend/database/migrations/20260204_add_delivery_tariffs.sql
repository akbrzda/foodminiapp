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
