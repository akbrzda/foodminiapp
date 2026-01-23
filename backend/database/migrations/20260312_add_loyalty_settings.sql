-- Добавление настроек лояльности
INSERT INTO system_settings (`key`, value, description)
VALUES
  ('bonus_max_redeem_percent', CAST('0.5' AS JSON), 'Доля от суммы заказа, доступная к списанию бонусами'),
  ('loyalty_level_1_rate', CAST('0.05' AS JSON), 'Начисление бонусов для уровня Бронза'),
  ('loyalty_level_2_rate', CAST('0.07' AS JSON), 'Начисление бонусов для уровня Серебро'),
  ('loyalty_level_3_rate', CAST('0.1' AS JSON), 'Начисление бонусов для уровня Золото'),
  ('loyalty_level_2_threshold', CAST('10000' AS JSON), 'Сумма заказов для перехода на Серебро'),
  ('loyalty_level_3_threshold', CAST('50000' AS JSON), 'Сумма заказов для перехода на Золото')
ON DUPLICATE KEY UPDATE
  value = VALUES(value),
  description = VALUES(description);
