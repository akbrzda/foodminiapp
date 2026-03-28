export const loyaltyRoutes = [
  {
    path: "loyalty-levels",
    name: "loyalty-levels",
    component: () => import("@/modules/system/views/LoyaltyLevelsSettings.vue"),
    meta: {
      title: "Лояльность",
      subtitle: "Уровни и массовое начисление бонусов",
      permissions: ["system.loyalty_levels.manage"],
    },
  },
];
