-- Migration: add_admin_user_branch
-- Created: 2026-02-15T00:00:00.000Z
ALTER TABLE admin_users
  ADD COLUMN branch_id INT NULL;
ALTER TABLE admin_users
  ADD CONSTRAINT fk_admin_users_branch_id
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX idx_admin_users_branch_id ON admin_users (branch_id);
