-- Таблица системных настроек
CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) NOT NULL,
  value JSON NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_setting_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

INSERT INTO system_settings (`key`, value, description)
VALUES
  ('bonuses_enabled', CAST('true' AS JSON), 'Бонусная система'),
  ('orders_enabled', CAST('true' AS JSON), 'Прием заказов'),
  ('delivery_enabled', CAST('true' AS JSON), 'Оформление заказов с доставкой'),
  ('pickup_enabled', CAST('true' AS JSON), 'Оформление заказов на самовывоз')
ON DUPLICATE KEY UPDATE
  value = VALUES(value),
  description = VALUES(description);
