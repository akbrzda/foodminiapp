import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import router from "./router";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Инициализируем Telegram store после создания Pinia
import { useTelegramStore } from "./stores/telegram.js";
const telegramStore = useTelegramStore();
telegramStore.initTelegram();

// iOS-specific фикс для работы с клавиатурой
// Автоматически скроллим к input при фокусе
if (window.Telegram?.WebApp) {
  document.body.addEventListener("focusin", (e) => {
    const target = e.target;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      // Небольшая задержка для ожидания открытия клавиатуры
      setTimeout(() => {
        target.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 300);
    }
  });

  // Скрываем клавиатуру при тапе вне input
  document.body.addEventListener(
    "touchstart",
    (e) => {
      const target = e.target;
      if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
          activeElement.blur();
        }
      }
    },
    { passive: true },
  );
}

app.mount("#app");
