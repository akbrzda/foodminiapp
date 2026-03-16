import { createRouter, createWebHistory } from "vue-router";
import { createNavigationContext, registerAuthGuard } from "@/router/guards/auth.guard.js";
import { registerLocationGuard } from "@/router/guards/location.guard.js";
import {
  createScrollBehavior,
  registerScrollRestoreGuard,
} from "@/router/guards/scroll-restore.guard.js";
import { registerTelegramBackButtonGuard } from "@/router/guards/telegram-back-button.guard.js";

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
  scrollBehavior: createScrollBehavior(),
  routes,
});

const navigationContext = createNavigationContext();

registerScrollRestoreGuard(router);
registerAuthGuard(router, navigationContext);
registerLocationGuard(router, navigationContext);
registerTelegramBackButtonGuard(router);

export default router;
