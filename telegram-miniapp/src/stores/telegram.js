import { defineStore } from "pinia";
import { ref, computed } from "vue";

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

    // Восстанавливаем initData из sessionStorage, если он пустой
    let currentInitData = webApp.initData || "";
    let currentInitDataUnsafe = webApp.initDataUnsafe || {};

    if (!currentInitData) {
      const savedInitData = sessionStorage.getItem("tg_init_data");
      const savedInitDataUnsafe = sessionStorage.getItem("tg_init_data_unsafe");

      if (savedInitData) {
        console.log("🔄 Восстанавливаем initData из sessionStorage");
        currentInitData = savedInitData;
        webApp.initData = savedInitData;

        if (savedInitDataUnsafe) {
          try {
            currentInitDataUnsafe = JSON.parse(savedInitDataUnsafe);
            webApp.initDataUnsafe = currentInitDataUnsafe;
          } catch (e) {
            console.error("Ошибка при парсинге сохранённого initDataUnsafe:", e);
          }
        }
      } else {
        console.warn("⚠️ initData пустой и не найден в sessionStorage.");
      }
    } else {
      console.log("💾 Сохраняем initData в sessionStorage");
      sessionStorage.setItem("tg_init_data", currentInitData);

      if (webApp.initDataUnsafe) {
        sessionStorage.setItem("tg_init_data_unsafe", JSON.stringify(webApp.initDataUnsafe));
      }
    }

    user.value = currentInitDataUnsafe?.user || null;
    initData.value = currentInitData;

    // Проверяем start_param для приглашений
    const tgStartParam = currentInitDataUnsafe?.start_param;
    startParam.value = tgStartParam || null;

    // Сохраняем оригинальный initData
    window.__telegramInitDataOverride = currentInitData;
    window.__telegramStartParam = tgStartParam || null;

    webApp.ready();
    webApp.expand();

    if (typeof webApp.disableVerticalSwipes === "function") {
      webApp.disableVerticalSwipes();
    }

    if (typeof webApp.disableClosingConfirmation === "function") {
      webApp.disableClosingConfirmation();
    }

    console.log("✅ Telegram WebApp инициализирован", {
      platform: webApp.platform,
      version: webApp.version,
      initDataLength: currentInitData.length,
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
    const backButton = telegramApp?.BackButton;
    if (!backButton) {
      return () => {};
    }

    backButton.show();

    if (typeof onClick === "function") {
      backButton.onClick(onClick);
      return () => {
        backButton.offClick(onClick);
        backButton.hide();
      };
    }

    return () => {
      backButton.hide();
    };
  }

  function hideBackButton() {
    const telegramApp = resolveTelegramApp();
    const backButton = telegramApp?.BackButton;
    if (backButton?.hide) {
      backButton.hide();
    }
  }

  return {
    // state
    tg,
    user,
    initData,
    startParam,

    // getters
    isReady,
    platform,

    // actions
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
