export const shiftRoute = {
  path: "/shift",
  component: () => import("@/shared/layouts/ShiftLayout.vue"),
  meta: { requiresAuth: true, fullBleed: true },
  children: [
    {
      path: "",
      name: "shift-page",
      component: () => import("@/modules/orders/views/ShiftPage.vue"),
      meta: { title: "Текущая смена", fullBleed: true, permissions: ["orders.view"] },
    },
  ],
};

export const ordersRoutes = [
  {
    path: "orders",
    name: "orders",
    component: () => import("@/modules/orders/views/Orders.vue"),
    meta: {
      title: "Заказы",
      subtitle: "Реальные заявки и статусы",
      permissions: ["orders.view"],
      isList: true,
      listName: "orders",
    },
  },
  {
    path: "orders/:id",
    name: "order-detail",
    component: () => import("@/modules/orders/views/OrderDetail.vue"),
    meta: {
      title: "Детали заказа",
      subtitle: "Подробная информация",
      permissions: ["orders.view"],
      breadcrumbs: [{ label: "Заказы", to: "/orders" }, { label: "Детали заказа" }],
      isDetail: true,
      parentList: "orders",
    },
  },
];
