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
    path: "/delivery-address",
    name: "DeliveryAddressDetails",
    component: () => import("../views/DeliveryAddressDetails.vue"),
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

// Navigation guards
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const locationStore = useLocationStore();

  // Очищаем предыдущую кнопку назад
  if (backButtonCleanup) {
    backButtonCleanup();
    backButtonCleanup = null;
  }

  // Защита от бесконечных редиректов
  if (isRedirecting) {
    isRedirecting = false;
    return next();
  }

  // Проверка авторизации
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next("/login");
  }

  // Если уже авторизован и идет на логин - редирект на главную
  if (to.name === "Login" && authStore.isAuthenticated) {
    // Проверяем, выбран ли город
    if (!locationStore.selectedCity) {
      // Используем replace вместо push, чтобы избежать бесконечного цикла
      isRedirecting = true;
      return next({ path: "/", query: { openCity: "1" }, replace: true });
    }
    isRedirecting = true;
    return next({ path: "/", replace: true });
  }

  // Проверка выбора города для страниц, требующих местоположение
  // Исключаем главную страницу с параметром openCity, чтобы избежать бесконечного цикла
  if (to.meta.requiresLocation && authStore.isAuthenticated) {
    // Если это главная страница с параметром openCity, разрешаем доступ без города
    if (to.name === "Home" && to.query?.openCity === "1") {
      return next();
    }

    // Для остальных страниц проверяем наличие города
    if (!locationStore.selectedCity && to.name !== "DeliveryMap" && to.name !== "PickupMap" && to.name !== "DeliveryAddressDetails") {
      // Если мы уже на главной с openCity, не делаем редирект
      if (from.name === "Home" && from.query?.openCity === "1") {
        return next();
      }
      // Если мы уже редиректим на главную с openCity, не делаем повторный редирект
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
  // Управление нативной кнопкой назад Telegram
  // На десктопе нативная кнопка не работает, используем UI кнопку в PageHeader
  if (!isDesktop()) {
    if (to.meta.showBackButton) {
      backButtonCleanup = showBackButton(() => {
        router.back();
      });
    } else {
      hideBackButton();
    }
  } else {
    // На десктопе скрываем нативную кнопку, если она была показана
    hideBackButton();
  }
});

export default router;
