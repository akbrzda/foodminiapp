-- Миграция: Добавление полей для защиты от дублирования начислений
-- Дата: 24.01.2026
-- Описание: Добавление bonus_earn_amount и bonus_earn_locked в таблицу orders
--           для фиксации суммы начисления и защиты от race conditions

ALTER TABLE orders 
  ADD COLUMN bonus_earn_amount DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Зафиксированная сумма начисления при первом delivered',
  ADD COLUMN bonus_earn_locked BOOLEAN DEFAULT FALSE COMMENT 'Флаг блокировки для защиты от дублирования начислений';

-- Добавляем индекс для оптимизации проверок блокировки
ALTER TABLE orders 
  ADD INDEX idx_bonus_earn_locked (bonus_earn_locked);

-- Логирование выполнения миграции
INSERT INTO loyalty_logs (event_type, severity, message, details, created_at)
VALUES ('cron_execution', 'info', 'Миграция: Добавлены поля bonus_earn_amount и bonus_earn_locked в orders', 
        JSON_OBJECT('migration', '20260124_add_bonus_earn_fields'), NOW());
