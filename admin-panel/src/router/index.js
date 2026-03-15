import { createRouter, createWebHistory } from "vue-router";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import {
  authGuard,
  navigationContextGuard,
  permissionGuard,
  resetReturningFlagAfterNavigation,
  scrollRestoreGuard,
} from "./guards/index.js";
import {
  broadcastsRoutes,
  dashboardRoutes,
  loyaltyRoutes,
  menuRoutes,
  ordersRoutes,
  settingsRoutes,
  shiftRoute,
  usersRoutes,
} from "./routes/index.js";

const adminChildren = [
  { path: "", redirect: "/dashboard" },
  ...dashboardRoutes,
  ...ordersRoutes,
  ...usersRoutes,
  ...settingsRoutes,
  ...menuRoutes,
  ...broadcastsRoutes,
  ...loyaltyRoutes,
];

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: scrollRestoreGuard,
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/modules/auth/views/Login.vue"),
      meta: { public: true },
    },
    shiftRoute,
    {
      path: "/",
      component: () => import("@/shared/layouts/AdminLayout.vue"),
      meta: { requiresAuth: true },
      children: adminChildren,
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/shared/components/NotFound.vue"),
    },
  ],
});

router.beforeEach(async (to, from) => {
  const authResult = await authGuard(to);
  if (authResult !== true) {
    return authResult;
  }

  const permissionResult = permissionGuard(to);
  if (permissionResult !== true) {
    return permissionResult;
  }

  return navigationContextGuard(to, from);
});

router.afterEach((to) => {
  const ordersStore = useOrdersStore();
  const baseTitle = to.meta?.title || "Админ-панель";
  const count = ordersStore?.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
  resetReturningFlagAfterNavigation(to);
});

export default router;
