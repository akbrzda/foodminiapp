-- Обновления бонусной системы под требования docs/bonus.md

-- Soft delete для уровней лояльности
ALTER TABLE loyalty_levels
  ADD COLUMN deleted_at DATETIME NULL AFTER updated_at,
  ADD INDEX idx_loyalty_levels_deleted_at (deleted_at),
  ADD UNIQUE KEY uniq_loyalty_threshold_deleted (threshold_amount, deleted_at);

-- Глобальный лимит списания бонусов (доля, 0.2 = 20%)
ALTER TABLE loyalty_settings
  MODIFY COLUMN bonus_max_redeem_percent DECIMAL(6, 4) NOT NULL DEFAULT 0.2;

-- Расширение типа транзакций бонусов
ALTER TABLE loyalty_transactions
  MODIFY COLUMN type ENUM(
    'earn',
    'spend',
    'refund_earn',
    'refund_spend',
    'expire',
    'register_bonus',
    'birthday_bonus',
    'adjustment'
  ) NOT NULL;

-- Расширение типов логов лояльности
ALTER TABLE loyalty_logs
  MODIFY COLUMN event_type ENUM(
    'balance_mismatch',
    'duplicate_transaction',
    'cron_execution',
    'error',
    'race_condition',
    'bonus_earn',
    'bonus_refund',
    'bonus_adjustment',
    'negative_balance'
  ) NOT NULL;
