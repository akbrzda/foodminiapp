-- ============================================
-- Схема базы данных Miniapp Panda
-- Версия: 2.0
-- Обновлено: Добавлены варианты позиций, группы модификаторов, поля программы лояльности
-- ============================================

-- Таблица пользователей (клиентов)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    phone VARCHAR(20) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100),
    date_of_birth DATE,
    bonus_balance DECIMAL(10, 2) DEFAULT 0.00,
    loyalty_level INT DEFAULT 1 COMMENT '1=Бронза, 2=Серебро, 3=Золото',
    total_spent DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Общая сумма всех заказов для расчета уровня лояльности',
    gulyash_client_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_phone (phone),
    INDEX idx_telegram_id (telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица городов
CREATE TABLE IF NOT EXISTS cities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_city_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица филиалов (ресторанов)
CREATE TABLE IF NOT EXISTS branches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    city_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    working_hours JSON,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_branch_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    INDEX idx_city_active (city_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица адресов доставки
CREATE TABLE IF NOT EXISTS delivery_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    city_id INT NOT NULL,
    street VARCHAR(200) NOT NULL,
    house VARCHAR(20) NOT NULL,
    entrance VARCHAR(10),
    apartment VARCHAR(10),
    intercom VARCHAR(50),
    comment TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Состояние пользователя (синхронизация между устройствами)
CREATE TABLE IF NOT EXISTS user_states (
    user_id INT PRIMARY KEY,
    selected_city_id INT,
    selected_branch_id INT,
    delivery_type VARCHAR(20) DEFAULT 'delivery',
    delivery_address TEXT,
    delivery_coords JSON,
    delivery_details JSON,
    cart JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (selected_city_id) REFERENCES cities(id) ON DELETE SET NULL,
    FOREIGN KEY (selected_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
    INDEX idx_user_state_city (selected_city_id),
    INDEX idx_user_state_branch (selected_branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица полигонов доставки (зоны)
CREATE TABLE IF NOT EXISTS delivery_polygons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    branch_id INT NOT NULL,
    name VARCHAR(100),
    polygon POLYGON NOT NULL,
    delivery_time_min INT DEFAULT 30,
    delivery_time_max INT DEFAULT 60,
    min_order_amount DECIMAL(10, 2) DEFAULT 0.00,
    delivery_cost DECIMAL(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_polygon_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    SPATIAL INDEX idx_polygon (polygon),
    INDEX idx_branch_active (branch_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица категорий меню
CREATE TABLE IF NOT EXISTS menu_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    city_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_category_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    INDEX idx_city_active_sort (city_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица позиций меню
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Базовая цена (используется если нет вариантов)',
    image_url VARCHAR(500),
    weight VARCHAR(50),
    calories INT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_item_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE,
    INDEX idx_category_active_sort (category_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица вариантов позиций (например: Маленькая/Средняя/Большая пицца)
CREATE TABLE IF NOT EXISTS item_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    name VARCHAR(100) NOT NULL COMMENT 'Название варианта (например: "Маленькая (25см)")',
    price DECIMAL(10, 2) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    INDEX idx_item_active_sort (item_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица групп модификаторов
CREATE TABLE IF NOT EXISTS modifier_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL COMMENT 'Название группы (например: "Уровень прожарки")',
    type ENUM('single', 'multiple') NOT NULL DEFAULT 'single' COMMENT 'Одиночный или множественный выбор',
    is_required BOOLEAN DEFAULT FALSE COMMENT 'Обязательность выбора модификатора из группы',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица модификаторов (привязаны к группам)
CREATE TABLE IF NOT EXISTS modifiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_modifier_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
    INDEX idx_group_active_sort (group_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица связи позиций меню и групп модификаторов
CREATE TABLE IF NOT EXISTS item_modifier_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    modifier_group_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_modifier_group (item_id, modifier_group_id),
    INDEX idx_item_id (item_id),
    INDEX idx_modifier_group_id (modifier_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица модификаторов (старая, для обратной совместимости - можно удалить после миграции)
CREATE TABLE IF NOT EXISTS menu_modifiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    is_required BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_modifier_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    INDEX idx_item_active (item_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица заказов
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(4) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    city_id INT NOT NULL,
    branch_id INT,
    order_type ENUM('delivery', 'pickup') NOT NULL,
    status ENUM('pending', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled') DEFAULT 'pending',
    
    -- Адрес доставки (для доставки)
    delivery_address_id INT,
    delivery_street VARCHAR(200),
    delivery_house VARCHAR(20),
    delivery_entrance VARCHAR(10),
    delivery_apartment VARCHAR(10),
    delivery_intercom VARCHAR(50),
    delivery_comment TEXT,
    
    -- Оплата
    payment_method ENUM('cash', 'card') NOT NULL,
    change_from DECIMAL(10, 2),
    
    -- Суммы
    subtotal DECIMAL(10, 2) NOT NULL,
    delivery_cost DECIMAL(10, 2) DEFAULT 0.00,
    bonus_used DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL,
    
    -- Комментарий
    comment TEXT,
    
    -- Время
    desired_time DATETIME,
    completed_at DATETIME,
    
    -- Синхронизация
    gulyash_order_id VARCHAR(100),
    sync_status ENUM('pending', 'synced', 'failed') DEFAULT 'pending',
    sync_attempts INT DEFAULT 0,
    sync_error TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
    FOREIGN KEY (delivery_address_id) REFERENCES delivery_addresses(id) ON DELETE SET NULL,
    
    INDEX idx_user_id (user_id),
    INDEX idx_order_number (order_number),
    INDEX idx_status (status),
    INDEX idx_sync_status (sync_status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица элементов заказа
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    item_id INT,
    variant_id INT COMMENT 'ID варианта позиции (если выбран вариант)',
    item_name VARCHAR(200) NOT NULL,
    variant_name VARCHAR(100) COMMENT 'Название варианта для истории заказа',
    item_price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE SET NULL,
    FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE SET NULL,
    INDEX idx_order_id (order_id),
    INDEX idx_variant_id (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица модификаторов в заказе
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_item_id INT NOT NULL,
    modifier_id INT COMMENT 'ID модификатора из таблицы modifiers (новая система)',
    old_modifier_id INT COMMENT 'ID модификатора из таблицы menu_modifiers (старая система, для обратной совместимости)',
    modifier_group_id INT COMMENT 'ID группы модификаторов',
    modifier_name VARCHAR(200) NOT NULL,
    modifier_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_id) REFERENCES modifiers(id) ON DELETE SET NULL,
    FOREIGN KEY (old_modifier_id) REFERENCES menu_modifiers(id) ON DELETE SET NULL,
    FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE SET NULL,
    INDEX idx_order_item_id (order_item_id),
    INDEX idx_modifier_id (modifier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица истории бонусов
CREATE TABLE IF NOT EXISTS bonus_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_id INT,
    type ENUM('earned', 'used', 'expired', 'manual') NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(10, 2) NOT NULL,
    description TEXT,
    gulyash_transaction_id VARCHAR(100),
    sync_status ENUM('pending', 'synced', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_sync_status (sync_status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица администраторов/менеджеров
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'manager', 'seo') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    telegram_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица связи менеджеров с городами
CREATE TABLE IF NOT EXISTS admin_user_cities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_user_id INT NOT NULL,
    city_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE KEY unique_admin_city (admin_user_id, city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица очереди синхронизации
CREATE TABLE IF NOT EXISTS sync_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('order', 'client', 'bonus') NOT NULL,
    entity_id INT NOT NULL,
    action ENUM('create', 'update', 'delete') NOT NULL,
    payload JSON,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    last_error TEXT,
    next_retry_at DATETIME,
    completed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status_next_retry (status, next_retry_at),
    INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица логов действий администраторов
CREATE TABLE IF NOT EXISTS admin_action_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    description TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    INDEX idx_admin_user_id (admin_user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица системных логов
CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level ENUM('info', 'warning', 'error', 'critical') NOT NULL,
    category VARCHAR(50),
    message TEXT NOT NULL,
    context JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_level_created (level, created_at),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ============================================
-- Migration: 002_add_variants_and_modifier_groups.sql
-- Executed: 2026-01-14T18:53:54.920Z
-- ============================================

SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'loyalty_level';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT DEFAULT 1 COMMENT ''1=Бронза, 2=Серебро, 3=Золото'' AFTER bonus_balance')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


SET @columnname = 'total_spent';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) DEFAULT 0.00 COMMENT ''Общая сумма всех заказов для расчета уровня лояльности'' AFTER loyalty_level')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


ALTER TABLE menu_items 
MODIFY COLUMN price DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Базовая цена (используется если нет вариантов)';


CREATE TABLE IF NOT EXISTS item_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    name VARCHAR(100) NOT NULL COMMENT 'Название варианта (например: "Маленькая (25см)")',
    price DECIMAL(10, 2) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    INDEX idx_item_active_sort (item_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


CREATE TABLE IF NOT EXISTS modifier_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL COMMENT 'Название группы (например: "Уровень прожарки")',
    type ENUM('single', 'multiple') NOT NULL DEFAULT 'single' COMMENT 'Одиночный или множественный выбор',
    is_required BOOLEAN DEFAULT FALSE COMMENT 'Обязательность выбора модификатора из группы',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


CREATE TABLE IF NOT EXISTS modifiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    gulyash_modifier_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
    INDEX idx_group_active_sort (group_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


CREATE TABLE IF NOT EXISTS item_modifier_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    modifier_group_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_modifier_group (item_id, modifier_group_id),
    INDEX idx_item_id (item_id),
    INDEX idx_modifier_group_id (modifier_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


SET @tablename = 'order_items';
SET @columnname = 'variant_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT COMMENT ''ID варианта позиции (если выбран вариант)'' AFTER item_id')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'variant_name';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(100) COMMENT ''Название варианта для истории заказа'' AFTER item_name')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


SET @indexname = 'idx_variant_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (INDEX_NAME = @indexname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD INDEX ', @indexname, ' (variant_id)')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


SET @constraintname = 'fk_order_items_variant';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (CONSTRAINT_NAME = @constraintname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @constraintname, ' FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE SET NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


SET @tablename = 'order_item_modifiers';


SET @columnname = 'old_modifier_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT COMMENT ''ID модификатора из таблицы menu_modifiers (старая система, для обратной совместимости)'' AFTER modifier_id')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


SET @columnname = 'modifier_group_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT COMMENT ''ID группы модификаторов'' AFTER modifier_id')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


UPDATE order_item_modifiers 
SET old_modifier_id = modifier_id 
WHERE modifier_id IS NOT NULL AND old_modifier_id IS NULL;


SET @indexname = 'idx_modifier_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (INDEX_NAME = @indexname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD INDEX ', @indexname, ' (modifier_id)')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


SET @constraintname = 'fk_order_item_modifiers_modifier';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (CONSTRAINT_NAME = @constraintname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @constraintname, ' FOREIGN KEY (modifier_id) REFERENCES modifiers(id) ON DELETE SET NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @constraintname = 'fk_order_item_modifiers_group';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE
      (TABLE_SCHEMA = DATABASE())
      AND (TABLE_NAME = @tablename)
      AND (CONSTRAINT_NAME = @constraintname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @constraintname, ' FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE SET NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


-- ============================================
-- Migration: 01_seed_cities.sql
-- Executed: 2026-01-14T18:59:57.555Z
-- ============================================

SET NAMES utf8;
SET CHARACTER SET utf8;


DELETE FROM branches;
DELETE FROM cities;


INSERT INTO cities (name, latitude, longitude, is_active, gulyash_city_id) VALUES
('Когалым', 62.2667, 74.4833, TRUE, NULL),
('Москва', 55.7558, 37.6173, TRUE, NULL),
('Пенза', 53.2001, 45.0047, TRUE, NULL);


INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active, gulyash_branch_id) 
SELECT 
    c.id,
    'Улица Бакинская, 6А',
    'ул. Бакинская, 6А, Когалым',
    62.2680,
    74.4850,
    '+7 (34667) 1-23-45',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'tuesday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'wednesday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'thursday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'friday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'saturday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'sunday', JSON_OBJECT('open', '10:15', 'close', '22:30')
    ),
    TRUE,
    NULL
FROM cities c 
WHERE c.name = 'Когалым';


INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active) 
SELECT 
    c.id,
    'Шумкина',
    'ул. Шумкина, 20Б, Москва',
    55.7520,
    37.5897,
    '+7 (495) 123-45-67',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'tuesday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'wednesday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'thursday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'friday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'saturday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'sunday', JSON_OBJECT('open', '09:00', 'close', '23:00')
    ),
    TRUE
FROM cities c 
WHERE c.name = 'Москва';


INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active) 
SELECT 
    c.id,
    'Фурманова',
    'ул. Фурманова, 1, Пенза',
    53.2050,
    45.0100,
    '+7 (8412) 345-67-89',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'tuesday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'wednesday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'thursday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'friday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'saturday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'sunday', JSON_OBJECT('open', '10:00', 'close', '22:00')
    ),
    TRUE
FROM cities c 
WHERE c.name = 'Пенза';


-- ============================================
-- Migration: 02_seed_menu.sql
-- Executed: 2026-01-15T07:52:02.833Z
-- ============================================

SET @city_id = (SELECT id FROM cities LIMIT 1);


INSERT INTO cities (name, is_active)
SELECT 'Когалым', TRUE
WHERE NOT EXISTS (SELECT 1 FROM cities LIMIT 1);

SET @city_id = (SELECT id FROM cities LIMIT 1);


INSERT INTO menu_categories (city_id, name, description, sort_order, is_active) VALUES
(@city_id, 'Пицца', 'Классическая итальянская пицца', 1, TRUE),
(@city_id, 'Бургеры', 'Сочные бургеры с мясом', 2, TRUE),
(@city_id, 'Напитки', 'Холодные и горячие напитки', 3, TRUE),
(@city_id, 'Стейки', 'Мясные стейки на любой вкус', 4, TRUE)
ON DUPLICATE KEY UPDATE name=name;

SET @pizza_category = (SELECT id FROM menu_categories WHERE name = 'Пицца' AND city_id = @city_id LIMIT 1);
SET @burger_category = (SELECT id FROM menu_categories WHERE name = 'Бургеры' AND city_id = @city_id LIMIT 1);
SET @drinks_category = (SELECT id FROM menu_categories WHERE name = 'Напитки' AND city_id = @city_id LIMIT 1);
SET @steak_category = (SELECT id FROM menu_categories WHERE name = 'Стейки' AND city_id = @city_id LIMIT 1);


INSERT INTO modifier_groups (name, type, is_required, is_active) VALUES
('Размер пиццы', 'single', FALSE, TRUE),
('Дополнительные ингредиенты', 'multiple', FALSE, TRUE),
('Уровень прожарки', 'single', TRUE, TRUE),
('Соусы', 'multiple', FALSE, TRUE),
('Размер порции', 'single', FALSE, TRUE)
ON DUPLICATE KEY UPDATE name=name;

SET @size_group = (SELECT id FROM modifier_groups WHERE name = 'Размер пиццы' LIMIT 1);
SET @ingredients_group = (SELECT id FROM modifier_groups WHERE name = 'Дополнительные ингредиенты' LIMIT 1);
SET @doneness_group = (SELECT id FROM modifier_groups WHERE name = 'Уровень прожарки' LIMIT 1);
SET @sauce_group = (SELECT id FROM modifier_groups WHERE name = 'Соусы' LIMIT 1);
SET @portion_group = (SELECT id FROM modifier_groups WHERE name = 'Размер порции' LIMIT 1);


INSERT INTO modifiers (group_id, name, price, sort_order, is_active) VALUES

(@ingredients_group, 'Дополнительный сыр', 50.00, 1, TRUE),
(@ingredients_group, 'Бекон', 60.00, 2, TRUE),
(@ingredients_group, 'Грибы', 40.00, 3, TRUE),
(@ingredients_group, 'Оливки', 30.00, 4, TRUE),

(@doneness_group, 'Rare (с кровью)', 0.00, 1, TRUE),
(@doneness_group, 'Medium (средняя)', 0.00, 2, TRUE),
(@doneness_group, 'Well Done (прожаренная)', 0.00, 3, TRUE),

(@sauce_group, 'Кетчуп', 0.00, 1, TRUE),
(@sauce_group, 'Майонез', 0.00, 2, TRUE),
(@sauce_group, 'Чесночный соус', 20.00, 3, TRUE),
(@sauce_group, 'Барбекю', 20.00, 4, TRUE),

(@portion_group, 'Маленькая', 0.00, 1, TRUE),
(@portion_group, 'Средняя', 30.00, 2, TRUE),
(@portion_group, 'Большая', 60.00, 3, TRUE)
ON DUPLICATE KEY UPDATE name=name;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@pizza_category, 'Пицца Маргарита', 'Классическая пицца с томатами, моцареллой и базиликом', 0.00, 1, TRUE);

SET @margherita_id = LAST_INSERT_ID();


INSERT INTO item_variants (item_id, name, price, sort_order, is_active) VALUES
(@margherita_id, 'Маленькая (25см)', 450.00, 1, TRUE),
(@margherita_id, 'Средняя (30см)', 650.00, 2, TRUE),
(@margherita_id, 'Большая (35см)', 850.00, 3, TRUE);


INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES
(@margherita_id, @ingredients_group)
ON DUPLICATE KEY UPDATE item_id=item_id;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@pizza_category, 'Пицца Пепперони', 'Острая пицца с колбасой пепперони и сыром', 0.00, 2, TRUE);

SET @pepperoni_id = LAST_INSERT_ID();

INSERT INTO item_variants (item_id, name, price, sort_order, is_active) VALUES
(@pepperoni_id, 'Маленькая (25см)', 500.00, 1, TRUE),
(@pepperoni_id, 'Средняя (30см)', 700.00, 2, TRUE),
(@pepperoni_id, 'Большая (35см)', 900.00, 3, TRUE);

INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES
(@pepperoni_id, @ingredients_group)
ON DUPLICATE KEY UPDATE item_id=item_id;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@burger_category, 'Классический бургер', 'Бургер с говяжьей котлетой, овощами и соусом', 350.00, 1, TRUE);

SET @burger_id = LAST_INSERT_ID();

INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES
(@burger_id, @sauce_group),
(@burger_id, @ingredients_group)
ON DUPLICATE KEY UPDATE item_id=item_id;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@burger_category, 'Чизбургер', 'Бургер с двойной котлетой и сыром', 420.00, 2, TRUE);


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@steak_category, 'Стейк Рибай', 'Премиальный стейк из мраморной говядины', 1200.00, 1, TRUE);

SET @ribeye_id = LAST_INSERT_ID();

INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES
(@ribeye_id, @doneness_group),
(@ribeye_id, @sauce_group)
ON DUPLICATE KEY UPDATE item_id=item_id;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@steak_category, 'Стейк Филе-миньон', 'Нежный стейк из вырезки', 1500.00, 2, TRUE);

SET @filet_id = LAST_INSERT_ID();

INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES
(@filet_id, @doneness_group),
(@filet_id, @sauce_group)
ON DUPLICATE KEY UPDATE item_id=item_id;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@burger_category, 'Картофель фри', 'Хрустящий картофель фри', 0.00, 3, TRUE);

SET @fries_id = LAST_INSERT_ID();

INSERT INTO item_variants (item_id, name, price, sort_order, is_active) VALUES
(@fries_id, 'Маленькая порция', 150.00, 1, TRUE),
(@fries_id, 'Большая порция', 220.00, 2, TRUE);

INSERT INTO item_modifier_groups (item_id, modifier_group_id) VALUES
(@fries_id, @sauce_group)
ON DUPLICATE KEY UPDATE item_id=item_id;


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@drinks_category, 'Кола', 'Газированный напиток', 120.00, 1, TRUE);


INSERT INTO menu_items (category_id, name, description, price, sort_order, is_active) VALUES
(@drinks_category, 'Кофе', 'Ароматный кофе', 0.00, 2, TRUE);

SET @coffee_id = LAST_INSERT_ID();

INSERT INTO item_variants (item_id, name, price, sort_order, is_active) VALUES
(@coffee_id, 'Маленький (200мл)', 150.00, 1, TRUE),
(@coffee_id, 'Средний (300мл)', 180.00, 2, TRUE),
(@coffee_id, 'Большой (400мл)', 210.00, 3, TRUE);