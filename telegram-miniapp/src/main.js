import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import router from "./router";
import { initErudaForAdmin } from "@/shared/utils/eruda.js";
const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
import { useTelegramStore } from "@/shared/stores/telegram.js";
const telegramStore = useTelegramStore();
telegramStore.initTelegram();
initErudaForAdmin();
if (window.Telegram?.WebApp) {
  document.body.addEventListener("focusin", (e) => {
    const target = e.target;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      setTimeout(() => {
        target.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 300);
    }
  });
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
