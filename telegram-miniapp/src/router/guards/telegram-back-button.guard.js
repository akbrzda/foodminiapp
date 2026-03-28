import { getPlatformBridge, PLATFORM_IDS } from "@/shared/platform/index.js";

const resolveBackRoute = (route) => {
  if (route?.name === "OrderDetail") {
    return "/orders";
  }

  return "/";
};

const navigateBack = (router, route) => {
  if (typeof window !== "undefined" && window.history.state?.back) {
    router.back();
    return;
  }

  router.replace(resolveBackRoute(route));
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
        navigateBack(router, to);
      });
      return;
    }

    bridge.hideBackButton();
  });
};
