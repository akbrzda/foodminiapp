ALTER TABLE `order_item_modifiers`
  ADD COLUMN `modifier_weight` decimal(10,2) DEFAULT NULL,
  ADD COLUMN `modifier_weight_unit` enum('g','kg','ml','l','pcs') COLLATE utf8mb4_unicode_ci DEFAULT NULL;
