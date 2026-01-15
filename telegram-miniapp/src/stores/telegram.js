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

    console.log("📱 Инициализация Telegram WebApp:", {
      platform: webApp.platform,
      version: webApp.version,
      hasInitData: !!currentInitData,
      hasInitDataUnsafe: !!currentInitDataUnsafe && Object.keys(currentInitDataUnsafe).length > 0,
    });

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
        // initData может быть пустым при разработке вне Telegram
        if (webApp.platform !== "unknown") {
          console.warn("⚠️ initData пустой и не найден в sessionStorage. Платформа:", webApp.platform);
        } else {
          console.log("ℹ️ Запуск вне Telegram (платформа: unknown)");
        }
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

    // Инициализация SDK согласно официальной документации
    // https://core.telegram.org/bots/webapps
    webApp.ready();
    webApp.expand();

    // Вспомогательная функция для проверки версии SDK
    const isVersionAtLeast = (version) => {
      if (typeof webApp.isVersionAtLeast === "function") {
        return webApp.isVersionAtLeast(version);
      }
      // Fallback: сравниваем версию вручную, если метод недоступен
      const currentVersion = parseFloat(webApp.version || "0");
      const requiredVersion = parseFloat(version);
      return currentVersion >= requiredVersion;
    };

    // Настройка FullScreen режима
    // setHeaderColor и setBackgroundColor требуют версию 6.1+
    if (isVersionAtLeast("6.1")) {
      try {
        if (typeof webApp.setHeaderColor === "function") {
          webApp.setHeaderColor("#000000");
        }
        if (typeof webApp.setBackgroundColor === "function") {
          webApp.setBackgroundColor("#F5F5F5");
        }
      } catch (error) {
        // Игнорируем ошибки, если метод не поддерживается
      }
    }

    // disableVerticalSwipes требует версию 6.1+
    if (isVersionAtLeast("6.1")) {
      try {
        if (typeof webApp.disableVerticalSwipes === "function") {
          webApp.disableVerticalSwipes();
        }
      } catch (error) {
        // Игнорируем ошибки, если метод не поддерживается
      }
    }

    // disableClosingConfirmation требует версию 6.2+
    if (isVersionAtLeast("6.2")) {
      try {
        if (typeof webApp.disableClosingConfirmation === "function") {
          webApp.disableClosingConfirmation();
        }
      } catch (error) {
        // Игнорируем ошибки, если метод не поддерживается
      }
    }

    console.log("✅ Telegram WebApp инициализирован", {
      platform: webApp.platform,
      version: webApp.version,
      initDataLength: currentInitData.length,
      supportsBackButton: isVersionAtLeast("6.1") && !!webApp.BackButton,
      supportsHeaderColor: isVersionAtLeast("6.1") && typeof webApp.setHeaderColor === "function",
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

    // Вспомогательная функция для проверки версии SDK
    const isVersionAtLeast = (version) => {
      if (typeof telegramApp.isVersionAtLeast === "function") {
        return telegramApp.isVersionAtLeast(version);
      }
      const currentVersion = parseFloat(telegramApp.version || "0");
      const requiredVersion = parseFloat(version);
      return currentVersion >= requiredVersion;
    };

    // BackButton требует версию 6.1+
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
          } catch (error) {
            // Игнорируем ошибки при очистке
          }
        };
      }

      return () => {
        try {
          backButton.hide();
        } catch (error) {
          // Игнорируем ошибки при скрытии
        }
      };
    } catch (error) {
      // Игнорируем ошибки, если метод не поддерживается
      return () => {};
    }
  }

  function hideBackButton() {
    const telegramApp = resolveTelegramApp();
    if (telegramApp?.BackButton?.hide) {
      try {
        telegramApp.BackButton.hide();
      } catch (error) {
        // Игнорируем ошибки, если метод не поддерживается
      }
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
