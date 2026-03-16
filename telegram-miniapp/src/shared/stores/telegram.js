import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { initializeTelegramSession } from "@/shared/services/telegram.js";
import { devLog } from "@/shared/utils/logger.js";

export const useTelegramStore = defineStore("telegram", () => {
  const tg = ref(null);
  const user = ref(null);
  const initData = ref("");
  const startParam = ref(null);

  const isReady = computed(() => Boolean(tg.value));
  const platform = computed(() => tg.value?.platform || "unknown");

  const dispatchViewportEvent = (webApp) => {
    if (typeof window === "undefined") {
      return;
    }

    const viewportInfo = {
      height: webApp.viewportHeight,
      stableHeight: webApp.viewportStableHeight,
      isExpanded: webApp.isExpanded,
    };

    window.dispatchEvent(
      new CustomEvent("telegram-viewport-changed", {
        detail: viewportInfo,
      })
    );
  };

  function initTelegram() {
    if (tg.value) {
      return;
    }

    const session = initializeTelegramSession();
    if (!session.webApp) {
      return;
    }

    tg.value = session.webApp;
    user.value = session.user;
    initData.value = session.initData;
    startParam.value = session.startParam;

    session.webApp.onEvent("viewportChanged", () => {
      dispatchViewportEvent(session.webApp);
    });

    devLog("Telegram WebApp инициализирован", {
      platform: session.webApp.platform,
      version: session.webApp.version,
      hasInitData: Boolean(session.initData),
      hasUser: Boolean(session.user),
    });
  }

  return {
    tg,
    user,
    initData,
    startParam,
    isReady,
    platform,
    initTelegram,
  };
});
