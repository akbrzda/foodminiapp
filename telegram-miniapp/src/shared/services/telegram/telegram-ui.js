import { devError, devLog } from "@/shared/utils/logger.js";
import {
  getWebApp,
  isDesktop,
  isVersionAtLeast,
  warnMissingWebAppContext,
} from "@/shared/services/telegram/telegram-client.js";

export const showBackButton = (handler) => {
  const webApp = getWebApp();
  if (!webApp || isDesktop()) {
    return () => {};
  }

  if (!isVersionAtLeast(webApp, "6.1") || !webApp.BackButton) {
    return () => {};
  }

  const backButton = webApp.BackButton;
  backButton.show();

  if (typeof handler !== "function") {
    return () => backButton.hide();
  }

  backButton.onClick(handler);
  return () => {
    backButton.offClick(handler);
    backButton.hide();
  };
};

export const hideBackButton = () => {
  const webApp = getWebApp();
  if (webApp?.BackButton?.hide) {
    webApp.BackButton.hide();
  }
};

export const setMainButton = ({ text, isVisible = true, color, textColor, onClick }) => {
  const webApp = getWebApp();
  if (!webApp?.MainButton) {
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

  if (typeof onClick !== "function") {
    return () => {};
  }

  webApp.MainButton.onClick(onClick);
  return () => {
    webApp.MainButton.offClick(onClick);
  };
};

export const hideMainButton = () => {
  const webApp = getWebApp();
  if (webApp?.MainButton?.hide) {
    webApp.MainButton.hide();
  }
};

export const showMainButtonProgress = () => {
  const webApp = getWebApp();
  if (webApp?.MainButton?.showProgress) {
    webApp.MainButton.showProgress(true);
  }
};

export const hideMainButtonProgress = () => {
  const webApp = getWebApp();
  if (webApp?.MainButton?.hideProgress) {
    webApp.MainButton.hideProgress();
  }
};

export const showAlert = (message) => {
  const webApp = getWebApp();
  if (webApp?.showAlert) {
    webApp.showAlert(message);
    return;
  }

  warnMissingWebAppContext();
  if (typeof window !== "undefined") {
    window.alert(message);
  }
};

export const showConfirm = (message) => {
  const webApp = getWebApp();
  if (webApp?.showConfirm) {
    return new Promise((resolve) => {
      webApp.showConfirm(message, (result) => resolve(Boolean(result)));
    });
  }

  warnMissingWebAppContext();
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  return Promise.resolve(window.confirm(message));
};

export const hapticFeedback = (style = "light") => {
  const webApp = getWebApp();
  const haptic = webApp?.HapticFeedback;
  if (!webApp || !haptic || !isVersionAtLeast(webApp, "6.1")) {
    return;
  }

  const validImpactStyles = ["light", "medium", "heavy", "rigid", "soft"];
  const validNotificationTypes = ["success", "error", "warning"];

  if (validImpactStyles.includes(style)) {
    haptic.impactOccurred(style);
    return;
  }

  if (validNotificationTypes.includes(style)) {
    haptic.notificationOccurred(style);
    return;
  }

  haptic.impactOccurred("light");
};

export const requestContact = ({ timeoutMs = 10000 } = {}) => {
  const webApp = getWebApp();
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
      if (timer) {
        clearTimeout(timer);
      }

      if (handler) {
        webApp.offEvent?.("contactRequested", handler);
      }

      if (customHandler) {
        webApp.offEvent?.("custom_method_invoked", customHandler);
      }

      if (debugHandler) {
        webApp.offEvent?.("custom_method_invoked", debugHandler);
      }

      resolve(phone || null);
    };

    handler = (payload) => {
      const phone =
        payload?.responseUnsafe?.contact?.phone_number || payload?.contact?.phone_number || null;
      finish(phone);
    };

    debugHandler = (event) => {
      devLog("[requestContact] DEBUG custom_method_invoked:", JSON.stringify(event, null, 2));
    };

    customHandler = (payload) => {
      const result = payload?.result;
      if (!result) {
        return;
      }

      try {
        const decodedResult = decodeURIComponent(result);
        const params = new URLSearchParams(decodedResult);
        const contactRaw = params.get("contact");
        if (!contactRaw) {
          return;
        }

        const contact = JSON.parse(contactRaw);
        finish(contact?.phone_number || null);
      } catch (error) {
        devError("[requestContact] Не удалось разобрать результат контакта:", error);
      }
    };

    timer = setTimeout(() => finish(null), timeoutMs);

    webApp.onEvent("contactRequested", handler);
    webApp.onEvent("custom_method_invoked", customHandler);

    try {
      webApp.requestContact();
    } catch (error) {
      devError("[requestContact] Ошибка при вызове requestContact:", error);
      finish(null);
    }
  });
};

export const enableClosingConfirmation = () => {
  const webApp = getWebApp();
  if (typeof webApp?.enableClosingConfirmation !== "function") {
    return false;
  }

  webApp.enableClosingConfirmation();
  return true;
};

export const disableClosingConfirmation = () => {
  const webApp = getWebApp();
  if (typeof webApp?.disableClosingConfirmation !== "function") {
    return false;
  }

  webApp.disableClosingConfirmation();
  return true;
};
