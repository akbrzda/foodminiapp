ALTER TABLE delivery_polygons
  ADD COLUMN source ENUM('local', 'iiko') NOT NULL DEFAULT 'local' AFTER name,
  ADD COLUMN external_id VARCHAR(255) NULL AFTER source,
  ADD COLUMN iiko_terminal_group_id VARCHAR(255) NULL AFTER external_id,
  ADD KEY idx_delivery_polygons_source (source),
  ADD KEY idx_delivery_polygons_iiko_terminal_group_id (iiko_terminal_group_id),
  ADD UNIQUE KEY uq_delivery_polygons_source_external_id (source, external_id);
