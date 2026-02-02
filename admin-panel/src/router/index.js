import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import { useOrdersStore } from "../stores/orders.js";
import AdminLayout from "../layouts/AdminLayout.vue";
import ShiftLayout from "../layouts/ShiftLayout.vue";
import Login from "../views/Login.vue";
import Dashboard from "../views/Dashboard.vue";
import Orders from "../views/Orders.vue";
import ShiftPage from "../views/ShiftPage.vue";
import Clients from "../views/Clients.vue";
import ClientDetail from "../views/ClientDetail.vue";
import Cities from "../views/Cities.vue";
import CityForm from "../views/CityForm.vue";
import Branches from "../views/Branches.vue";
import BranchForm from "../views/BranchForm.vue";
import DeliveryZones from "../views/DeliveryZones.vue";
import DeliveryZoneEditor from "../views/DeliveryZoneEditor.vue";
import MenuCategories from "../views/MenuCategories.vue";
import MenuItems from "../views/MenuItems.vue";
import MenuItemForm from "../views/MenuItemForm.vue";
import MenuModifiers from "../views/MenuModifiers.vue";
import MenuTags from "../views/MenuTags.vue";
import MenuStopList from "../views/MenuStopList.vue";
import SystemSettings from "../views/SystemSettings.vue";
import AdminUsers from "../views/AdminUsers.vue";
import AdminLogs from "../views/AdminLogs.vue";
import OrderDetail from "../views/OrderDetail.vue";
import Broadcasts from "../views/Broadcasts.vue";
import BroadcastForm from "../views/BroadcastForm.vue";
import BroadcastDetail from "../views/BroadcastDetail.vue";
import BroadcastSegments from "../views/BroadcastSegments.vue";
import BroadcastDashboard from "../views/BroadcastDashboard.vue";
import NotFound from "../views/NotFound.vue";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: Login, meta: { public: true } },
    {
      path: "/shift",
      component: ShiftLayout,
      meta: { requiresAuth: true, fullBleed: true },
      children: [{ path: "", name: "shift-page", component: ShiftPage, meta: { title: "Текущая смена", fullBleed: true } }],
    },
    {
      path: "/",
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/dashboard" },
        { path: "dashboard", name: "dashboard", component: Dashboard, meta: { title: "Панель управления", subtitle: "Статистика и обзор" } },
        { path: "orders", name: "orders", component: Orders, meta: { title: "Заказы", subtitle: "Реальные заявки и статусы" } },
        {
          path: "orders/:id",
          name: "order-detail",
          component: OrderDetail,
          meta: {
            title: "Детали заказа",
            subtitle: "Подробная информация",
            breadcrumbs: [{ label: "Заказы", to: "/orders" }, { label: "Детали заказа" }],
          },
        },
        {
          path: "clients",
          name: "clients",
          component: Clients,
          meta: { title: "Клиенты", subtitle: "Контакты и лояльность", roles: ["admin", "ceo"] },
        },
        {
          path: "clients/:id",
          name: "client-detail",
          component: ClientDetail,
          meta: {
            title: "Клиент",
            subtitle: "Данные и история",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Клиенты", to: "/clients" }, { label: "Клиент" }],
          },
        },
        {
          path: "cities",
          name: "cities",
          component: Cities,
          meta: { title: "Города", subtitle: "Управление городами доставки", roles: ["admin", "ceo"] },
        },
        {
          path: "cities/new",
          name: "city-new",
          component: CityForm,
          meta: {
            title: "Новый город",
            subtitle: "Создание города",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Города", to: "/cities" }, { label: "Новый город" }],
          },
        },
        {
          path: "cities/:id",
          name: "city-edit",
          component: CityForm,
          meta: {
            title: "Редактирование города",
            subtitle: "Изменение города",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Города", to: "/cities" }, { label: "Редактирование" }],
          },
        },
        {
          path: "branches",
          name: "branches",
          component: Branches,
          meta: { title: "Филиалы", subtitle: "Рестораны и точки самовывоза", roles: ["admin", "ceo"] },
        },
        {
          path: "branches/new",
          name: "branch-new",
          component: BranchForm,
          meta: {
            title: "Новый филиал",
            subtitle: "Создание филиала",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Филиалы", to: "/branches" }, { label: "Новый филиал" }],
          },
        },
        {
          path: "branches/:id",
          name: "branch-edit",
          component: BranchForm,
          meta: {
            title: "Редактирование филиала",
            subtitle: "Изменение филиала",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Филиалы", to: "/branches" }, { label: "Редактирование" }],
          },
        },
        {
          path: "delivery-zones",
          name: "delivery-zones",
          component: DeliveryZones,
          meta: { title: "Зоны доставки", subtitle: "Полигоны на карте", sidebarCollapsed: true, fullBleed: true },
        },
        {
          path: "delivery-zones/:branchId/:polygonId",
          name: "delivery-zone-editor",
          component: DeliveryZoneEditor,
          meta: { title: "Полигон доставки", subtitle: "Редактирование зоны", sidebarCollapsed: true, fullBleed: true },
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
          meta: {
            title: "Позиция меню",
            subtitle: "Создание и редактирование",
            breadcrumbs: [{ label: "Позиции", to: "/menu/items" }, { label: "Позиция меню" }],
          },
        },
        { path: "menu/modifiers", name: "menu-modifiers", component: MenuModifiers, meta: { title: "Модификаторы", subtitle: "Группы и допы" } },
        { path: "menu/tags", name: "menu-tags", component: MenuTags, meta: { title: "Теги", subtitle: "Метки для фильтрации блюд" } },
        { path: "menu/stop-list", name: "menu-stop-list", component: MenuStopList, meta: { title: "Стоп-лист", subtitle: "Недоступные позиции" } },
        {
          path: "broadcasts",
          name: "broadcasts",
          component: Broadcasts,
          meta: { title: "Рассылки", subtitle: "Маркетинговые кампании", breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }] },
        },
        {
          path: "broadcasts/new",
          name: "broadcast-new",
          component: BroadcastForm,
          meta: {
            title: "Новая рассылка",
            subtitle: "Создание кампании",
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Новая рассылка" }],
          },
        },
        {
          path: "broadcasts/:id/edit",
          name: "broadcast-edit",
          component: BroadcastForm,
          meta: {
            title: "Редактирование рассылки",
            subtitle: "Настройка кампании",
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Редактирование" }],
          },
        },
        {
          path: "broadcasts/:id",
          name: "broadcast-detail",
          component: BroadcastDetail,
          meta: {
            title: "Статистика рассылки",
            subtitle: "Детальный отчет",
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Статистика" }],
          },
        },
        {
          path: "broadcasts/segments",
          name: "broadcast-segments",
          component: BroadcastSegments,
          meta: {
            title: "Сегменты",
            subtitle: "Сохраненные аудитории",
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Сегменты" }],
          },
        },
        {
          path: "broadcasts/dashboard",
          name: "broadcast-dashboard",
          component: BroadcastDashboard,
          meta: {
            title: "Дашборд рассылок",
            subtitle: "Сводная аналитика",
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Дашборд" }],
          },
        },
        {
          path: "system/settings",
          name: "system-settings",
          component: SystemSettings,
          meta: { title: "Настройки системы", subtitle: "Модули и функциональные блоки", roles: ["admin", "ceo"] },
        },
        {
          path: "admin-users",
          name: "admin-users",
          component: AdminUsers,
          meta: { title: "Администраторы", subtitle: "Управление пользователями админ-панели", roles: ["admin", "ceo"] },
        },
        {
          path: "logs",
          name: "admin-logs",
          component: AdminLogs,
          meta: { title: "Логи", subtitle: "Журнал действий администраторов", roles: ["admin", "ceo"] },
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
  if (to.meta.roles && authStore.role && !to.meta.roles.includes(authStore.role)) {
    return { name: "orders" };
  }
  return true;
});
router.afterEach((to) => {
  const ordersStore = useOrdersStore();
  const baseTitle = to.meta?.title || "Админ-панель";
  const count = ordersStore?.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
});
export default router;
