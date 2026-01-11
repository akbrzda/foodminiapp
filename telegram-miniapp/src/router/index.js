import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useLocationStore } from "../stores/location";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/Home.vue"),
    meta: { requiresAuth: true, requiresLocation: true },
  },
  {
    path: "/menu",
    name: "Menu",
    component: () => import("../views/Menu.vue"),
    meta: { requiresAuth: true, requiresLocation: true },
  },
  {
    path: "/cart",
    name: "Cart",
    component: () => import("../views/Cart.vue"),
    meta: { requiresAuth: true, requiresLocation: true },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("../views/Profile.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/orders",
    name: "Orders",
    component: () => import("../views/Orders.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/order/:id",
    name: "OrderDetail",
    component: () => import("../views/OrderDetail.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("../views/Login.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/delivery-map",
    name: "DeliveryMap",
    component: () => import("../views/DeliveryMap.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/delivery-address",
    name: "DeliveryAddressDetails",
    component: () => import("../views/DeliveryAddressDetails.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/pickup-map",
    name: "PickupMap",
    component: () => import("../views/PickupMap.vue"),
    meta: { requiresAuth: false },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guards
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const locationStore = useLocationStore();

  // Проверка авторизации
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next("/login");
  }

  // Если уже авторизован и идет на логин - редирект на главную
  if (to.name === "Login" && authStore.isAuthenticated) {
    // Проверяем, выбран ли город
    if (!locationStore.selectedCity) {
      return next("/?openCity=1");
    }
    return next("/");
  }

  // Проверка выбора города для страниц, требующих местоположение
  if (to.meta.requiresLocation && authStore.isAuthenticated) {
    if (!locationStore.selectedCity && to.name !== "DeliveryMap" && to.name !== "PickupMap" && to.name !== "DeliveryAddressDetails") {
      return next("/?openCity=1");
    }
  }

  next();
});

export default router;
