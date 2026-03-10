ALTER TABLE admin_roles
  ADD COLUMN scope_role ENUM('admin','manager','ceo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manager' AFTER name;

UPDATE admin_roles
SET scope_role = CASE code
  WHEN 'admin' THEN 'admin'
  WHEN 'manager' THEN 'manager'
  WHEN 'ceo' THEN 'ceo'
  ELSE 'manager'
END;

ALTER TABLE admin_users
  MODIFY COLUMN role VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE admin_users
  ADD CONSTRAINT fk_admin_users_role_code
  FOREIGN KEY (role) REFERENCES admin_roles(code)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;
