import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { showBackButton, hideBackButton, isDesktop } from "@/shared/services/telegram.js";

const HOME_SCROLL_Y_STORAGE_KEY = "home-scroll-y-before-item-detail";

const saveHomeScrollY = () => {
  if (typeof window === "undefined") return;
  const scrollY = Number(window.scrollY || window.pageYOffset || 0);
  window.sessionStorage.setItem(HOME_SCROLL_Y_STORAGE_KEY, String(scrollY));
};

const consumeHomeScrollY = () => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(HOME_SCROLL_Y_STORAGE_KEY);
  if (raw === null) return null;
  window.sessionStorage.removeItem(HOME_SCROLL_Y_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("@/modules/menu/views/Home.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: false },
  },
  {
    path: "/item/:id",
    name: "ItemDetail",
    component: () => import("@/modules/menu/views/ItemDetail.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/cart",
    name: "Cart",
    component: () => import("@/modules/cart/views/Cart.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/checkout",
    name: "Checkout",
    component: () => import("@/modules/cart/views/Checkout.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/modules/profile/views/Profile.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/bonus-history",
    name: "BonusHistory",
    component: () => import("@/modules/loyalty/views/BonusHistory.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/orders",
    name: "Orders",
    component: () => import("@/modules/orders/views/Orders.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/order/:id",
    name: "OrderDetail",
    component: () => import("@/modules/orders/views/OrderDetail.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/modules/auth/views/Login.vue"),
    meta: { requiresAuth: false, showBackButton: false },
  },
  {
    path: "/delivery-map",
    name: "DeliveryMap",
    component: () => import("@/modules/location/views/DeliveryMap.vue"),
    meta: { requiresAuth: false, showBackButton: true },
  },
  {
    path: "/pickup-map",
    name: "PickupMap",
    component: () => import("@/modules/location/views/PickupMap.vue"),
    meta: { requiresAuth: false, showBackButton: true },
  },
  {
    path: "/contacts",
    name: "Contacts",
    component: () => import("@/modules/location/views/Contacts.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
];
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (to.name === "Home" && from.name === "ItemDetail") {
      const homeScrollY = consumeHomeScrollY();
      if (homeScrollY !== null) {
        return { top: homeScrollY, left: 0 };
      }
    }
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0 };
  },
  routes,
});
let backButtonCleanup = null;
let isRedirecting = false;

const resolveBackFallback = (route) => {
  if (route?.name === "OrderDetail") {
    return "/orders";
  }
  return "/";
};

const navigateBackWithFallback = (router, route) => {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  const fallbackPath = resolveBackFallback(route);
  router.replace(fallbackPath);
};

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const locationStore = useLocationStore();

  if (from.name === "Home" && to.name === "ItemDetail") {
    saveHomeScrollY();
  }

  if (backButtonCleanup) {
    backButtonCleanup();
    backButtonCleanup = null;
  }
  if (isRedirecting) {
    isRedirecting = false;
    return next();
  }
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    await authStore.verifySession();
  }
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next("/login");
  }
  if (to.name === "Login" && authStore.isAuthenticated) {
    if (!locationStore.selectedCity) {
      isRedirecting = true;
      return next({ path: "/", query: { openCity: "1" }, replace: true });
    }
    isRedirecting = true;
    return next({ path: "/", replace: true });
  }
  if (to.meta.requiresLocation && authStore.isAuthenticated) {
    if (to.name === "Home" && to.query?.openCity === "1") {
      return next();
    }
    if (!locationStore.selectedCity && to.name !== "DeliveryMap" && to.name !== "PickupMap") {
      if (from.name === "Home" && from.query?.openCity === "1") {
        return next();
      }
      if (to.name === "Home" && to.query?.openCity === "1") {
        return next();
      }
      isRedirecting = true;
      return next({ path: "/", query: { openCity: "1" }, replace: true });
    }
  }
  next();
});
router.afterEach((to) => {
  if (!isDesktop()) {
    if (to.meta.showBackButton) {
      backButtonCleanup = showBackButton(() => {
        navigateBackWithFallback(router, to);
      });
    } else {
      hideBackButton();
    }
  } else {
    hideBackButton();
  }
});
export default router;
