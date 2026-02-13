SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'item_variants'
    AND COLUMN_NAME = 'image_url'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE item_variants ADD COLUMN image_url VARCHAR(500) NULL COMMENT ''Фото конкретной вариации'' AFTER carbs_per_serving',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
