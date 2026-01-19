import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import AdminLayout from "../layouts/AdminLayout.vue";
import Login from "../views/Login.vue";
import Dashboard from "../views/Dashboard.vue";
import Orders from "../views/Orders.vue";
import Clients from "../views/Clients.vue";
import ClientDetail from "../views/ClientDetail.vue";
import Cities from "../views/Cities.vue";
import Branches from "../views/Branches.vue";
import DeliveryZones from "../views/DeliveryZones.vue";
import DeliveryZoneEditor from "../views/DeliveryZoneEditor.vue";
import MenuCategories from "../views/MenuCategories.vue";
import MenuItems from "../views/MenuItems.vue";
import MenuItemForm from "../views/MenuItemForm.vue";
import MenuModifiers from "../views/MenuModifiers.vue";
import MenuTags from "../views/MenuTags.vue";
import MenuStopList from "../views/MenuStopList.vue";
import MenuSettings from "../views/MenuSettings.vue";
import AdminUsers from "../views/AdminUsers.vue";
import AdminLogs from "../views/AdminLogs.vue";
import OrderDetail from "../views/OrderDetail.vue";
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
        { path: "", redirect: "/dashboard" },
        { path: "dashboard", name: "dashboard", component: Dashboard, meta: { title: "Панель управления", subtitle: "Статистика и обзор" } },
        { path: "orders", name: "orders", component: Orders, meta: { title: "Заказы", subtitle: "Реальные заявки и статусы" } },
        { path: "orders/:id", name: "order-detail", component: OrderDetail, meta: { title: "Детали заказа", subtitle: "Подробная информация" } },
        { path: "clients", name: "clients", component: Clients, meta: { title: "Клиенты", subtitle: "Контакты и лояльность" } },
        { path: "clients/:id", name: "client-detail", component: ClientDetail, meta: { title: "Клиент", subtitle: "Данные и история" } },
        { path: "cities", name: "cities", component: Cities, meta: { title: "Города", subtitle: "Управление городами доставки" } },
        { path: "branches", name: "branches", component: Branches, meta: { title: "Филиалы", subtitle: "Рестораны и точки самовывоза" } },
        { path: "delivery-zones", name: "delivery-zones", component: DeliveryZones, meta: { title: "Зоны доставки", subtitle: "Полигоны на карте" } },
        {
          path: "delivery-zones/:branchId/:polygonId",
          name: "delivery-zone-editor",
          component: DeliveryZoneEditor,
          meta: { title: "Полигон доставки", subtitle: "Редактирование зоны" },
        },
        {
          path: "menu/categories",
          name: "menu-categories",
          component: MenuCategories,
          meta: { title: "Категории", subtitle: "Структура меню по городам" },
        },
        { path: "menu/items", name: "menu-items", component: MenuItems, meta: { title: "Позиции", subtitle: "Карточки блюд и варианты" } },
        {
          path: "menu/items/:id",
          name: "menu-item-form",
          component: MenuItemForm,
          meta: { title: "Позиция меню", subtitle: "Создание и редактирование" },
        },
        { path: "menu/modifiers", name: "menu-modifiers", component: MenuModifiers, meta: { title: "Модификаторы", subtitle: "Группы и допы" } },
        { path: "menu/tags", name: "menu-tags", component: MenuTags, meta: { title: "Теги", subtitle: "Метки для фильтрации блюд" } },
        { path: "menu/stop-list", name: "menu-stop-list", component: MenuStopList, meta: { title: "Стоп-лист", subtitle: "Недоступные позиции" } },
        { path: "menu/settings", name: "menu-settings", component: MenuSettings, meta: { title: "Настройки меню", subtitle: "Причины стоп-листа" } },
        {
          path: "admin-users",
          name: "admin-users",
          component: AdminUsers,
          meta: { title: "Администраторы", subtitle: "Управление пользователями админ-панели" },
        },
        {
          path: "logs",
          name: "admin-logs",
          component: AdminLogs,
          meta: { title: "Логи", subtitle: "Журнал действий администраторов" },
        },
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
