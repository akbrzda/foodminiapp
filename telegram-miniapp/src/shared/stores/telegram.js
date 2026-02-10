import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { devLog, devWarn } from "@/shared/utils/logger.js";
export const useTelegramStore = defineStore("telegram", () => {
  const tg = ref(null);
  const user = ref(null);
  const initData = ref("");
  const startParam = ref(null);
  const isReady = computed(() => Boolean(tg.value));
  const platform = computed(() => tg.value?.platform || "unknown");
  function initTelegram() {
    if (tg.value) {
      return;
    }
    const hasWebApp = typeof window !== "undefined" && window.Telegram?.WebApp;
    if (!hasWebApp) {
      console.error("Telegram WebApp API недоступен. Откройте мини-приложение внутри Telegram.");
      return;
    }
    const webApp = window.Telegram.WebApp;
    tg.value = webApp;
    let currentInitData = webApp.initData || "";
    let currentInitDataUnsafe = webApp.initDataUnsafe || {};
    devLog("📱 Инициализация Telegram WebApp:", {
      platform: webApp.platform,
      version: webApp.version,
      hasInitData: !!currentInitData,
      hasInitDataUnsafe: !!currentInitDataUnsafe && Object.keys(currentInitDataUnsafe).length > 0,
    });
    if (!currentInitData) {
      if (webApp.platform !== "unknown") {
        devWarn("⚠️ initData пустой. Платформа:", webApp.platform);
      } else {
        devLog("ℹ️ Запуск вне Telegram (платформа: unknown)");
      }
    }
    user.value = currentInitDataUnsafe?.user || null;
    initData.value = currentInitData;
    const tgStartParam = currentInitDataUnsafe?.start_param;
    startParam.value = tgStartParam || null;
    webApp.ready();
    webApp.expand();
    const isVersionAtLeast = (version) => {
      if (typeof webApp.isVersionAtLeast === "function") {
        return webApp.isVersionAtLeast(version);
      }
      const currentVersion = parseFloat(webApp.version || "0");
      const requiredVersion = parseFloat(version);
      return currentVersion >= requiredVersion;
    };
    if (isVersionAtLeast("6.1")) {
      try {
        if (typeof webApp.setHeaderColor === "function") {
          webApp.setHeaderColor("#FFFFFF");
        }
        if (typeof webApp.setBackgroundColor === "function") {
          webApp.setBackgroundColor("#FFFFFF");
        }
      } catch (error) {}
    }
    if (isVersionAtLeast("6.1")) {
      try {
        if (typeof webApp.disableVerticalSwipes === "function") {
          webApp.disableVerticalSwipes();
        }
      } catch (error) {}
    }
    if (isVersionAtLeast("6.2")) {
      try {
        if (typeof webApp.disableClosingConfirmation === "function") {
          webApp.disableClosingConfirmation();
        }
      } catch (error) {}
    }
    webApp.onEvent("viewportChanged", () => {
      const viewportInfo = {
        height: webApp.viewportHeight,
        stableHeight: webApp.viewportStableHeight,
        isExpanded: webApp.isExpanded,
      };
      devLog("📱 Viewport changed:", viewportInfo);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("telegram-viewport-changed", {
            detail: viewportInfo,
          }),
        );
      }
    });
    devLog("✅ Telegram WebApp инициализирован", {
      platform: webApp.platform,
      version: webApp.version,
      initDataLength: currentInitData.length,
      supportsBackButton: isVersionAtLeast("6.1") && !!webApp.BackButton,
      supportsHeaderColor: isVersionAtLeast("6.1") && typeof webApp.setHeaderColor === "function",
      viewportHeight: webApp.viewportHeight,
      viewportStableHeight: webApp.viewportStableHeight,
    });
  }
  function resolveTelegramApp() {
    return window.Telegram?.WebApp || tg.value || null;
  }
  function showAlert(message) {
    const telegramApp = resolveTelegramApp();
    if (telegramApp?.showAlert) {
      telegramApp.showAlert(message);
    } else if (typeof window !== "undefined") {
      window.alert(message);
    }
  }
  function showConfirm(message) {
    return new Promise((resolve) => {
      const telegramApp = resolveTelegramApp();
      if (telegramApp?.showConfirm) {
        telegramApp.showConfirm(message, (result) => resolve(Boolean(result)));
      } else if (typeof window !== "undefined") {
        resolve(window.confirm(message));
      } else {
        resolve(false);
      }
    });
  }
  function hapticFeedback(type = "impact", style = "medium") {
    const telegramApp = resolveTelegramApp();
    const haptic = telegramApp?.HapticFeedback;
    if (!haptic) {
      return;
    }
    if (type === "impact" && haptic.impactOccurred) {
      haptic.impactOccurred(style);
    } else if (type === "notification" && haptic.notificationOccurred) {
      haptic.notificationOccurred(style);
    } else if (type === "selection" && haptic.selectionChanged) {
      haptic.selectionChanged();
    }
  }
  function setMainButton(text, onClick) {
    const telegramApp = resolveTelegramApp();
    const mainButton = telegramApp?.MainButton;
    if (!mainButton) {
      return;
    }
    if (typeof text === "string") {
      mainButton.setText(text);
    }
    if (typeof onClick === "function") {
      mainButton.onClick(onClick);
    }
    mainButton.show();
  }
  function hideMainButton() {
    const telegramApp = resolveTelegramApp();
    const mainButton = telegramApp?.MainButton;
    if (mainButton?.hide) {
      mainButton.hide();
    }
  }
  function showBackButton(onClick) {
    const telegramApp = resolveTelegramApp();
    if (!telegramApp) {
      return () => {};
    }
    const isVersionAtLeast = (version) => {
      if (typeof telegramApp.isVersionAtLeast === "function") {
        return telegramApp.isVersionAtLeast(version);
      }
      const currentVersion = parseFloat(telegramApp.version || "0");
      const requiredVersion = parseFloat(version);
      return currentVersion >= requiredVersion;
    };
    if (!isVersionAtLeast("6.1") || !telegramApp.BackButton) {
      return () => {};
    }
    try {
      const backButton = telegramApp.BackButton;
      backButton.show();
      if (typeof onClick === "function") {
        backButton.onClick(onClick);
        return () => {
          try {
            backButton.offClick(onClick);
            backButton.hide();
          } catch (error) {}
        };
      }
      return () => {
        try {
          backButton.hide();
        } catch (error) {}
      };
    } catch (error) {
      return () => {};
    }
  }
  function hideBackButton() {
    const telegramApp = resolveTelegramApp();
    if (telegramApp?.BackButton?.hide) {
      try {
        telegramApp.BackButton.hide();
      } catch (error) {}
    }
  }
  return {
    tg,
    user,
    initData,
    startParam,
    isReady,
    platform,
    initTelegram,
    showAlert,
    showConfirm,
    hapticFeedback,
    setMainButton,
    hideMainButton,
    showBackButton,
    hideBackButton,
  };
});
