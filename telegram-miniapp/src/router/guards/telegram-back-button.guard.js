import { getPlatformBridge, PLATFORM_IDS } from "@/shared/platform/index.js";

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
    const bridge = getPlatformBridge();

    if (bridge.platform === PLATFORM_IDS.WEB) {
      bridge.hideBackButton();
      return;
    }

    if (to.meta.showBackButton) {
      backButtonCleanup = bridge.showBackButton(() => {
        navigateBackWithFallback(router, to);
      });
      return;
    }

    bridge.hideBackButton();
  });
};
