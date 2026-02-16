-- Добавление настройки для хранения revision по организациям iiko
-- Формат: {"organizationId": revision}
INSERT INTO system_settings (`key`, value, description) VALUES
('iiko_last_revisions', JSON_OBJECT(), 'Последние revision номенклатуры по организациям iiko (JSON объект)')
ON DUPLICATE KEY UPDATE
value = VALUES(value),
description = VALUES(description);
