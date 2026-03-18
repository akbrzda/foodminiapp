import { PLATFORM_IDS, createNoopBridge } from "@/shared/platform/bridge.js";
import { devWarn } from "@/shared/utils/logger.js";

const resolveMaxWebApp = () => {
  if (typeof window === "undefined") return null;
  const namespacedWebApp = window.MAX?.WebApp || window.Max?.WebApp || null;
  if (namespacedWebApp) {
    return namespacedWebApp;
  }

  const hasTelegramContext = Boolean(
    String(window.Telegram?.WebApp?.initData || "").trim() ||
      String(window.Telegram?.WebApp?.initDataUnsafe?.query_id || "").trim() ||
      window.Telegram?.WebApp?.initDataUnsafe?.user
  );

  if (hasTelegramContext) {
    return null;
  }

  return window.WebApp || null;
};

const resolveInitDataFromQuery = () => {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return String(
    params.get("initData") || params.get("webAppData") || params.get("webapp_data") || ""
  );
};

const invokeMaxSdkMethod = (label, fn) => {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      result.catch((error) => {
        devWarn(`MAX SDK ${label} rejected:`, error);
      });
    }
    return result;
  } catch (error) {
    devWarn(`MAX SDK ${label} failed:`, error);
    return null;
  }
};

const resolveRawMaxInitData = () => {
  if (typeof window === "undefined") return "";
  const webApp = resolveMaxWebApp();
  const fromWebApp = String(webApp?.InitData || webApp?.initData || "");
  const fromGlobal = String(window.WebAppData || window.MAX?.WebAppData || window.Max?.WebAppData || "");
  const fromQuery = resolveInitDataFromQuery();

  if (fromWebApp) {
    return fromWebApp;
  }

  if (fromGlobal) {
    return fromGlobal;
  }

  return fromQuery;
};

const toSafeUser = (user) => {
  if (!user || typeof user !== "object") return null;
  return {
    id: user.id ?? null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    username: user.username || null,
    language_code: user.language_code || null,
  };
};

const requestContactWithFallback = async (webApp, timeoutMs = 10000) => {
  if (!webApp || typeof webApp.requestContact !== "function") {
    return null;
  }

  const CONTACT_EVENT_NAMES = [
    "contactRequested",
    "contact_requested",
    "phoneRequested",
    "phone_requested",
    "custom_method_invoked",
    "web_app_method_invoked",
    "WebAppRequestPhone",
  ];

  return new Promise((resolve) => {
    let isResolved = false;
    const timeoutId = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      if (typeof webApp.offEvent === "function") {
        CONTACT_EVENT_NAMES.forEach((eventName) => {
          webApp.offEvent(eventName, onContactRequested);
          webApp.offEvent(eventName, onCustomMethodInvoked);
        });
      }
      resolve(null);
    }, timeoutMs);

    const finish = (source, phone) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timeoutId);
      if (typeof webApp.offEvent === "function") {
        CONTACT_EVENT_NAMES.forEach((eventName) => {
          webApp.offEvent(eventName, onContactRequested);
          webApp.offEvent(eventName, onCustomMethodInvoked);
        });
      }
      resolve(phone || null);
    };

    const onContactRequested = (payload) => {
      const phone =
        payload?.phone_number ||
        payload?.contact?.phone_number ||
        payload?.responseUnsafe?.contact?.phone_number ||
        null;
      finish("event:contactRequested", phone);
    };

    const onCustomMethodInvoked = (payload) => {
      const result = payload?.result;
      if (!result) return;

      try {
        if (typeof result === "object") {
          const phone =
            result?.phone_number ||
            result?.contact?.phone_number ||
            result?.responseUnsafe?.contact?.phone_number ||
            null;
          if (phone) {
            finish("event:custom_method_invoked:object", phone);
            return;
          }
        }

        const decodedResult = decodeURIComponent(String(result));
        const params = new URLSearchParams(decodedResult);
        const contactRaw = params.get("contact");
        if (!contactRaw) return;
        const contact = JSON.parse(contactRaw);
        finish("event:custom_method_invoked:params", contact?.phone_number || null);
      } catch (_error) {}
    };

    try {
      if (typeof webApp.onEvent === "function") {
        CONTACT_EVENT_NAMES.forEach((eventName) => {
          webApp.onEvent(eventName, onContactRequested);
          webApp.onEvent(eventName, onCustomMethodInvoked);
        });
      }

      const directResult = webApp.requestContact((payload) => {
        const phone =
          payload?.phone_number ||
          payload?.contact?.phone_number ||
          payload?.responseUnsafe?.contact?.phone_number ||
          null;
        finish("callback", phone);
      });

      const directPhone =
        (typeof directResult === "string" ? directResult : null) ||
        directResult?.phone ||
        directResult?.phone_number ||
        directResult?.contact?.phone_number ||
        null;
      if (directPhone) {
        finish("direct-return", directPhone);
      }

      if (directResult && typeof directResult.then === "function") {
        directResult
          .then((resolved) => {
            const phone =
              (typeof resolved === "string" ? resolved : null) ||
              resolved?.phone ||
              resolved?.phone_number ||
              resolved?.contact?.phone_number ||
              resolved?.responseUnsafe?.contact?.phone_number ||
              null;
            if (phone) {
              finish("direct-promise", phone);
              return;
            }
          })
          .catch(() => {});
      }
    } catch (error) {
      devWarn("MAX requestContact завершился ошибкой:", error);
      finish("exception", null);
    }
  });
};

const buildMaxBridge = () => ({
  platform: PLATFORM_IDS.MAX,
  init() {
    const webApp = resolveMaxWebApp();
    if (!webApp) {
      return null;
    }
    if (typeof webApp.ready === "function") {
      invokeMaxSdkMethod("ready", () => webApp.ready());
    }
    if (typeof webApp.expand === "function") {
      invokeMaxSdkMethod("expand", () => webApp.expand());
    }
    return webApp;
  },
  getInitData() {
    return resolveRawMaxInitData();
  },
  getUser() {
    const webApp = resolveMaxWebApp();
    return toSafeUser(webApp?.InitDataUnsafe?.user || webApp?.initDataUnsafe?.user || null);
  },
  showBackButton(handler) {
    const webApp = resolveMaxWebApp();
    const backButton = webApp?.BackButton;
    if (!backButton || typeof backButton.show !== "function") {
      return () => {};
    }

    invokeMaxSdkMethod("BackButton.show", () => backButton.show());

    if (typeof handler !== "function") {
      return () => {
        invokeMaxSdkMethod("BackButton.hide", () => backButton.hide?.());
      };
    }

    if (typeof backButton.onClick === "function") {
      invokeMaxSdkMethod("BackButton.onClick", () => backButton.onClick(handler));
    }

    const eventNames = ["back_button_pressed", "backButtonClicked", "back_button_clicked"];
    if (typeof webApp?.onEvent === "function") {
      eventNames.forEach((eventName) => {
        invokeMaxSdkMethod(`onEvent:${eventName}`, () => webApp.onEvent(eventName, handler));
      });
    }

    return () => {
      if (typeof backButton.offClick === "function") {
        invokeMaxSdkMethod("BackButton.offClick", () => backButton.offClick(handler));
      }
      if (typeof webApp?.offEvent === "function") {
        eventNames.forEach((eventName) => {
          invokeMaxSdkMethod(`offEvent:${eventName}`, () => webApp.offEvent(eventName, handler));
        });
      }
      invokeMaxSdkMethod("BackButton.hide", () => backButton.hide?.());
    };
  },
  hideBackButton() {
    const webApp = resolveMaxWebApp();
    webApp?.BackButton?.hide?.();
  },
  setMainButton({ text, isVisible = true, color, textColor, onClick } = {}) {
    const webApp = resolveMaxWebApp();
    const mainButton = webApp?.MainButton;
    if (!mainButton) {
      return () => {};
    }
    if (text && typeof mainButton.setText === "function") {
      mainButton.setText(text);
    }
    if ((color || textColor) && typeof mainButton.setParams === "function") {
      mainButton.setParams({ color, text_color: textColor });
    }
    if (isVisible) {
      mainButton.show?.();
    } else {
      mainButton.hide?.();
    }
    if (typeof onClick !== "function") {
      return () => {};
    }
    mainButton.onClick?.(onClick);
    return () => {
      mainButton.offClick?.(onClick);
    };
  },
  hideMainButton() {
    const webApp = resolveMaxWebApp();
    webApp?.MainButton?.hide?.();
  },
  hapticFeedback(style = "light") {
    const webApp = resolveMaxWebApp();
    const haptic = webApp?.HapticFeedback;
    if (!haptic) return;

    const impactStyles = new Set(["light", "medium", "heavy", "rigid", "soft"]);
    if (impactStyles.has(style) && typeof haptic.impactOccurred === "function") {
      invokeMaxSdkMethod("HapticFeedback.impactOccurred", () => haptic.impactOccurred(style));
      return;
    }

    if (typeof haptic.notificationOccurred === "function") {
      invokeMaxSdkMethod("HapticFeedback.notificationOccurred", () => haptic.notificationOccurred(style));
    }
  },
  requestContact({ timeoutMs = 10000 } = {}) {
    const webApp = resolveMaxWebApp();
    return requestContactWithFallback(webApp, timeoutMs);
  },
  storage: {
    get(key) {
      const webApp = resolveMaxWebApp();
      if (!webApp?.CloudStorage?.getItem) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        webApp.CloudStorage.getItem(key, (error, value) => {
          if (error) {
            devWarn("MAX CloudStorage.getItem ошибка:", error);
            resolve(null);
            return;
          }
          resolve(value || null);
        });
      });
    },
    set(key, value) {
      const webApp = resolveMaxWebApp();
      if (!webApp?.CloudStorage?.setItem) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        webApp.CloudStorage.setItem(key, value, (error) => {
          if (error) {
            devWarn("MAX CloudStorage.setItem ошибка:", error);
          }
          resolve(!error);
        });
      });
    },
    remove(key) {
      const webApp = resolveMaxWebApp();
      if (!webApp?.CloudStorage?.removeItem) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        webApp.CloudStorage.removeItem(key, (error) => {
          if (error) {
            devWarn("MAX CloudStorage.removeItem ошибка:", error);
          }
          resolve(!error);
        });
      });
    },
  },
  openLink(url) {
    if (!url) return;
    const webApp = resolveMaxWebApp();
    if (typeof webApp?.openLink === "function") {
      webApp.openLink(url);
      return;
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  },
});

const noopBridge = createNoopBridge(PLATFORM_IDS.MAX);

export const maxBridge = {
  ...noopBridge,
  ...buildMaxBridge(),
};
