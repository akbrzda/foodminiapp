CREATE TABLE IF NOT EXISTS `order_number_sequence` (
  `id` int NOT NULL,
  `last_number` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `order_number_sequence` (`id`, `last_number`)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE last_number = last_number;

ALTER TABLE `orders` DROP INDEX `order_number`;
