-- Этап 1: подготовка БД для расширенной лояльности

-- Добавление новых полей в users
ALTER TABLE users
  ADD COLUMN current_loyalty_level_id INT NULL AFTER total_spent,
  ADD COLUMN loyalty_registered_at DATETIME NULL AFTER current_loyalty_level_id,
  ADD COLUMN registration_bonus_granted BOOLEAN DEFAULT FALSE AFTER loyalty_registered_at,
  ADD COLUMN birthday_bonus_last_granted_year INT NULL AFTER registration_bonus_granted,
  ADD INDEX idx_birth_date (date_of_birth),
  ADD INDEX idx_current_loyalty_level (current_loyalty_level_id);

-- Таблица уровней лояльности
CREATE TABLE IF NOT EXISTS loyalty_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  level_number INT NOT NULL,
  threshold_amount INT NOT NULL DEFAULT 0,
  earn_percent DECIMAL(6, 4) NOT NULL DEFAULT 0.0,
  max_spend_percent INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_loyalty_level_number (level_number),
  INDEX idx_loyalty_threshold (threshold_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

INSERT INTO loyalty_levels (name, level_number, threshold_amount, earn_percent, max_spend_percent, is_active, sort_order)
VALUES
  ('Бронза', 1, 0, 0.03, 20, TRUE, 1),
  ('Серебро', 2, 10000, 0.05, 25, TRUE, 2),
  ('Золото', 3, 20000, 0.07, 30, TRUE, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  threshold_amount = VALUES(threshold_amount),
  earn_percent = VALUES(earn_percent),
  max_spend_percent = VALUES(max_spend_percent),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order);

-- Таблица истории уровней пользователей
CREATE TABLE IF NOT EXISTS user_loyalty_levels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  level_id INT NOT NULL,
  reason ENUM('initial', 'threshold_reached', 'degradation') NOT NULL,
  triggered_by_order_id INT NULL,
  total_spent_amount INT NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_current_level (user_id, ended_at),
  INDEX idx_user_level_period (user_id, started_at, ended_at),
  INDEX idx_level_id (level_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (level_id) REFERENCES loyalty_levels(id) ON DELETE RESTRICT,
  FOREIGN KEY (triggered_by_order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица статистики лояльности пользователей
CREATE TABLE IF NOT EXISTS user_loyalty_stats (
  user_id INT PRIMARY KEY,
  bonus_balance INT NOT NULL DEFAULT 0,
  total_spent_60_days INT NOT NULL DEFAULT 0,
  total_spent_all_time INT NOT NULL DEFAULT 0,
  last_order_at DATETIME NULL,
  last_level_check_at DATETIME NULL,
  last_balance_reconciliation_at DATETIME NULL,
  total_earned INT NOT NULL DEFAULT 0,
  total_spent INT NOT NULL DEFAULT 0,
  total_expired INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Таблица логов лояльности
CREATE TABLE IF NOT EXISTS loyalty_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('balance_mismatch', 'duplicate_transaction', 'cron_execution', 'error', 'race_condition') NOT NULL,
  severity ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'info',
  user_id INT NULL,
  order_id INT NULL,
  transaction_id BIGINT NULL,
  message TEXT NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_loyalty_event (event_type),
  INDEX idx_loyalty_severity (severity),
  INDEX idx_loyalty_user (user_id),
  INDEX idx_loyalty_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Расширение loyalty_transactions
ALTER TABLE loyalty_transactions
  MODIFY COLUMN id BIGINT AUTO_INCREMENT,
  MODIFY COLUMN amount INT NOT NULL,
  MODIFY COLUMN type ENUM('earn', 'spend', 'refund_earn', 'refund_spend', 'expire', 'register_bonus', 'birthday_bonus') NOT NULL,
  ADD COLUMN earned_at DATETIME NULL AFTER amount,
  ADD COLUMN status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'completed' AFTER expires_at,
  ADD COLUMN cancels_transaction_id BIGINT NULL AFTER status,
  ADD COLUMN description VARCHAR(500) NULL AFTER cancels_transaction_id,
  ADD COLUMN metadata JSON NULL AFTER description,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD INDEX idx_loyalty_user_status (user_id, status),
  ADD INDEX idx_loyalty_user_expires (user_id, expires_at, status),
  ADD INDEX idx_loyalty_type_status (type, status),
  ADD INDEX idx_loyalty_created (created_at);

UPDATE loyalty_transactions
SET status = 'completed'
WHERE status IS NULL;

UPDATE loyalty_transactions
SET earned_at = created_at
WHERE earned_at IS NULL AND type IN ('earn', 'register_bonus', 'birthday_bonus');
