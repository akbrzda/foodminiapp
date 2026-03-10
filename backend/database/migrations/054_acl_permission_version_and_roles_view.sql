ALTER TABLE admin_users
  ADD COLUMN permission_version INT NOT NULL DEFAULT 1 AFTER eruda_enabled;

INSERT INTO admin_permissions (code, module, action, description, is_active)
SELECT 'system.roles.view', 'system', 'roles_view', 'Просмотр справочника ролей', 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_permissions WHERE code = 'system.roles.view'
);

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code = 'system.roles.view'
WHERE r.code IN ('admin', 'ceo')
  AND NOT EXISTS (
    SELECT 1
    FROM admin_role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
  );
