ALTER TABLE branches
  ADD COLUMN iiko_organization_id VARCHAR(255) NULL AFTER phone,
  ADD COLUMN iiko_terminal_group_id VARCHAR(255) NULL AFTER iiko_organization_id,
  ADD COLUMN iiko_synced_at TIMESTAMP NULL DEFAULT NULL AFTER iiko_terminal_group_id,
  ADD UNIQUE KEY uq_branches_iiko_terminal_group_id (iiko_terminal_group_id),
  ADD KEY idx_branches_iiko_organization_id (iiko_organization_id);
