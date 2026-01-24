-- Удаление дублирующих настроек уровней из loyalty_settings
-- Теперь все настройки уровней управляются через таблицу loyalty_levels

-- Проверяем существование колонок перед удалением
SET @dbname = DATABASE();
SET @tablename = 'loyalty_settings';

-- Удаляем каждую колонку отдельно
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'bonus_max_redeem_percent');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN bonus_max_redeem_percent', 'SELECT "Column bonus_max_redeem_percent does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_1_name');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_1_name', 'SELECT "Column loyalty_level_1_name does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_2_name');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_2_name', 'SELECT "Column loyalty_level_2_name does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_3_name');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_3_name', 'SELECT "Column loyalty_level_3_name does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_1_rate');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_1_rate', 'SELECT "Column loyalty_level_1_rate does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_2_rate');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_2_rate', 'SELECT "Column loyalty_level_2_rate does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_3_rate');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_3_rate', 'SELECT "Column loyalty_level_3_rate does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_1_redeem_percent');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_1_redeem_percent', 'SELECT "Column loyalty_level_1_redeem_percent does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_2_redeem_percent');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_2_redeem_percent', 'SELECT "Column loyalty_level_2_redeem_percent does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_3_redeem_percent');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_3_redeem_percent', 'SELECT "Column loyalty_level_3_redeem_percent does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_2_threshold');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_2_threshold', 'SELECT "Column loyalty_level_2_threshold does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'loyalty_level_3_threshold');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN loyalty_level_3_threshold', 'SELECT "Column loyalty_level_3_threshold does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
