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

const { initTheme } = useTheme();
initTheme();

// Периодическая очистка устаревших контекстов навигации
const navigationStore = useNavigationContextStore();

onMounted(() => {
  // Очищаем старые контексты при запуске приложения
  navigationStore.cleanupOldContexts();

  // Периодическая очистка каждые 10 минут
  setInterval(() => {
    navigationStore.cleanupOldContexts();
    navigationStore.enforceLimit();
  }, 600000); // 10 минут
});
</script>
