INSERT INTO system_settings (`key`, value, description)
VALUES
  ('loyalty_level_1_name', CAST('"Бронза"' AS JSON), 'Название первого уровня лояльности'),
  ('loyalty_level_2_name', CAST('"Серебро"' AS JSON), 'Название второго уровня лояльности'),
  ('loyalty_level_3_name', CAST('"Золото"' AS JSON), 'Название третьего уровня лояльности'),
  ('loyalty_level_1_redeem_percent', CAST('0.5' AS JSON), 'Максимальная доля списания бонусами для уровня 1'),
  ('loyalty_level_2_redeem_percent', CAST('0.5' AS JSON), 'Максимальная доля списания бонусами для уровня 2'),
  ('loyalty_level_3_redeem_percent', CAST('0.5' AS JSON), 'Максимальная доля списания бонусами для уровня 3')
ON DUPLICATE KEY UPDATE
  value = VALUES(value),
  description = VALUES(description);
