ALTER TABLE loyalty_transactions
  ADD COLUMN external_source VARCHAR(32) NULL AFTER description,
  ADD COLUMN external_ref VARCHAR(255) NULL AFTER external_source,
  ADD COLUMN external_payload JSON NULL AFTER external_ref,
  ADD KEY idx_loyalty_external_source (external_source),
  ADD KEY idx_loyalty_external_user_created (user_id, external_source, created_at),
  ADD UNIQUE KEY uq_loyalty_external_ref (user_id, external_source, external_ref);
