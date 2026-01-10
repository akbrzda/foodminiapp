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

app.mount("#app");
