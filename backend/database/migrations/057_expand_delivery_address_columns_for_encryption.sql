ALTER TABLE delivery_addresses
  MODIFY COLUMN street TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  MODIFY COLUMN house TEXT COLLATE utf8mb4_unicode_ci NOT NULL;
