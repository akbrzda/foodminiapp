import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { useNavigationContextStore } from "@/shared/stores/navigationContext.js";
import AdminLayout from "@/shared/layouts/AdminLayout.vue";
import ShiftLayout from "@/shared/layouts/ShiftLayout.vue";
import Login from "@/modules/auth/views/Login.vue";
import Dashboard from "@/modules/dashboard/views/Dashboard.vue";
import Orders from "@/modules/orders/views/Orders.vue";
import ShiftPage from "@/modules/orders/views/ShiftPage.vue";
import Clients from "@/modules/clients/views/Clients.vue";
import ClientDetail from "@/modules/clients/views/ClientDetail.vue";
import Cities from "@/modules/delivery/views/Cities.vue";
import CityForm from "@/modules/delivery/views/CityForm.vue";
import Branches from "@/modules/delivery/views/Branches.vue";
import BranchForm from "@/modules/delivery/views/BranchForm.vue";
import DeliveryZones from "@/modules/delivery/views/DeliveryZones.vue";
import DeliveryZoneEditor from "@/modules/delivery/views/DeliveryZoneEditor.vue";
import MenuCategories from "@/modules/menu/views/MenuCategories.vue";
import MenuProducts from "@/modules/menu/views/MenuProducts.vue";
import MenuProductForm from "@/modules/menu/views/MenuProductForm.vue";
import MenuModifiers from "@/modules/menu/views/MenuModifiers.vue";
import MenuTags from "@/modules/menu/views/MenuTags.vue";
import MenuStopList from "@/modules/menu/views/MenuStopList.vue";
import SystemSettings from "@/modules/system/views/SystemSettings.vue";
import IntegrationsSettings from "@/modules/system/views/IntegrationsSettings.vue";
import AdminUsers from "@/modules/admin/views/AdminUsers.vue";
import AdminLogs from "@/modules/admin/views/AdminLogs.vue";
import OrderDetail from "@/modules/orders/views/OrderDetail.vue";
import Broadcasts from "@/modules/broadcasts/views/Broadcasts.vue";
import BroadcastForm from "@/modules/broadcasts/views/BroadcastForm.vue";
import BroadcastDetail from "@/modules/broadcasts/views/BroadcastDetail.vue";
import BroadcastSegments from "@/modules/broadcasts/views/BroadcastSegments.vue";
import BroadcastDashboard from "@/modules/broadcasts/views/BroadcastDashboard.vue";
import NotFound from "@/shared/components/NotFound.vue";
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    // Если возвращаемся на список с сохраненным контекстом - не трогаем скролл
    if (to.meta.isList && to.meta.listName) {
      const navigationStore = useNavigationContextStore();
      if (navigationStore.shouldRestore(to.meta.listName)) {
        return false; // Компонент восстановит скролл сам
      }
    }

    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0 };
  },
  routes: [
    { path: "/login", name: "login", component: Login, meta: { public: true } },
    {
      path: "/shift",
      component: ShiftLayout,
      meta: { requiresAuth: true, fullBleed: true },
      children: [
        {
          path: "",
          name: "shift-page",
          component: ShiftPage,
          meta: { title: "Текущая смена", fullBleed: true, roles: ["admin", "ceo", "manager"] },
        },
      ],
    },
    {
      path: "/",
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/dashboard" },
        {
          path: "dashboard",
          name: "dashboard",
          component: Dashboard,
          meta: { title: "Панель управления", subtitle: "Статистика и обзор", roles: ["admin", "ceo", "manager"] },
        },
        {
          path: "orders",
          name: "orders",
          component: Orders,
          meta: {
            title: "Заказы",
            subtitle: "Реальные заявки и статусы",
            roles: ["admin", "ceo", "manager"],
            isList: true,
            listName: "orders",
          },
        },
        {
          path: "orders/:id",
          name: "order-detail",
          component: OrderDetail,
          meta: {
            title: "Детали заказа",
            subtitle: "Подробная информация",
            roles: ["admin", "ceo", "manager"],
            breadcrumbs: [{ label: "Заказы", to: "/orders" }, { label: "Детали заказа" }],
            isDetail: true,
            parentList: "orders",
          },
        },
        {
          path: "clients",
          name: "clients",
          component: Clients,
          meta: {
            title: "Клиенты",
            subtitle: "Контакты и лояльность",
            roles: ["admin", "ceo", "manager"],
            isList: true,
            listName: "clients",
          },
        },
        {
          path: "clients/:id",
          name: "client-detail",
          component: ClientDetail,
          meta: {
            title: "Клиент",
            subtitle: "Данные и история",
            roles: ["admin", "ceo", "manager"],
            breadcrumbs: [{ label: "Клиенты", to: "/clients" }, { label: "Клиент" }],
            isDetail: true,
            parentList: "clients",
          },
        },
        {
          path: "cities",
          name: "cities",
          component: Cities,
          meta: {
            title: "Города",
            subtitle: "Управление городами доставки",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "cities",
          },
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
            isEdit: true,
            parentList: "cities",
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
            isEdit: true,
            parentList: "cities",
          },
        },
        {
          path: "branches",
          name: "branches",
          component: Branches,
          meta: {
            title: "Филиалы",
            subtitle: "Рестораны и точки самовывоза",
            roles: ["admin", "ceo", "manager"],
            isList: true,
            listName: "branches",
          },
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
            isEdit: true,
            parentList: "branches",
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
            isEdit: true,
            parentList: "branches",
          },
        },
        {
          path: "delivery-zones",
          name: "delivery-zones",
          component: DeliveryZones,
          meta: {
            title: "Зоны доставки",
            subtitle: "Полигоны на карте",
            sidebarCollapsed: true,
            fullBleed: true,
            roles: ["admin", "ceo", "manager"],
            isList: true,
            listName: "delivery-zones",
          },
        },
        {
          path: "delivery-zones/:branchId/:polygonId",
          name: "delivery-zone-editor",
          component: DeliveryZoneEditor,
          meta: {
            title: "Полигон доставки",
            subtitle: "Редактирование зоны",
            sidebarCollapsed: true,
            fullBleed: true,
            roles: ["admin", "ceo"],
            isEdit: true,
            parentList: "delivery-zones",
          },
        },
        {
          path: "menu/categories",
          name: "menu-categories",
          component: MenuCategories,
          meta: {
            title: "Категории",
            subtitle: "Структура меню по городам",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "menu-categories",
          },
        },
        {
          path: "menu/products",
          name: "menu-products",
          component: MenuProducts,
          meta: {
            title: "Блюда",
            subtitle: "Карточки блюд и варианты",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "menu-products",
          },
        },
        {
          path: "menu/products/:id",
          name: "menu-product-form",
          component: MenuProductForm,
          meta: {
            title: "Блюдо меню",
            subtitle: "Создание и редактирование",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Блюда", to: "/menu/products" }, { label: "Блюдо меню" }],
            isEdit: true,
            parentList: "menu-products",
          },
        },
        {
          path: "menu/modifiers",
          name: "menu-modifiers",
          component: MenuModifiers,
          meta: {
            title: "Модификаторы",
            subtitle: "Группы и допы",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "menu-modifiers",
          },
        },
        {
          path: "menu/tags",
          name: "menu-tags",
          component: MenuTags,
          meta: {
            title: "Теги",
            subtitle: "Метки для фильтрации блюд",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "menu-tags",
          },
        },
        {
          path: "menu/stop-list",
          name: "menu-stop-list",
          component: MenuStopList,
          meta: {
            title: "Стоп-лист",
            subtitle: "Недоступные блюда",
            roles: ["admin", "ceo", "manager"],
            isList: true,
            listName: "menu-stop-list",
          },
        },
        {
          path: "broadcasts",
          name: "broadcasts",
          component: Broadcasts,
          meta: {
            title: "Рассылки",
            subtitle: "Маркетинговые кампании",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }],
            isList: true,
            listName: "broadcasts",
          },
        },
        {
          path: "broadcasts/new",
          name: "broadcast-new",
          component: BroadcastForm,
          meta: {
            title: "Новая рассылка",
            subtitle: "Создание кампании",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Новая рассылка" }],
            isEdit: true,
            parentList: "broadcasts",
          },
        },
        {
          path: "broadcasts/:id/edit",
          name: "broadcast-edit",
          component: BroadcastForm,
          meta: {
            title: "Редактирование рассылки",
            subtitle: "Настройка кампании",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Редактирование" }],
            isEdit: true,
            parentList: "broadcasts",
          },
        },
        {
          path: "broadcasts/:id",
          name: "broadcast-detail",
          component: BroadcastDetail,
          meta: {
            title: "Статистика рассылки",
            subtitle: "Детальный отчет",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Статистика" }],
            isDetail: true,
            parentList: "broadcasts",
          },
        },
        {
          path: "broadcasts/segments",
          name: "broadcast-segments",
          component: BroadcastSegments,
          meta: {
            title: "Сегменты",
            subtitle: "Сохраненные аудитории",
            roles: ["admin", "ceo"],
            breadcrumbs: [{ label: "Рассылки", to: "/broadcasts" }, { label: "Сегменты" }],
            isList: true,
            listName: "broadcast-segments",
          },
        },
        {
          path: "broadcasts/dashboard",
          name: "broadcast-dashboard",
          component: BroadcastDashboard,
          meta: {
            title: "Дашборд рассылок",
            subtitle: "Сводная аналитика",
            roles: ["admin", "ceo"],
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
          path: "integrations",
          name: "integrations",
          component: IntegrationsSettings,
          meta: { title: "Интеграции", subtitle: "iiko и PremiumBonus", roles: ["admin", "ceo"] },
        },
        {
          path: "admin-users",
          name: "admin-users",
          component: AdminUsers,
          meta: {
            title: "Администраторы",
            subtitle: "Управление пользователями админ-панели",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "admin-users",
          },
        },
        {
          path: "logs",
          name: "admin-logs",
          component: AdminLogs,
          meta: {
            title: "Логи",
            subtitle: "Журнал действий администраторов",
            roles: ["admin", "ceo"],
            isList: true,
            listName: "admin-logs",
          },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFound },
  ],
});
router.beforeEach(async (to, from) => {
  const authStore = useAuthStore();
  if (!authStore.sessionChecked) {
    await authStore.restoreSession();
  }

  // Проверка авторизации
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.public && authStore.isAuthenticated && to.name === "login") {
    return { name: "orders" };
  }
  if (to.meta.roles && authStore.role && !to.meta.roles.includes(authStore.role)) {
    return { name: "not-found" };
  }

  // Управление навигационным контекстом
  const navigationStore = useNavigationContextStore();

  // Сценарий A: Уходим со списка на его детальную/редактирующую страницу
  if (from.meta.isList && from.meta.listName && (to.meta.isDetail || to.meta.isEdit) && to.meta.parentList === from.meta.listName) {
    // Устанавливаем флаг ожидания возврата
    navigationStore.setReturning(from.meta.listName, true);
  }
  // Сценарий B: Возвращаемся с детальной страницы на список
  // (флаг isReturning уже установлен, компонент сам восстановит контекст)

  // Сценарий C: Любая другая навигация
  else {
    // Если уходим со списка не на его детальную страницу
    if (from.meta.isList && from.meta.listName && to.meta.parentList !== from.meta.listName) {
      navigationStore.clearContext(from.meta.listName);
    }

    // Если приходим на список не с его детальной страницы
    if (to.meta.isList && to.meta.listName && from.meta.parentList !== to.meta.listName) {
      navigationStore.clearContext(to.meta.listName);
    }
  }

  return true;
});
router.afterEach((to) => {
  const ordersStore = useOrdersStore();
  const baseTitle = to.meta?.title || "Админ-панель";
  const count = ordersStore?.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;

  // Сброс флага isReturning после восстановления контекста
  if (to.meta.isList && to.meta.listName) {
    const navigationStore = useNavigationContextStore();
    // Даем время компоненту восстановиться
    setTimeout(() => {
      navigationStore.setReturning(to.meta.listName, false);
    }, 100);
  }
});
export default router;
