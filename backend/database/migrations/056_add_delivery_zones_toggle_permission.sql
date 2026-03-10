INSERT INTO admin_permissions (code, module, action, description, is_active)
SELECT 'locations.delivery_zones.toggle', 'locations', 'delivery_zones_toggle', 'Блокировка/разблокировка и переключение зон доставки', 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_permissions WHERE code = 'locations.delivery_zones.toggle'
);

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code = 'locations.delivery_zones.toggle'
LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.code IN ('admin', 'ceo')
  AND rp.role_id IS NULL;
