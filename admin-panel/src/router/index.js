import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import AdminLayout from "../layouts/AdminLayout.vue";
import Login from "../views/Login.vue";
import Orders from "../views/Orders.vue";
import Clients from "../views/Clients.vue";
import MenuCategories from "../views/MenuCategories.vue";
import MenuItems from "../views/MenuItems.vue";
import MenuModifiers from "../views/MenuModifiers.vue";
import NotFound from "../views/NotFound.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: Login, meta: { public: true } },
    {
      path: "/",
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/orders" },
        { path: "orders", name: "orders", component: Orders, meta: { title: "Заказы", subtitle: "Реальные заявки и статусы" } },
        { path: "clients", name: "clients", component: Clients, meta: { title: "Клиенты", subtitle: "Контакты и лояльность" } },
        { path: "menu/categories", name: "menu-categories", component: MenuCategories, meta: { title: "Категории", subtitle: "Структура меню по городам" } },
        { path: "menu/items", name: "menu-items", component: MenuItems, meta: { title: "Позиции", subtitle: "Карточки блюд и варианты" } },
        { path: "menu/modifiers", name: "menu-modifiers", component: MenuModifiers, meta: { title: "Модификаторы", subtitle: "Группы и допы" } },
      ],
    },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFound },
  ],
});

router.beforeEach((to) => {
  const authStore = useAuthStore();
  const tokenValid = authStore.validateToken();
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: "login" };
  }
  if (to.meta.public && tokenValid && authStore.isAuthenticated && to.name === "login") {
    return { name: "orders" };
  }
  return true;
});

export default router;
