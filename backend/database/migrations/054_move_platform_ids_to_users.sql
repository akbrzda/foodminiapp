SET @has_max_id_column := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'max_id'
);
SET @sql := IF(
  @has_max_id_column = 0,
  'ALTER TABLE users ADD COLUMN max_id BIGINT DEFAULT NULL AFTER telegram_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_max_id_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'uq_users_max_id'
);
SET @sql := IF(
  @has_max_id_unique = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_max_id (max_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_max_id_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'idx_users_max_id'
);
SET @sql := IF(
  @has_max_id_index = 0,
  'ALTER TABLE users ADD KEY idx_users_max_id (max_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_external_accounts_table := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'user_external_accounts'
);

SET @sql := IF(
  @has_external_accounts_table > 0,
  "UPDATE users u
   JOIN user_external_accounts uea ON uea.user_id = u.id
   SET u.telegram_id = CAST(uea.external_id AS UNSIGNED)
   WHERE uea.platform = 'telegram'
     AND (u.telegram_id IS NULL OR u.telegram_id = 0)
     AND uea.external_id REGEXP '^[0-9]+$'",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_external_accounts_table > 0,
  "UPDATE users u
   JOIN user_external_accounts uea ON uea.user_id = u.id
   SET u.max_id = CAST(uea.external_id AS UNSIGNED)
   WHERE uea.platform = 'max'
     AND (u.max_id IS NULL OR u.max_id = 0)
     AND uea.external_id REGEXP '^[0-9]+$'",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS user_external_accounts;
