import { hideBackButton, isDesktop, showBackButton } from "@/shared/services/telegram.js";

const resolveBackFallback = (route) => {
  if (route?.name === "OrderDetail") {
    return "/orders";
  }

  return "/";
};

const navigateBackWithFallback = (router, route) => {
  if (typeof window !== "undefined" && window.history.state?.back) {
    router.back();
    return;
  }

  router.replace(resolveBackFallback(route));
};

export const registerTelegramBackButtonGuard = (router) => {
  let backButtonCleanup = null;

  router.beforeEach((_, __, next) => {
    if (backButtonCleanup) {
      backButtonCleanup();
      backButtonCleanup = null;
    }

    next();
  });

  router.afterEach((to) => {
    if (!isDesktop()) {
      if (to.meta.showBackButton) {
        backButtonCleanup = showBackButton(() => {
          navigateBackWithFallback(router, to);
        });
      } else {
        hideBackButton();
      }
      return;
    }

    hideBackButton();
  });
};
