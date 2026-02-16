ALTER TABLE menu_categories
  ADD COLUMN iiko_category_id VARCHAR(255) NULL AFTER image_url,
  ADD COLUMN iiko_synced_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_category_id,
  ADD INDEX idx_iiko_category_id (iiko_category_id);

ALTER TABLE menu_items
  ADD COLUMN iiko_item_id VARCHAR(255) NULL AFTER image_url,
  ADD COLUMN iiko_synced_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_item_id,
  ADD INDEX idx_iiko_item_id (iiko_item_id);

ALTER TABLE item_variants
  ADD COLUMN iiko_variant_id VARCHAR(255) NULL AFTER image_url,
  ADD COLUMN iiko_synced_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_variant_id,
  ADD INDEX idx_iiko_variant_id (iiko_variant_id);

ALTER TABLE modifier_groups
  ADD COLUMN iiko_modifier_group_id VARCHAR(255) NULL AFTER name,
  ADD COLUMN iiko_synced_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_modifier_group_id,
  ADD INDEX idx_iiko_modifier_group_id (iiko_modifier_group_id);

ALTER TABLE modifiers
  ADD COLUMN iiko_modifier_id VARCHAR(255) NULL AFTER image_url,
  ADD COLUMN iiko_synced_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_modifier_id,
  ADD INDEX idx_iiko_modifier_id (iiko_modifier_id);

ALTER TABLE users
  ADD COLUMN pb_client_id VARCHAR(255) NULL AFTER timezone,
  ADD COLUMN pb_external_id VARCHAR(255) NULL AFTER pb_client_id,
  ADD COLUMN loyalty_mode ENUM('local', 'premiumbonus') NOT NULL DEFAULT 'local' AFTER pb_external_id,
  ADD COLUMN pb_sync_status ENUM('pending', 'synced', 'error', 'failed') NOT NULL DEFAULT 'pending' AFTER loyalty_mode,
  ADD COLUMN pb_sync_error TEXT NULL AFTER pb_sync_status,
  ADD COLUMN pb_sync_attempts INT NOT NULL DEFAULT 0 AFTER pb_sync_error,
  ADD COLUMN pb_last_sync_at TIMESTAMP NULL DEFAULT NULL AFTER pb_sync_attempts,
  ADD INDEX idx_pb_client_id (pb_client_id),
  ADD INDEX idx_pb_sync_status (pb_sync_status),
  ADD INDEX idx_loyalty_mode (loyalty_mode);

ALTER TABLE orders
  ADD COLUMN iiko_order_id VARCHAR(255) NULL AFTER status,
  ADD COLUMN iiko_sync_status ENUM('pending', 'synced', 'error', 'failed') NOT NULL DEFAULT 'pending' AFTER iiko_order_id,
  ADD COLUMN iiko_sync_error TEXT NULL AFTER iiko_sync_status,
  ADD COLUMN iiko_sync_attempts INT NOT NULL DEFAULT 0 AFTER iiko_sync_error,
  ADD COLUMN iiko_last_sync_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_sync_attempts,
  ADD COLUMN pb_purchase_id VARCHAR(255) NULL AFTER iiko_last_sync_at,
  ADD COLUMN pb_sync_status ENUM('pending', 'synced', 'error', 'failed') NOT NULL DEFAULT 'pending' AFTER pb_purchase_id,
  ADD COLUMN pb_sync_error TEXT NULL AFTER pb_sync_status,
  ADD COLUMN pb_sync_attempts INT NOT NULL DEFAULT 0 AFTER pb_sync_error,
  ADD COLUMN pb_last_sync_at TIMESTAMP NULL DEFAULT NULL AFTER pb_sync_attempts,
  ADD INDEX idx_iiko_order_id (iiko_order_id),
  ADD INDEX idx_iiko_sync_status (iiko_sync_status),
  ADD INDEX idx_pb_purchase_id (pb_purchase_id),
  ADD INDEX idx_pb_sync_status (pb_sync_status);

CREATE TABLE integration_sync_logs (
  id INT NOT NULL AUTO_INCREMENT,
  integration_type ENUM('iiko', 'premiumbonus') NOT NULL,
  module ENUM('menu', 'orders', 'stoplist', 'delivery_zones', 'clients', 'purchases', 'loyalty', 'promocode') NOT NULL,
  action VARCHAR(100) NOT NULL,
  status ENUM('success', 'error') NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id VARCHAR(255) NULL,
  error_message TEXT NULL,
  request_data JSON NULL,
  response_data JSON NULL,
  attempts INT NOT NULL DEFAULT 0,
  duration_ms INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_integration_module (integration_type, module),
  KEY idx_status (status),
  KEY idx_created_at (created_at),
  KEY idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_settings (`key`, value, description) VALUES
('integration_mode', JSON_OBJECT('menu', 'local', 'orders', 'local', 'loyalty', 'local'), 'Режим работы интеграционных модулей'),
('iiko_enabled', CAST('false' AS JSON), 'Включить интеграцию с iiko'),
('iiko_api_url', JSON_QUOTE(''), 'URL API iiko'),
('iiko_api_token', JSON_QUOTE(''), 'Токен API iiko'),
('iiko_organization_id', JSON_QUOTE(''), 'ID организации в iiko'),
('iiko_sync_category_ids', JSON_ARRAY(), 'Список категорий iiko для синхронизации'),
('iiko_webhook_secret', JSON_QUOTE(''), 'Секрет проверки webhook iiko'),
('premiumbonus_enabled', CAST('false' AS JSON), 'Включить интеграцию с PremiumBonus'),
('premiumbonus_api_url', JSON_QUOTE(''), 'URL API PremiumBonus'),
('premiumbonus_api_token', JSON_QUOTE(''), 'Токен API PremiumBonus'),
('premiumbonus_sale_point_id', JSON_QUOTE(''), 'ID точки продаж PremiumBonus')
ON DUPLICATE KEY UPDATE
value = VALUES(value),
description = VALUES(description);
