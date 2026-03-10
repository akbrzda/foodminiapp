export const ACCESS_PERMISSION_DEFINITIONS = [
  { code: "dashboard.view", module: "dashboard", action: "view", description: "Просмотр дашборда" },

  { code: "orders.view", module: "orders", action: "view", description: "Просмотр заказов" },
  { code: "orders.manage", module: "orders", action: "manage", description: "Управление заказами" },
  { code: "orders.delete", module: "orders", action: "delete", description: "Удаление заказов" },

  { code: "clients.view", module: "clients", action: "view", description: "Просмотр клиентов" },
  { code: "clients.manage", module: "clients", action: "manage", description: "Редактирование клиентов" },
  { code: "clients.loyalty.adjust", module: "clients", action: "loyalty_adjust", description: "Ручная корректировка бонусов" },

  { code: "locations.cities.manage", module: "locations", action: "cities_manage", description: "Управление городами" },
  { code: "locations.branches.view", module: "locations", action: "branches_view", description: "Просмотр филиалов" },
  { code: "locations.branches.manage", module: "locations", action: "branches_manage", description: "Управление филиалами" },
  {
    code: "locations.delivery_zones.view",
    module: "locations",
    action: "delivery_zones_view",
    description: "Просмотр зон доставки",
  },
  {
    code: "locations.delivery_zones.manage",
    module: "locations",
    action: "delivery_zones_manage",
    description: "Управление зонами доставки",
  },
  {
    code: "locations.delivery_zones.toggle",
    module: "locations",
    action: "delivery_zones_toggle",
    description: "Блокировка/разблокировка и переключение зон доставки",
  },

  { code: "menu.products.manage", module: "menu", action: "products_manage", description: "Управление блюдами" },
  { code: "menu.categories.manage", module: "menu", action: "categories_manage", description: "Управление категориями" },
  { code: "menu.modifiers.manage", module: "menu", action: "modifiers_manage", description: "Управление модификаторами" },
  { code: "menu.tags.manage", module: "menu", action: "tags_manage", description: "Управление тегами" },
  { code: "menu.stop_list.manage", module: "menu", action: "stop_list_manage", description: "Управление стоп-листом" },

  {
    code: "marketing.broadcasts.manage",
    module: "marketing",
    action: "broadcasts_manage",
    description: "Управление рассылками",
  },
  {
    code: "marketing.campaigns.manage",
    module: "marketing",
    action: "campaigns_manage",
    description: "Управление кампаниями подписки",
  },

  { code: "system.settings.manage", module: "system", action: "settings_manage", description: "Управление системными настройками" },
  { code: "system.integrations.manage", module: "system", action: "integrations_manage", description: "Управление интеграциями" },
  { code: "system.roles.view", module: "system", action: "roles_view", description: "Просмотр справочника ролей" },
  {
    code: "system.loyalty_levels.manage",
    module: "system",
    action: "loyalty_levels_manage",
    description: "Управление уровнями лояльности",
  },
  { code: "system.admin_users.manage", module: "system", action: "admin_users_manage", description: "Управление admin-users" },
  { code: "system.auth_limits.manage", module: "system", action: "auth_limits_manage", description: "Управление auth-лимитами" },
  { code: "system.logs.view", module: "system", action: "logs_view", description: "Просмотр административных логов" },
  { code: "system.queues.manage", module: "system", action: "queues_manage", description: "Управление очередями" },
  { code: "system.access.manage", module: "system", action: "access_manage", description: "Управление ролями и доступами" },
];

export const DEFAULT_ROLE_PERMISSIONS = {
  ceo: ACCESS_PERMISSION_DEFINITIONS.map((permission) => permission.code),
  admin: ACCESS_PERMISSION_DEFINITIONS.map((permission) => permission.code),
  manager: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "clients.view",
    "clients.manage",
    "locations.branches.view",
    "locations.delivery_zones.view",
    "locations.delivery_zones.manage",
    "menu.stop_list.manage",
  ],
};

export const SYSTEM_ROLE_DEFINITIONS = [
  { code: "ceo", name: "CEO", scope_role: "ceo", is_system: true },
  { code: "admin", name: "Администратор", scope_role: "admin", is_system: true },
  { code: "manager", name: "Менеджер", scope_role: "manager", is_system: true },
];

export const getDefaultRolePermissions = (roleCode) => {
  const permissions = DEFAULT_ROLE_PERMISSIONS[roleCode] || [];
  return [...permissions];
};
