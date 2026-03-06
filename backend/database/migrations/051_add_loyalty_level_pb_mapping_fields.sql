ALTER TABLE loyalty_levels
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER is_enabled,
  ADD COLUMN pb_group_id VARCHAR(255) NULL AFTER sort_order,
  ADD COLUMN pb_group_name VARCHAR(120) NULL AFTER pb_group_id,
  ADD KEY idx_loyalty_levels_sort_order (sort_order),
  ADD KEY idx_loyalty_levels_pb_group_name (pb_group_name),
  ADD UNIQUE KEY uniq_loyalty_levels_pb_group_id (pb_group_id);

UPDATE loyalty_levels
SET sort_order = id * 10
WHERE sort_order = 0;
