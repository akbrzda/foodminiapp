-- Упрощение системы лояльности согласно docs/bonus.md

START TRANSACTION;

-- Удаляем старые типы транзакций
DELETE FROM loyalty_transactions WHERE type IN ('refund', 'cancel_earn');

-- Нормализуем суммы (списания должны быть положительными)
UPDATE loyalty_transactions SET amount = ABS(amount) WHERE amount < 0;

-- Обновляем структуру loyalty_transactions
ALTER TABLE loyalty_transactions
  ADD COLUMN expires_at DATETIME NULL AFTER amount,
  MODIFY COLUMN type ENUM('earn', 'spend') NOT NULL,
  DROP COLUMN balance_before,
  DROP COLUMN balance_after,
  DROP COLUMN description;

ALTER TABLE loyalty_transactions
  DROP INDEX idx_loyalty_user,
  DROP INDEX idx_loyalty_order,
  DROP INDEX idx_loyalty_type,
  ADD INDEX idx_loyalty_user_created (user_id, created_at),
  ADD INDEX idx_loyalty_order (order_id),
  ADD INDEX idx_loyalty_expires (expires_at);

-- Заполняем дату истечения для начислений
UPDATE loyalty_transactions
SET expires_at = DATE_ADD(created_at, INTERVAL 60 DAY)
WHERE type = 'earn' AND expires_at IS NULL;

-- Удаляем избыточные поля в заказах
ALTER TABLE orders
  DROP COLUMN bonus_earned,
  DROP COLUMN bonus_earn_transaction_id,
  DROP COLUMN bonus_spend_transaction_id;

-- Обновляем дефолтные настройки лояльности
INSERT INTO system_settings (`key`, value, description)
VALUES
  ('bonus_max_redeem_percent', CAST('0.3' AS JSON), 'Доля от суммы заказа, доступная к списанию бонусами'),
  ('loyalty_level_1_rate', CAST('0.03' AS JSON), 'Начисление бонусов для уровня Бронза'),
  ('loyalty_level_2_rate', CAST('0.05' AS JSON), 'Начисление бонусов для уровня Серебро'),
  ('loyalty_level_3_rate', CAST('0.07' AS JSON), 'Начисление бонусов для уровня Золото'),
  ('loyalty_level_2_threshold', CAST('10000' AS JSON), 'Сумма заказов для перехода на Серебро'),
  ('loyalty_level_3_threshold', CAST('20000' AS JSON), 'Сумма заказов для перехода на Золото')
ON DUPLICATE KEY UPDATE
  value = VALUES(value),
  description = VALUES(description);

-- Пересчитываем балансы (по формуле из документации)
UPDATE users u
SET u.bonus_balance = (
  SELECT COALESCE(SUM(CASE WHEN lt.type = 'earn' AND lt.expires_at > NOW() THEN lt.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN lt.type = 'spend' THEN lt.amount ELSE 0 END), 0)
  FROM loyalty_transactions lt
  WHERE lt.user_id = u.id
);

COMMIT;
