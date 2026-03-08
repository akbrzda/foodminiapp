CREATE TABLE IF NOT EXISTS admin_roles (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_admin_roles_code (code),
  KEY idx_admin_roles_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_permissions (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_admin_permissions_code (code),
  KEY idx_admin_permissions_module (module),
  KEY idx_admin_permissions_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_admin_role_permissions_permission (permission_id),
  CONSTRAINT fk_admin_role_permissions_role FOREIGN KEY (role_id) REFERENCES admin_roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_user_permission_overrides (
  id INT NOT NULL AUTO_INCREMENT,
  admin_user_id INT NOT NULL,
  permission_id INT NOT NULL,
  effect ENUM('allow','deny') NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_admin_user_permission_override (admin_user_id, permission_id),
  KEY idx_admin_user_permission_effect (effect),
  KEY idx_admin_user_permission_permission (permission_id),
  CONSTRAINT fk_admin_user_permission_overrides_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_user_permission_overrides_permission FOREIGN KEY (permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO admin_roles (code, name, is_system, is_active)
VALUES
  ('ceo', 'CEO', 1, 1),
  ('admin', 'Администратор', 1, 1),
  ('manager', 'Менеджер', 1, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_system = VALUES(is_system),
  is_active = VALUES(is_active);

INSERT INTO admin_permissions (code, module, action, description, is_active)
VALUES
  ('dashboard.view', 'dashboard', 'view', 'Просмотр дашборда', 1),
  ('orders.view', 'orders', 'view', 'Просмотр заказов', 1),
  ('orders.manage', 'orders', 'manage', 'Управление заказами', 1),
  ('orders.delete', 'orders', 'delete', 'Удаление заказов', 1),
  ('clients.view', 'clients', 'view', 'Просмотр клиентов', 1),
  ('clients.manage', 'clients', 'manage', 'Редактирование клиентов', 1),
  ('clients.loyalty.adjust', 'clients', 'loyalty_adjust', 'Ручная корректировка бонусов', 1),
  ('locations.cities.manage', 'locations', 'cities_manage', 'Управление городами', 1),
  ('locations.branches.view', 'locations', 'branches_view', 'Просмотр филиалов', 1),
  ('locations.branches.manage', 'locations', 'branches_manage', 'Управление филиалами', 1),
  ('locations.delivery_zones.view', 'locations', 'delivery_zones_view', 'Просмотр зон доставки', 1),
  ('locations.delivery_zones.manage', 'locations', 'delivery_zones_manage', 'Управление зонами доставки', 1),
  ('menu.products.manage', 'menu', 'products_manage', 'Управление блюдами', 1),
  ('menu.categories.manage', 'menu', 'categories_manage', 'Управление категориями', 1),
  ('menu.modifiers.manage', 'menu', 'modifiers_manage', 'Управление модификаторами', 1),
  ('menu.tags.manage', 'menu', 'tags_manage', 'Управление тегами', 1),
  ('menu.stop_list.manage', 'menu', 'stop_list_manage', 'Управление стоп-листом', 1),
  ('marketing.broadcasts.manage', 'marketing', 'broadcasts_manage', 'Управление рассылками', 1),
  ('marketing.campaigns.manage', 'marketing', 'campaigns_manage', 'Управление кампаниями подписки', 1),
  ('system.settings.manage', 'system', 'settings_manage', 'Управление системными настройками', 1),
  ('system.integrations.manage', 'system', 'integrations_manage', 'Управление интеграциями', 1),
  ('system.loyalty_levels.manage', 'system', 'loyalty_levels_manage', 'Управление уровнями лояльности', 1),
  ('system.admin_users.manage', 'system', 'admin_users_manage', 'Управление admin-users', 1),
  ('system.logs.view', 'system', 'logs_view', 'Просмотр административных логов', 1),
  ('system.queues.manage', 'system', 'queues_manage', 'Управление очередями', 1),
  ('system.access.manage', 'system', 'access_manage', 'Управление ролями и доступами', 1)
ON DUPLICATE KEY UPDATE
  module = VALUES(module),
  action = VALUES(action),
  description = VALUES(description),
  is_active = VALUES(is_active);

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p
WHERE r.code IN ('ceo', 'admin');

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN (
  'dashboard.view',
  'orders.view',
  'orders.manage',
  'clients.view',
  'clients.manage',
  'locations.branches.view',
  'locations.delivery_zones.view',
  'locations.delivery_zones.manage',
  'menu.stop_list.manage'
)
WHERE r.code = 'manager';
