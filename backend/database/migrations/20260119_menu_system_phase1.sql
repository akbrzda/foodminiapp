-- =====================================================
-- Миграция: Система управления меню - Фаза 1
-- Дата: 2026-01-19
-- Описание: Добавление новых таблиц и полей согласно документации menu.md
-- =====================================================

-- ====================
-- 1. Новые таблицы
-- ====================

-- Таблица тегов для блюд
CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50) COMMENT 'Иконка или эмодзи для тега',
    color VARCHAR(20) COMMENT 'Цвет тега для отображения',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Теги для фильтрации и поиска блюд';

-- Связь блюд с тегами (many-to-many)
CREATE TABLE IF NOT EXISTS menu_item_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    tag_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_tag (item_id, tag_id),
    INDEX idx_item (item_id),
    INDEX idx_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Связь блюд с тегами';

-- Связь блюд с несколькими категориями (many-to-many)
CREATE TABLE IF NOT EXISTS menu_item_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    category_id INT NOT NULL,
    sort_order INT DEFAULT 0 COMMENT 'Порядок отображения блюда в категории',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_category (item_id, category_id),
    INDEX idx_item (item_id),
    INDEX idx_category (category_id),
    INDEX idx_category_sort (category_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Связь блюд с несколькими категориями';

-- Управление доступностью категорий по городам
CREATE TABLE IF NOT EXISTS menu_category_cities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    city_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Включена ли категория для данного города',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE KEY unique_category_city (category_id, city_id),
    INDEX idx_category (category_id),
    INDEX idx_city (city_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Доступность категорий по городам';

-- Управление доступностью блюд по городам
CREATE TABLE IF NOT EXISTS menu_item_cities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    city_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Включено ли блюдо для данного города',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_city (item_id, city_id),
    INDEX idx_item (item_id),
    INDEX idx_city (city_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Доступность блюд по городам';

-- Цены блюд по городам и способам получения
CREATE TABLE IF NOT EXISTS menu_item_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    city_id INT NULL COMMENT 'NULL = цена для всех городов',
    fulfillment_type ENUM('delivery', 'pickup', 'dine_in') NOT NULL COMMENT 'Способ получения: доставка, самовывоз, зал',
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_city_fulfillment (item_id, city_id, fulfillment_type),
    INDEX idx_item (item_id),
    INDEX idx_city (city_id),
    INDEX idx_fulfillment (fulfillment_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены блюд по городам и способам получения';

-- Цены вариаций по городам и способам получения
CREATE TABLE IF NOT EXISTS menu_variant_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    variant_id INT NOT NULL,
    city_id INT NULL COMMENT 'NULL = цена для всех городов',
    fulfillment_type ENUM('delivery', 'pickup', 'dine_in') NOT NULL COMMENT 'Способ получения: доставка, самовывоз, зал',
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE KEY unique_variant_city_fulfillment (variant_id, city_id, fulfillment_type),
    INDEX idx_variant (variant_id),
    INDEX idx_city (city_id),
    INDEX idx_fulfillment (fulfillment_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены вариаций по городам и способам получения';

-- Цены модификаторов в зависимости от выбранной вариации
CREATE TABLE IF NOT EXISTS menu_modifier_variant_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modifier_id INT NOT NULL,
    variant_id INT NOT NULL COMMENT 'Вариация, для которой действует данная цена модификатора',
    price DECIMAL(10, 2) NOT NULL,
    weight DECIMAL(10, 2) NULL COMMENT 'Вес модификатора для данной вариации',
    weight_unit ENUM('g', 'kg', 'ml', 'l', 'pcs') NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (modifier_id) REFERENCES modifiers(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE,
    UNIQUE KEY unique_modifier_variant (modifier_id, variant_id),
    INDEX idx_modifier (modifier_id),
    INDEX idx_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Цены модификаторов для разных вариаций';

-- Стоп-лист по филиалам
CREATE TABLE IF NOT EXISTS menu_stop_list (
    id INT AUTO_INCREMENT PRIMARY KEY,
    branch_id INT NOT NULL,
    entity_type ENUM('item', 'variant', 'modifier') NOT NULL COMMENT 'Тип сущности: блюдо, вариация, модификатор',
    entity_id INT NOT NULL COMMENT 'ID блюда, вариации или модификатора',
    reason TEXT NULL COMMENT 'Причина добавления в стоп-лист',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL COMMENT 'ID администратора, добавившего в стоп-лист',
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_branch_entity (branch_id, entity_type, entity_id),
    INDEX idx_branch (branch_id),
    INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Стоп-лист позиций по филиалам';

-- Отключенные модификаторы в глобальных группах для конкретных блюд
CREATE TABLE IF NOT EXISTS menu_item_disabled_modifiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    modifier_id INT NOT NULL COMMENT 'Модификатор из глобальной группы, который отключен для данного блюда',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_id) REFERENCES modifiers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_item_modifier (item_id, modifier_id),
    INDEX idx_item (item_id),
    INDEX idx_modifier (modifier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Отключенные модификаторы из глобальных групп';

-- ====================
-- 2. Изменения существующих таблиц
-- ====================

-- Добавляем поле composition (состав блюда) в menu_items, если его нет
SET @tablename = 'menu_items';
SET @columnname = 'composition';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TEXT AFTER description')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Добавляем поля КБЖУ в menu_items
SET @columnname = 'calories_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Калории на 100г'' AFTER weight_unit')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'proteins_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Белки на 100г'' AFTER calories_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'fats_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Жиры на 100г'' AFTER proteins_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'carbs_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Углеводы на 100г'' AFTER fats_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'calories_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Калории на порцию'' AFTER carbs_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'proteins_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Белки на порцию'' AFTER calories_per_serving')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'fats_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Жиры на порцию'' AFTER proteins_per_serving')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'carbs_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Углеводы на порцию'' AFTER fats_per_serving')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Добавляем поля КБЖУ в item_variants
SET @tablename = 'item_variants';

SET @columnname = 'calories_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Калории на 100г'' AFTER weight_unit')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'proteins_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Белки на 100г'' AFTER calories_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'fats_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Жиры на 100г'' AFTER proteins_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'carbs_per_100g';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Углеводы на 100г'' AFTER fats_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'calories_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Калории на порцию'' AFTER carbs_per_100g')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'proteins_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Белки на порцию'' AFTER calories_per_serving')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'fats_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Жиры на порцию'' AFTER proteins_per_serving')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'carbs_per_serving';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Углеводы на порцию'' AFTER fats_per_serving')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Добавляем поля в modifiers (вес, единицу измерения, фото)
SET @tablename = 'modifiers';

SET @columnname = 'weight';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10, 2) NULL COMMENT ''Вес модификатора'' AFTER price')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'weight_unit';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' ENUM(''g'', ''kg'', ''ml'', ''l'', ''pcs'') NULL COMMENT ''Единица измерения веса'' AFTER weight')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'image_url';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(500) NULL COMMENT ''URL изображения модификатора'' AFTER weight_unit')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Добавляем поля в modifier_groups (глобальность, мин/макс выборов)
SET @tablename = 'modifier_groups';

SET @columnname = 'is_global';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' BOOLEAN DEFAULT FALSE COMMENT ''Глобальная группа (переиспользуемая)'' AFTER is_required')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'min_selections';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT DEFAULT 0 COMMENT ''Минимальное количество выборов'' AFTER is_global')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'max_selections';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = DATABASE())
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT DEFAULT 1 COMMENT ''Максимальное количество выборов'' AFTER min_selections')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ====================
-- Миграция завершена
-- ====================
