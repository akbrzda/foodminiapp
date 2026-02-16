INSERT INTO system_settings (`key`, value, description) VALUES
('iiko_external_menu_id', JSON_QUOTE(''), 'ID внешнего меню iiko для синхронизации меню'),
('iiko_price_category_id', JSON_QUOTE(''), 'ID категории цен iiko для внешнего меню (опционально)')
ON DUPLICATE KEY UPDATE
value = VALUES(value),
description = VALUES(description);
