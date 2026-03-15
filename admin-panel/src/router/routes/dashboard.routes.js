export const dashboardRoutes = [
  {
    path: "dashboard",
    name: "dashboard",
    component: () => import("@/modules/dashboard/views/Dashboard.vue"),
    meta: {
      title: "Панель управления",
      subtitle: "Статистика и обзор",
      permissions: ["dashboard.view"],
    },
  },
];
