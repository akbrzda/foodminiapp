<template>
  <header class="sticky top-0 z-30 border-b border-border/60 bg-background backdrop-blur">
    <div class="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
      <div class="flex items-center gap-3">
        <Button class="lg:hidden" variant="ghost" size="icon" @click="emit('toggle-menu')">
          <Menu :size="18" />
        </Button>
        <div>
          <p class="panel-title text-lg font-semibold text-foreground">{{ title }}</p>
          <p class="text-xs text-muted-foreground">{{ subtitle }}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="hidden text-right text-sm sm:block">
          <div class="font-medium text-foreground">{{ authStore.user?.first_name }} {{ authStore.user?.last_name }}</div>
          <div class="text-xs uppercase text-muted-foreground">{{ authStore.role || "admin" }}</div>
        </div>
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {{ initials }}
        </div>
        <Button variant="outline" size="sm" @click="openShiftPage">
          <ExternalLink :size="16" />
          Текущая смена
        </Button>
        <Button variant="outline" size="sm" @click="authStore.logout()">
          <LogOut :size="16" />
          Выйти
        </Button>
      </div>
    </div>
  </header>
</template>
<script setup>
import { computed } from "vue";
import { LogOut, Menu, ExternalLink } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth.js";
import Button from "./ui/Button.vue";

defineProps({
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

const emit = defineEmits(["toggle-menu"]);
const authStore = useAuthStore();
const initials = computed(() => {
  const first = authStore.user?.first_name?.[0] || "";
  const last = authStore.user?.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase() || "PA";
});
const openShiftPage = () => {
  window.open("/shift", "_blank");
};
</script>
