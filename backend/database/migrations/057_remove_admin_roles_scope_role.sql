SET @has_scope_role := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'admin_roles'
    AND COLUMN_NAME = 'scope_role'
);

SET @drop_scope_role_sql := IF(
  @has_scope_role > 0,
  'ALTER TABLE admin_roles DROP COLUMN scope_role',
  'SELECT 1'
);

PREPARE stmt FROM @drop_scope_role_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
