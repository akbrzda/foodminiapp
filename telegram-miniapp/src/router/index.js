import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useLocationStore } from "../stores/location";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/Home.vue"),
    meta: { requiresAuth: true, requiresCity: true },
  },
  {
    path: "/menu",
    name: "Menu",
    component: () => import("../views/Menu.vue"),
    meta: { requiresAuth: true, requiresCity: true },
  },
  {
    path: "/cart",
    name: "Cart",
    component: () => import("../views/Cart.vue"),
    meta: { requiresAuth: true },
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
    path: "/select-city",
    name: "SelectCity",
    component: () => import("../views/SelectCity.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/select-branch",
    name: "SelectBranch",
    component: () => import("../views/SelectBranch.vue"),
    meta: { requiresAuth: true },
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
    return next("/");
  }

  // Проверка выбора города
  if (to.meta.requiresCity && !locationStore.hasCitySelected) {
    return next("/select-city");
  }

  next();
});

export default router;
