import { devLog, devWarn } from "@/shared/utils/logger.js";

let webAppInstance = null;
function resolveWebApp() {
  if (webAppInstance) {
    return webAppInstance;
  }
  if (typeof window !== "undefined" && window.Telegram?.WebApp) {
    webAppInstance = window.Telegram.WebApp;
  }
  return webAppInstance;
}
export function getWebApp() {
  return resolveWebApp();
}
export function ensureReady() {
  const webApp = resolveWebApp();
  if (!webApp) {
    devWarn("Telegram WebApp is not available.");
    return null;
  }
  webApp.ready();
  webApp.expand();
  return webApp;
}
export function getInitData() {
  const webApp = resolveWebApp();
  return webApp?.initData || "";
}
export function getStartParam() {
  const webApp = resolveWebApp();
  return webApp?.initDataUnsafe?.start_param || "";
}
export function getTelegramUser() {
  const webApp = resolveWebApp();
  return webApp?.initDataUnsafe?.user || null;
}
export function getCloudStorageItem(key) {
  const webApp = resolveWebApp();
  if (!webApp?.CloudStorage?.getItem) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    webApp.CloudStorage.getItem(key, (error, value) => {
      if (error) {
        return resolve(null);
      }
      resolve(value || null);
    });
  });
}
export function setCloudStorageItem(key, value) {
  const webApp = resolveWebApp();
  if (!webApp?.CloudStorage?.setItem) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    webApp.CloudStorage.setItem(key, value, (error) => {
      resolve(!error);
    });
  });
}
export function removeCloudStorageItem(key) {
  const webApp = resolveWebApp();
  if (!webApp?.CloudStorage?.removeItem) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    webApp.CloudStorage.removeItem(key, (error) => {
      resolve(!error);
    });
  });
}
export function getColorScheme() {
  return "light";
}
export function isDesktop() {
  const webApp = resolveWebApp();
  if (!webApp) {
    return true;
  }
  const platform = webApp.platform || "";
  return platform === "web" || platform === "desktop" || platform === "unknown";
}
export function showBackButton(handler) {
  const webApp = resolveWebApp();
  if (isDesktop()) {
    return () => {};
  }
  if (!webApp) {
    return () => {};
  }
  const isVersionAtLeast = (version) => {
    if (typeof webApp.isVersionAtLeast === "function") {
      return webApp.isVersionAtLeast(version);
    }
    const currentVersion = parseFloat(webApp.version || "0");
    const requiredVersion = parseFloat(version);
    return currentVersion >= requiredVersion;
  };
  if (!isVersionAtLeast("6.1") || !webApp.BackButton) {
    return () => {};
  }
  try {
    webApp.BackButton.show();
    if (handler) {
      webApp.BackButton.onClick(handler);
      return () => {
        try {
          webApp.BackButton.offClick(handler);
          webApp.BackButton.hide();
        } catch (error) {}
      };
    }
    return () => {
      try {
        webApp.BackButton.hide();
      } catch (error) {}
    };
  } catch (error) {
    return () => {};
  }
}
export function hideBackButton() {
  const webApp = resolveWebApp();
  if (webApp) {
    webApp.BackButton.hide();
  }
}
export function setMainButton({ text, isVisible = true, color, textColor, onClick }) {
  const webApp = resolveWebApp();
  if (!webApp) {
    return () => {};
  }
  if (text) {
    webApp.MainButton.setText(text);
  }
  if (color || textColor) {
    webApp.MainButton.setParams({ color, text_color: textColor });
  }
  if (isVisible) {
    webApp.MainButton.show();
  } else {
    webApp.MainButton.hide();
  }
  if (onClick) {
    webApp.MainButton.onClick(onClick);
    return () => {
      webApp.MainButton.offClick(onClick);
    };
  }
  return () => {};
}
export function hideMainButton() {
  const webApp = resolveWebApp();
  if (webApp) {
    webApp.MainButton.hide();
  }
}
export function showMainButtonProgress() {
  const webApp = resolveWebApp();
  if (webApp?.MainButton?.showProgress) {
    webApp.MainButton.showProgress(true);
  }
}
export function hideMainButtonProgress() {
  const webApp = resolveWebApp();
  if (webApp?.MainButton?.hideProgress) {
    webApp.MainButton.hideProgress();
  }
}
export function showAlert(message) {
  const webApp = resolveWebApp();
  if (webApp?.showAlert) {
    webApp.showAlert(message);
  } else {
    window.alert(message);
  }
}
export function showConfirm(message) {
  const webApp = resolveWebApp();
  if (webApp?.showConfirm) {
    return new Promise((resolve) => {
      webApp.showConfirm(message, (result) => resolve(Boolean(result)));
    });
  }
  return Promise.resolve(window.confirm(message));
}
export function hapticFeedback(style = "light") {
  const webApp = resolveWebApp();
  const haptic = webApp?.HapticFeedback;
  if (!haptic) {
    return;
  }
  const isVersionAtLeast = (version) => {
    if (typeof webApp.isVersionAtLeast === "function") {
      return webApp.isVersionAtLeast(version);
    }
    const currentVersion = parseFloat(webApp.version || "0");
    const requiredVersion = parseFloat(version);
    return currentVersion >= requiredVersion;
  };
  if (!isVersionAtLeast("6.1")) {
    return;
  }
  const validImpactStyles = ["light", "medium", "heavy", "rigid", "soft"];
  const validNotificationTypes = ["success", "error", "warning"];
  if (validImpactStyles.includes(style)) {
    haptic.impactOccurred(style);
  } else if (validNotificationTypes.includes(style)) {
    haptic.notificationOccurred(style);
  } else {
    haptic.impactOccurred("light");
  }
}
export function requestContact({ timeoutMs = 10000 } = {}) {
  const webApp = resolveWebApp();
  if (!webApp?.requestContact || !webApp?.onEvent) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let resolved = false;
    let handler;
    let customHandler;
    let debugHandler;
    let timer;
    const finish = (phone) => {
      if (resolved) {
        return;
      }
      resolved = true;
      devLog("[requestContact] Finishing with phone:", phone);
      if (timer) {
        clearTimeout(timer);
      }
      if (handler) {
        webApp.offEvent("contactRequested", handler);
      }
      if (customHandler) {
        webApp.offEvent("custom_method_invoked", customHandler);
      }
      if (debugHandler) {
        webApp.offEvent("custom_method_invoked", debugHandler);
      }
      resolve(phone || null);
    };
    handler = (payload) => {
      devLog("[requestContact] contactRequested event:", payload);
      const phone = payload?.responseUnsafe?.contact?.phone_number || payload?.contact?.phone_number || null;
      devLog("[requestContact] Extracted phone:", phone);
      finish(phone);
    };
    debugHandler = (event) => {
      devLog("[requestContact] DEBUG custom_method_invoked:", JSON.stringify(event, null, 2));
    };
    customHandler = (payload) => {
      devLog("[requestContact] custom_method_invoked payload:", payload);
      const result = payload?.result;
      if (!result) {
        devLog("[requestContact] В payload нет результата");
        return;
      }
      try {
        devLog("[requestContact] Raw result:", result);
        const decodedResult = decodeURIComponent(result);
        devLog("[requestContact] Decoded result:", decodedResult);
        const params = new URLSearchParams(decodedResult);
        const contactRaw = params.get("contact");
        devLog("[requestContact] Contact raw:", contactRaw);
        if (!contactRaw) {
          devLog("[requestContact] В параметрах нет контакта");
          return;
        }
        const contact = JSON.parse(contactRaw);
        devLog("[requestContact] Parsed contact:", contact);
        finish(contact?.phone_number || null);
      } catch (error) {
        console.error("[requestContact] Не удалось разобрать результат контакта:", error, "result:", result);
      }
    };
    timer = setTimeout(() => {
      devLog("[requestContact] Timeout reached");
      finish(null);
    }, timeoutMs);
    devLog("[requestContact] Subscribing to events...");
    webApp.onEvent("contactRequested", handler);
    webApp.onEvent("custom_method_invoked", customHandler);
    try {
      devLog("[requestContact] Calling webApp.requestContact...");
      webApp.requestContact();
    } catch (error) {
      console.error("[requestContact] Ошибка при вызове requestContact:", error);
      finish(null);
    }
  });
}
export function enableClosingConfirmation() {
  const webApp = resolveWebApp();
  if (typeof webApp?.enableClosingConfirmation === "function") {
    webApp.enableClosingConfirmation();
    return true;
  }
  return false;
}
export function disableClosingConfirmation() {
  const webApp = resolveWebApp();
  if (typeof webApp?.disableClosingConfirmation === "function") {
    webApp.disableClosingConfirmation();
    return true;
  }
  return false;
}
