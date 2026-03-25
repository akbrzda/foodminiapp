import { SESSION_STORAGE_KEYS } from "@/shared/constants/storage-keys.js";
import {
  readSessionString,
  removeSessionItem,
  writeSessionString,
} from "@/shared/services/storage/web-storage.js";

const HOME_ROUTE_NAME = "Home";
const ITEM_DETAIL_ROUTE_NAME = "ItemDetail";

const hasQueryValue = (value) => {
  if (Array.isArray(value)) {
    return value.some((item) => String(item || "").trim().length > 0);
  }
  return String(value || "").trim().length > 0;
};

const getCurrentScrollY = () => {
  if (typeof window === "undefined") {
    return 0;
  }

  const windowScrollY = Number(window.scrollY ?? window.pageYOffset ?? 0);
  if (Number.isFinite(windowScrollY) && windowScrollY > 0) {
    return windowScrollY;
  }

  const scrollingElement = document.scrollingElement || document.documentElement || document.body;
  const elementScrollTop = Number(scrollingElement?.scrollTop ?? 0);

  if (Number.isFinite(elementScrollTop) && elementScrollTop > 0) {
    return elementScrollTop;
  }

  return 0;
};

const saveHomeScrollY = () => {
  const scrollY = getCurrentScrollY();
  writeSessionString(SESSION_STORAGE_KEYS.HOME_SCROLL_Y_BEFORE_ITEM_DETAIL, String(scrollY));
};

const consumeHomeScrollY = () => {
  const raw = readSessionString(SESSION_STORAGE_KEYS.HOME_SCROLL_Y_BEFORE_ITEM_DETAIL, "");
  if (!raw) {
    return null;
  }

  removeSessionItem(SESSION_STORAGE_KEYS.HOME_SCROLL_Y_BEFORE_ITEM_DETAIL);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

export const createScrollBehavior = () => {
  return (to, from, savedPosition) => {
    if (to.name === HOME_ROUTE_NAME && from.name === HOME_ROUTE_NAME && hasQueryValue(to.query?.category_id)) {
      // Для CTA из сторис скролл к категории выполняется вручную в Home.vue.
      // Возвращаем false, чтобы роутер не перетирал его своим top=0.
      return false;
    }

    if (to.name === ITEM_DETAIL_ROUTE_NAME) {
      return { top: 0, left: 0 };
    }

    if (to.name === HOME_ROUTE_NAME && from.name === ITEM_DETAIL_ROUTE_NAME) {
      const homeScrollY = consumeHomeScrollY();

      if (homeScrollY !== null) {
        return new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve({ top: homeScrollY, left: 0 });
            });
          });
        });
      }
    }

    if (savedPosition) {
      return savedPosition;
    }

    return { top: 0, left: 0 };
  };
};

export const registerScrollRestoreGuard = (router) => {
  router.beforeEach((to, from, next) => {
    if (from.name === HOME_ROUTE_NAME && to.name === ITEM_DETAIL_ROUTE_NAME) {
      saveHomeScrollY();
    }

    next();
  });
};
