ALTER TABLE modifier_groups
  ADD COLUMN sort_order INT DEFAULT 0 AFTER max_selections,
  DROP INDEX idx_active,
  ADD INDEX idx_active_sort (is_active, sort_order);
