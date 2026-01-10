<template>
  <div id="app" :data-theme="theme">
    <router-view />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useTelegramStore } from "./stores/telegram";

const telegramStore = useTelegramStore();
const theme = computed(() => telegramStore.theme);
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f5f5;
}

#app {
  width: 100%;
  min-height: 100vh;
}

button {
  font-family: inherit;
}

/* Скрываем скроллбар, но оставляем функциональность */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
</style>
