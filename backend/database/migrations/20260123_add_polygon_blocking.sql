-- Миграция: добавление функционала блокировки полигонов
-- Дата: 2026-01-23
-- Добавляем поля для управления блокировкой полигонов
ALTER TABLE delivery_polygons
ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE COMMENT 'Блокировка полигона (постоянная или временная)',
ADD COLUMN blocked_from DATETIME NULL COMMENT 'Начало периода блокировки (для временной блокировки)',
ADD COLUMN blocked_until DATETIME NULL COMMENT 'Конец периода блокировки (для временной блокировки)',
ADD COLUMN block_reason VARCHAR(500) NULL COMMENT 'Причина блокировки',
ADD COLUMN blocked_by INT NULL COMMENT 'ID пользователя, который заблокировал',
ADD COLUMN blocked_at TIMESTAMP NULL COMMENT 'Время блокировки',
ADD INDEX idx_blocked (is_blocked, blocked_from, blocked_until);
-- Добавляем внешний ключ для blocked_by
ALTER TABLE delivery_polygons
ADD CONSTRAINT fk_polygon_blocked_by 
FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE SET NULL;
