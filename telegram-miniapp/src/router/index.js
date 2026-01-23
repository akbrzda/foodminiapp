import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useLocationStore } from "../stores/location";
import { showBackButton, hideBackButton, isDesktop } from "../services/telegram";
const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/Home.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: false },
  },
  {
    path: "/item/:id",
    name: "ItemDetail",
    component: () => import("../views/ItemDetail.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/cart",
    name: "Cart",
    component: () => import("../views/Cart.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/checkout",
    name: "Checkout",
    component: () => import("../views/Checkout.vue"),
    meta: { requiresAuth: true, requiresLocation: true, showBackButton: true },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("../views/Profile.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/bonus-history",
    name: "BonusHistory",
    component: () => import("../views/BonusHistory.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/orders",
    name: "Orders",
    component: () => import("../views/Orders.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/order/:id",
    name: "OrderDetail",
    component: () => import("../views/OrderDetail.vue"),
    meta: { requiresAuth: true, showBackButton: true },
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("../views/Login.vue"),
    meta: { requiresAuth: false, showBackButton: false },
  },
  {
    path: "/delivery-map",
    name: "DeliveryMap",
    component: () => import("../views/DeliveryMap.vue"),
    meta: { requiresAuth: false, showBackButton: true },
  },
  {
    path: "/pickup-map",
    name: "PickupMap",
    component: () => import("../views/PickupMap.vue"),
    meta: { requiresAuth: false, showBackButton: true },
  },
];
const router = createRouter({
  history: createWebHistory(),
  routes,
});
let backButtonCleanup = null;
let isRedirecting = false;
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const locationStore = useLocationStore();
  if (backButtonCleanup) {
    backButtonCleanup();
    backButtonCleanup = null;
  }
  if (isRedirecting) {
    isRedirecting = false;
    return next();
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
    if (!locationStore.selectedCity && to.name !== "DeliveryMap" && to.name !== "PickupMap" && to.name !== "DeliveryAddressDetails") {
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
        router.back();
      });
    } else {
      hideBackButton();
    }
  } else {
    hideBackButton();
  }
});
export default router;
