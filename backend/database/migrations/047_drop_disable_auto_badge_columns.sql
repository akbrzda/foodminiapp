SET @db_name = DATABASE();

SET @has_is_new = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'is_new'
);
SET @sql = IF(
  @has_is_new = 1,
  'ALTER TABLE menu_items MODIFY COLUMN is_new TINYINT(1) DEFAULT NULL COMMENT \"Бейдж: Новинка (NULL = авто-режим)\"',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE menu_items
SET is_new = NULL
WHERE is_new = 0;

UPDATE menu_items
SET is_hit = NULL
WHERE is_hit = 0;

SET @has_is_hit = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'is_hit'
);
SET @sql = IF(
  @has_is_hit = 1,
  'ALTER TABLE menu_items MODIFY COLUMN is_hit TINYINT(1) DEFAULT NULL COMMENT \"Бейдж: Хит (NULL = авто-режим)\"',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_disable_auto_hit = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'disable_auto_hit'
);
SET @sql = IF(
  @has_disable_auto_hit = 1,
  'ALTER TABLE menu_items DROP COLUMN disable_auto_hit',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_disable_auto_new = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'disable_auto_new'
);
SET @sql = IF(
  @has_disable_auto_new = 1,
  'ALTER TABLE menu_items DROP COLUMN disable_auto_new',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
