-- Этап 2: миграция данных лояльности

-- Привязка текущих уровней пользователей к loyalty_levels
UPDATE users u
JOIN loyalty_levels l ON l.level_number = u.loyalty_level
SET u.current_loyalty_level_id = l.id
WHERE u.current_loyalty_level_id IS NULL;

-- Заполняем дату регистрации в программе
UPDATE users
SET loyalty_registered_at = created_at
WHERE loyalty_registered_at IS NULL;

-- Создаем стартовую историю уровней пользователей
INSERT INTO user_loyalty_levels (
  user_id,
  level_id,
  reason,
  triggered_by_order_id,
  total_spent_amount,
  started_at,
  ended_at
)
SELECT
  u.id,
  l.id,
  'initial',
  NULL,
  CAST(ROUND(u.total_spent) AS UNSIGNED),
  COALESCE(u.loyalty_registered_at, u.created_at),
  NULL
FROM users u
JOIN loyalty_levels l ON l.level_number = u.loyalty_level
LEFT JOIN user_loyalty_levels ul
  ON ul.user_id = u.id AND ul.ended_at IS NULL
WHERE ul.id IS NULL;

-- Инициализация статистики лояльности
INSERT INTO user_loyalty_stats (
  user_id,
  bonus_balance,
  total_spent_60_days,
  total_spent_all_time,
  last_order_at,
  last_level_check_at,
  last_balance_reconciliation_at,
  total_earned,
  total_spent,
  total_expired
)
SELECT
  u.id,
  CAST(ROUND(u.bonus_balance) AS SIGNED),
  COALESCE(s.total_spent_60_days, 0),
  CAST(ROUND(u.total_spent) AS SIGNED),
  o.last_order_at,
  NULL,
  NULL,
  COALESCE(t.total_earned, 0),
  COALESCE(t.total_spent, 0),
  COALESCE(t.total_expired, 0)
FROM users u
LEFT JOIN (
  SELECT
    user_id,
    SUM(GREATEST(0, (total - bonus_used - delivery_cost))) AS total_spent_60_days
  FROM orders
  WHERE status = 'completed'
    AND created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
  GROUP BY user_id
) s ON s.user_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    SUM(CASE WHEN type IN ('earn', 'register_bonus', 'birthday_bonus') THEN amount ELSE 0 END) AS total_earned,
    SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END) AS total_spent,
    SUM(CASE WHEN type = 'expire' THEN amount ELSE 0 END) AS total_expired
  FROM loyalty_transactions
  GROUP BY user_id
) t ON t.user_id = u.id
LEFT JOIN (
  SELECT user_id, MAX(created_at) AS last_order_at
  FROM orders
  WHERE status = 'completed'
  GROUP BY user_id
) o ON o.user_id = u.id
LEFT JOIN user_loyalty_stats us ON us.user_id = u.id
WHERE us.user_id IS NULL;

-- Нормализация транзакций
UPDATE loyalty_transactions
SET status = 'completed'
WHERE status IS NULL;

UPDATE loyalty_transactions
SET earned_at = created_at
WHERE earned_at IS NULL
  AND type IN ('earn', 'register_bonus', 'birthday_bonus');

UPDATE loyalty_transactions
SET expires_at = DATE_ADD(COALESCE(earned_at, created_at), INTERVAL 60 DAY)
WHERE expires_at IS NULL
  AND type IN ('earn', 'register_bonus', 'birthday_bonus');
