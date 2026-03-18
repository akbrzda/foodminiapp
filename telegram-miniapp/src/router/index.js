import { createRouter, createWebHistory } from "vue-router";
import { createNavigationContext, registerAuthGuard } from "@/router/guards/auth.guard.js";
import { registerLocationGuard } from "@/router/guards/location.guard.js";
import {
  createScrollBehavior,
  registerScrollRestoreGuard,
} from "@/router/guards/scroll-restore.guard.js";
import { registerTelegramBackButtonGuard } from "@/router/guards/telegram-back-button.guard.js";

const loadRouteWithRetry = (loader, { retries = 2, delayMs = 350 } = {}) => {
  return async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;
        if (attempt >= retries) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  };
};

const routes = [
  {
    path: "/",
    name: "Home",
    component: loadRouteWithRetry(() => import("@/modules/menu/views/Home.vue")),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: false },
  },
  {
    path: "/item/:id",
    name: "ItemDetail",
    component: loadRouteWithRetry(() => import("@/modules/menu/views/ItemDetail.vue")),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/cart",
    name: "Cart",
    component: loadRouteWithRetry(() => import("@/modules/cart/views/Cart.vue")),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/checkout",
    name: "Checkout",
    component: loadRouteWithRetry(() => import("@/modules/cart/views/Checkout.vue")),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/profile",
    name: "Profile",
    component: loadRouteWithRetry(() => import("@/modules/profile/views/Profile.vue")),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/bonus-history",
    name: "BonusHistory",
    component: loadRouteWithRetry(() => import("@/modules/loyalty/views/BonusHistory.vue")),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/orders",
    name: "Orders",
    component: loadRouteWithRetry(() => import("@/modules/orders/views/Orders.vue")),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/order/:id",
    name: "OrderDetail",
    component: loadRouteWithRetry(() => import("@/modules/orders/views/OrderDetail.vue")),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/login",
    name: "Login",
    component: loadRouteWithRetry(() => import("@/modules/auth/views/Login.vue")),
    meta: { requiresAuth: false, showBackButton: false },
  },
  {
    path: "/delivery-map",
    name: "DeliveryMap",
    component: loadRouteWithRetry(() => import("@/modules/location/views/DeliveryMap.vue")),
    meta: { requiresAuth: false, showBackButton: true },
  },
  {
    path: "/pickup-map",
    name: "PickupMap",
    component: loadRouteWithRetry(() => import("@/modules/location/views/PickupMap.vue")),
    meta: { requiresAuth: false, showBackButton: true },
  },
  {
    path: "/contacts",
    name: "Contacts",
    component: loadRouteWithRetry(() => import("@/modules/location/views/Contacts.vue")),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: createScrollBehavior(),
  routes,
});

const navigationContext = createNavigationContext();

registerScrollRestoreGuard(router);
registerAuthGuard(router, navigationContext);
registerLocationGuard(router, navigationContext);
registerTelegramBackButtonGuard(router);

router.onError((error) => {
  const message = String(error?.message || "").toLowerCase();
  const isChunkLoadError =
    message.includes("importing a module script failed") ||
    message.includes("failed to fetch dynamically imported module");

  if (!isChunkLoadError) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  const hasRetried = window.sessionStorage.getItem("route_chunk_retry_once") === "1";
  if (hasRetried) {
    window.sessionStorage.removeItem("route_chunk_retry_once");
    return;
  }

  window.sessionStorage.setItem("route_chunk_retry_once", "1");
  window.location.reload();
});

export default router;
