-- Удаление настройки level_calculation_include_delivery
-- Доставка теперь НЕ учитывается в сумме заказов для определения уровня лояльности

-- Проверяем существование колонки перед удалением
SET @dbname = DATABASE();
SET @tablename = 'loyalty_settings';

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'level_calculation_include_delivery');
SET @sqlstmt = IF(@col_exists > 0, 'ALTER TABLE loyalty_settings DROP COLUMN level_calculation_include_delivery', 'SELECT "Column level_calculation_include_delivery does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
