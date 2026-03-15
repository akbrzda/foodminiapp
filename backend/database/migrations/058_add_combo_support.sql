ALTER TABLE menu_items
  ADD COLUMN item_type ENUM('item','combo') NOT NULL DEFAULT 'item' AFTER iiko_synced_at,
  ADD COLUMN bonus_spend_allowed TINYINT(1) NOT NULL DEFAULT 1 AFTER is_value,
  ADD COLUMN bonus_earn_allowed TINYINT(1) NOT NULL DEFAULT 1 AFTER bonus_spend_allowed;

CREATE TABLE menu_combo_components (
  id INT NOT NULL AUTO_INCREMENT,
  combo_item_id INT NOT NULL COMMENT 'ID позиции-комбо в menu_items',
  component_item_id INT NOT NULL COMMENT 'ID базового блюда из menu_items',
  component_variant_id INT NOT NULL COMMENT 'ID варианта блюда из item_variants',
  quantity INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_combo_variant (combo_item_id, component_variant_id),
  KEY idx_combo_item (combo_item_id),
  KEY idx_component_item (component_item_id),
  KEY idx_component_variant (component_variant_id),
  CONSTRAINT fk_menu_combo_components_combo_item
    FOREIGN KEY (combo_item_id) REFERENCES menu_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_combo_components_component_item
    FOREIGN KEY (component_item_id) REFERENCES menu_items (id) ON DELETE RESTRICT,
  CONSTRAINT fk_menu_combo_components_component_variant
    FOREIGN KEY (component_variant_id) REFERENCES item_variants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Фиксированный состав комбо по вариантам блюд';
