import { devWarn } from "@/shared/utils/logger.js";
import {
  getWebApp,
  isVersionAtLeast,
  warnMissingWebAppContext,
} from "@/shared/services/telegram/telegram-client.js";

const safeInvoke = (label, fn) => {
  try {
    fn();
  } catch (error) {
    devWarn(`Telegram API ошибка (${label}):`, error);
  }
};

export const ensureReady = () => {
  const webApp = getWebApp();
  if (!webApp) {
    warnMissingWebAppContext();
    return null;
  }

  safeInvoke("ready", () => webApp.ready());
  safeInvoke("expand", () => webApp.expand());

  return webApp;
};

export const initializeTelegramSession = () => {
  const webApp = ensureReady();
  if (!webApp) {
    return {
      webApp: null,
      user: null,
      initData: "",
      startParam: null,
    };
  }

  if (isVersionAtLeast(webApp, "6.1")) {
    safeInvoke("setHeaderColor", () => {
      if (typeof webApp.setHeaderColor === "function") {
        webApp.setHeaderColor("#FFFFFF");
      }
    });

    safeInvoke("setBackgroundColor", () => {
      if (typeof webApp.setBackgroundColor === "function") {
        webApp.setBackgroundColor("#FFFFFF");
      }
    });

    safeInvoke("disableVerticalSwipes", () => {
      if (typeof webApp.disableVerticalSwipes === "function") {
        webApp.disableVerticalSwipes();
      }
    });
  }

  if (isVersionAtLeast(webApp, "6.2")) {
    safeInvoke("disableClosingConfirmation", () => {
      if (typeof webApp.disableClosingConfirmation === "function") {
        webApp.disableClosingConfirmation();
      }
    });
  }

  return {
    webApp,
    user: webApp.initDataUnsafe?.user || null,
    initData: webApp.initData || "",
    startParam: webApp.initDataUnsafe?.start_param || null,
  };
};

export const getInitData = () => getWebApp()?.initData || "";

export const getStartParam = () => getWebApp()?.initDataUnsafe?.start_param || "";

export const getTelegramUser = () => getWebApp()?.initDataUnsafe?.user || null;

export const getColorScheme = () => "light";

export const getCloudStorageItem = (key) => {
  const webApp = getWebApp();
  if (!webApp?.CloudStorage?.getItem) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    webApp.CloudStorage.getItem(key, (error, value) => {
      if (error) {
        devWarn("Ошибка чтения Telegram CloudStorage:", error);
        resolve(null);
        return;
      }
      resolve(value || null);
    });
  });
};

export const setCloudStorageItem = (key, value) => {
  const webApp = getWebApp();
  if (!webApp?.CloudStorage?.setItem) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    webApp.CloudStorage.setItem(key, value, (error) => {
      if (error) {
        devWarn("Ошибка записи Telegram CloudStorage:", error);
      }
      resolve(!error);
    });
  });
};

export const removeCloudStorageItem = (key) => {
  const webApp = getWebApp();
  if (!webApp?.CloudStorage?.removeItem) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    webApp.CloudStorage.removeItem(key, (error) => {
      if (error) {
        devWarn("Ошибка удаления Telegram CloudStorage:", error);
      }
      resolve(!error);
    });
  });
};
