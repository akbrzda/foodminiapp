-- Миграция: Создание таблицы исключений для списания бонусов
-- Дата: 24.01.2026
-- Описание: Добавление таблицы loyalty_exclusions для управления категориями и товарами,
--           которые исключены из списания бонусов

-- Создаем таблицу исключений
CREATE TABLE IF NOT EXISTS loyalty_exclusions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('category', 'product') NOT NULL COMMENT 'Тип исключения: категория или товар',
    entity_id INT NOT NULL COMMENT 'ID категории или товара',
    reason VARCHAR(255) NULL COMMENT 'Причина добавления в исключения',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL COMMENT 'ID администратора, создавшего исключение',
    
    UNIQUE KEY unique_exclusion (type, entity_id),
    INDEX idx_type_entity (type, entity_id),
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Логирование выполнения миграции
INSERT INTO loyalty_logs (event_type, severity, message, details, created_at)
VALUES ('cron_execution', 'info', 'Миграция: Создана таблица loyalty_exclusions', 
        JSON_OBJECT('migration', '20260124_loyalty_exclusions'), NOW());
