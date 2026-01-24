-- Этап 3: пересчет и валидация лояльности

-- Создаем отсутствующие записи статистики
INSERT INTO user_loyalty_stats (user_id)
SELECT u.id
FROM users u
LEFT JOIN user_loyalty_stats us ON us.user_id = u.id
WHERE us.user_id IS NULL;

-- Пересчет сумм заказов
UPDATE user_loyalty_stats us
LEFT JOIN (
  SELECT
    user_id,
    SUM(GREATEST(0, (total - bonus_used - delivery_cost))) AS total_spent_all_time
  FROM orders
  WHERE status = 'completed'
  GROUP BY user_id
) all_time ON all_time.user_id = us.user_id
LEFT JOIN (
  SELECT
    user_id,
    SUM(GREATEST(0, (total - bonus_used - delivery_cost))) AS total_spent_60_days
  FROM orders
  WHERE status = 'completed'
    AND created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
  GROUP BY user_id
) last_60 ON last_60.user_id = us.user_id
LEFT JOIN (
  SELECT user_id, MAX(created_at) AS last_order_at
  FROM orders
  WHERE status = 'completed'
  GROUP BY user_id
) last_order ON last_order.user_id = us.user_id
SET us.total_spent_all_time = COALESCE(all_time.total_spent_all_time, 0),
    us.total_spent_60_days = COALESCE(last_60.total_spent_60_days, 0),
    us.last_order_at = last_order.last_order_at;

-- Пересчет транзакций и баланса
UPDATE user_loyalty_stats us
LEFT JOIN (
  SELECT
    user_id,
    SUM(CASE WHEN type IN ('earn', 'register_bonus', 'birthday_bonus') THEN amount ELSE 0 END) AS total_earned,
    SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END) AS total_spent,
    SUM(CASE WHEN type = 'expire' THEN amount ELSE 0 END) AS total_expired
  FROM loyalty_transactions
  WHERE status = 'completed'
  GROUP BY user_id
) t ON t.user_id = us.user_id
SET us.total_earned = COALESCE(t.total_earned, 0),
    us.total_spent = COALESCE(t.total_spent, 0),
    us.total_expired = COALESCE(t.total_expired, 0),
    us.bonus_balance = GREATEST(0, COALESCE(t.total_earned, 0) - COALESCE(t.total_spent, 0) - COALESCE(t.total_expired, 0));

-- Обновление users по итогам пересчета
UPDATE users u
JOIN user_loyalty_stats us ON us.user_id = u.id
SET u.bonus_balance = us.bonus_balance,
    u.total_spent = us.total_spent_all_time;

-- Пересчет текущего уровня по сумме за 60 дней
UPDATE users u
JOIN (
  SELECT
    us.user_id,
    MAX(l.level_number) AS level_number
  FROM user_loyalty_stats us
  JOIN loyalty_levels l
    ON l.is_active = TRUE
   AND us.total_spent_60_days >= l.threshold_amount
  GROUP BY us.user_id
) calc ON calc.user_id = u.id
JOIN loyalty_levels lcur ON lcur.level_number = calc.level_number
SET u.loyalty_level = calc.level_number,
    u.current_loyalty_level_id = lcur.id;

-- Закрытие старых записей уровней
UPDATE user_loyalty_levels ul
JOIN users u ON u.id = ul.user_id
SET ul.ended_at = NOW()
WHERE ul.ended_at IS NULL
  AND ul.level_id <> u.current_loyalty_level_id;

-- Создание новых записей уровней (если нет открытой записи)
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
  u.current_loyalty_level_id,
  CASE
    WHEN prev.level_number IS NULL THEN 'initial'
    WHEN cur.level_number > prev.level_number THEN 'threshold_reached'
    ELSE 'degradation'
  END,
  NULL,
  CAST(ROUND(us.total_spent_60_days) AS UNSIGNED),
  NOW(),
  NULL
FROM users u
JOIN user_loyalty_stats us ON us.user_id = u.id
JOIN loyalty_levels cur ON cur.id = u.current_loyalty_level_id
LEFT JOIN user_loyalty_levels open ON open.user_id = u.id AND open.ended_at IS NULL
LEFT JOIN (
  SELECT ul.user_id, ll.level_number
  FROM user_loyalty_levels ul
  JOIN loyalty_levels ll ON ll.id = ul.level_id
  JOIN (
    SELECT user_id, MAX(ended_at) AS max_ended
    FROM user_loyalty_levels
    WHERE ended_at IS NOT NULL
    GROUP BY user_id
  ) last ON last.user_id = ul.user_id AND last.max_ended = ul.ended_at
) prev ON prev.user_id = u.id
WHERE open.id IS NULL;
