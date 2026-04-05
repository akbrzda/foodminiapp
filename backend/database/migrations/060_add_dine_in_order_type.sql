ALTER TABLE orders
  MODIFY COLUMN order_type ENUM('delivery','pickup','dine_in') COLLATE utf8mb4_unicode_ci NOT NULL;
