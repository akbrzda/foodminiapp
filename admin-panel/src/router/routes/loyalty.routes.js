export const loyaltyRoutes = [
  {
    path: "loyalty-levels",
    name: "loyalty-levels",
    component: () => import("@/modules/system/views/LoyaltyLevelsSettings.vue"),
    meta: {
      title: "Уровни лояльности",
      subtitle: "Локальные уровни и маппинг PremiumBonus",
      permissions: ["system.loyalty_levels.manage"],
    },
  },
];
