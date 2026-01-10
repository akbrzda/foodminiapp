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
    console.warn("Telegram WebApp is not available.");
    return null;
  }
  webApp.ready();
  webApp.expand();
  return webApp;
}

export function getInitData() {
  if (typeof window !== "undefined" && window.__telegramInitDataOverride) {
    return window.__telegramInitDataOverride;
  }

  const webApp = resolveWebApp();
  return webApp?.initData || "";
}

export function getStartParam() {
  if (typeof window !== "undefined" && window.__telegramStartParam) {
    return window.__telegramStartParam;
  }

  const webApp = resolveWebApp();
  return webApp?.initDataUnsafe?.start_param || "";
}

export function getTelegramUser() {
  const webApp = resolveWebApp();
  return webApp?.initDataUnsafe?.user || null;
}

export function getThemeParams() {
  const webApp = resolveWebApp();
  return webApp?.themeParams || {};
}

export function getColorScheme() {
  const webApp = resolveWebApp();
  return webApp?.colorScheme || "light";
}

export function showBackButton(handler) {
  const webApp = resolveWebApp();
  if (!webApp) {
    return () => {};
  }

  webApp.BackButton.show();
  if (handler) {
    webApp.onEvent("backButtonClicked", handler);
    return () => {
      webApp.offEvent("backButtonClicked", handler);
      webApp.BackButton.hide();
    };
  }

  return () => {
    webApp.BackButton.hide();
  };
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

  if (typeof webApp?.isVersionAtLeast === "function" && !webApp.isVersionAtLeast("6.1")) {
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
      console.log("[requestContact] Finishing with phone:", phone);
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
      console.log("[requestContact] contactRequested event:", payload);
      // Telegram WebApp возвращает данные в responseUnsafe.contact
      const phone = payload?.responseUnsafe?.contact?.phone_number || payload?.contact?.phone_number || null;
      console.log("[requestContact] Extracted phone:", phone);
      finish(phone);
    };

    // Добавляем отладочный обработчик для всех custom_method_invoked событий
    debugHandler = (event) => {
      console.log("[requestContact] DEBUG custom_method_invoked:", JSON.stringify(event, null, 2));
    };

    customHandler = (payload) => {
      console.log("[requestContact] custom_method_invoked payload:", payload);
      const result = payload?.result;
      if (!result) {
        console.log("[requestContact] No result in payload");
        return;
      }
      try {
        console.log("[requestContact] Raw result:", result);
        // Декодируем URL-encoded строку
        const decodedResult = decodeURIComponent(result);
        console.log("[requestContact] Decoded result:", decodedResult);

        const params = new URLSearchParams(decodedResult);
        const contactRaw = params.get("contact");
        console.log("[requestContact] Contact raw:", contactRaw);

        if (!contactRaw) {
          console.log("[requestContact] No contact in params");
          return;
        }
        const contact = JSON.parse(contactRaw);
        console.log("[requestContact] Parsed contact:", contact);
        finish(contact?.phone_number || null);
      } catch (error) {
        console.error("[requestContact] Failed to parse contact result:", error, "result:", result);
      }
    };

    timer = setTimeout(() => {
      console.log("[requestContact] Timeout reached");
      finish(null);
    }, timeoutMs);

    // Подписываемся на события ПЕРЕД вызовом requestContact
    console.log("[requestContact] Subscribing to events...");
    webApp.onEvent("contactRequested", handler);
    webApp.onEvent("custom_method_invoked", customHandler);

    try {
      console.log("[requestContact] Calling webApp.requestContact...");
      // Просто вызываем requestContact без callback,
      // данные придут через событие contactRequested
      webApp.requestContact();
    } catch (error) {
      console.error("[requestContact] Error calling requestContact:", error);
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
