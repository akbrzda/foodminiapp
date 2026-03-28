<template>
  <RouterView />
  <Toaster />
</template>
<script setup>
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import { Toaster } from "@/shared/components/ui/sonner";
import { useTheme } from "@/shared/composables/useTheme.js";
import { useNavigationContextStore } from "@/shared/stores/navigationContext.js";
import api from "@/shared/api/client.js";
import { setActiveCurrencyCode } from "@/shared/utils/format.js";
import { devWarn } from "@/shared/utils/logger";

const { initTheme } = useTheme();
initTheme();

// Периодическая очистка устаревших контекстов навигации
const navigationStore = useNavigationContextStore();

onMounted(() => {
  api
    .get("/api/settings")
    .then((response) => {
      setActiveCurrencyCode(response?.data?.settings?.site_currency);
    })
    .catch((error) => {
      devWarn("Не удалось загрузить валюту сайта, используется RUB:", error);
      setActiveCurrencyCode("RUB");
    });

  // Очищаем старые контексты при запуске приложения
  navigationStore.cleanupOldContexts();

  // Периодическая очистка каждые 10 минут
  setInterval(() => {
    navigationStore.cleanupOldContexts();
    navigationStore.enforceLimit();
  }, 600000); // 10 минут
});
</script>
