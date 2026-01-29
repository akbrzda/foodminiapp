-- Добавляем параметры способов получения и автоснятия для стоп-листа

ALTER TABLE `menu_stop_list`
  ADD COLUMN `fulfillment_types` json DEFAULT NULL COMMENT 'Способы получения' AFTER `entity_id`,
  ADD COLUMN `auto_remove` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Автоматически снять со стопа' AFTER `reason`,
  ADD COLUMN `remove_at` timestamp NULL DEFAULT NULL COMMENT 'Дата автоматического снятия' AFTER `auto_remove`;

CREATE INDEX `idx_stop_list_remove_at` ON `menu_stop_list` (`remove_at`);
