INSERT INTO admin_permissions (code, module, action, description, is_active)
SELECT 'system.auth_limits.manage', 'system', 'auth_limits_manage', 'Управление auth-лимитами', 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_permissions WHERE code = 'system.auth_limits.manage'
);

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code = 'system.auth_limits.manage'
LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.code IN ('admin', 'ceo') AND rp.role_id IS NULL;
