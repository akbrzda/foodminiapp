import { onMounted } from "vue";
export function useTelegramViewport() {
  onMounted(() => {
    if (!window.Telegram?.WebApp) {
      return;
    }
    const webApp = window.Telegram.WebApp;
    webApp.expand();
    if (typeof webApp.disableVerticalSwipes === "function") {
      webApp.disableVerticalSwipes();
    }
    const handleViewportChanged = () => {
      const info = {
        height: webApp.viewportHeight,
        stableHeight: webApp.viewportStableHeight,
        isExpanded: webApp.isExpanded,
      };
      window.dispatchEvent(
        new CustomEvent("telegram-viewport-changed", {
          detail: info,
        }),
      );
    };
    webApp.onEvent("viewportChanged", handleViewportChanged);
  });
}
