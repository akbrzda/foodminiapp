ALTER TABLE menu_items
  ADD COLUMN is_new TINYINT(1) DEFAULT NULL COMMENT 'Бейдж: Новинка (NULL = авто-режим)' AFTER is_active,
  ADD COLUMN is_hit TINYINT(1) DEFAULT NULL COMMENT 'Бейдж: Хит (NULL = авто-режим)' AFTER is_new,
  ADD COLUMN is_spicy TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Бейдж: Острое' AFTER is_hit,
  ADD COLUMN is_vegetarian TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Бейдж: Вегетарианское' AFTER is_spicy,
  ADD COLUMN is_piquant TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Бейдж: Пикантное' AFTER is_vegetarian,
  ADD COLUMN is_value TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Бейдж: Выгодно' AFTER is_piquant;
