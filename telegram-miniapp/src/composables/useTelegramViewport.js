import { onMounted } from "vue";

/**
 * Composable для настройки Telegram WebApp viewport
 *
 * Управляет расширением viewport, вертикальными свайпами
 * и отслеживает изменения viewport (например, при открытии клавиатуры)
 *
 * @returns {Object} { viewportHeight, isExpanded }
 */
export function useTelegramViewport() {
  onMounted(() => {
    if (!window.Telegram?.WebApp) {
      return;
    }

    const webApp = window.Telegram.WebApp;

    // Разрешаем расширение viewport на весь экран
    webApp.expand();

    // Отключаем вертикальные свайпы (они могут конфликтовать со скроллом)
    if (typeof webApp.disableVerticalSwipes === "function") {
      webApp.disableVerticalSwipes();
    }

    // Отслеживаем изменения viewport (критично для адаптации к клавиатуре)
    const handleViewportChanged = () => {
      const info = {
        height: webApp.viewportHeight,
        stableHeight: webApp.viewportStableHeight,
        isExpanded: webApp.isExpanded,
      };

      console.log("📱 Telegram viewport changed:", info);

      // Диспатчим кастомное событие для других частей приложения
      window.dispatchEvent(
        new CustomEvent("telegram-viewport-changed", {
          detail: info,
        }),
      );
    };

    webApp.onEvent("viewportChanged", handleViewportChanged);

    // Логируем начальное состояние
    console.log("📱 Telegram viewport initialized:", {
      height: webApp.viewportHeight,
      stableHeight: webApp.viewportStableHeight,
      isExpanded: webApp.isExpanded,
    });
  });
}
