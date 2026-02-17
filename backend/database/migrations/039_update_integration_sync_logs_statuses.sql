-- Обновление статусов логов интеграций: active/success/failed

UPDATE integration_sync_logs
SET status = 'failed'
WHERE status = 'error';

ALTER TABLE integration_sync_logs
  MODIFY COLUMN status ENUM('active', 'success', 'failed') NOT NULL;
