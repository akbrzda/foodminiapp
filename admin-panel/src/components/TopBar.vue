<template>
  <header class="glass flex items-center justify-between rounded-3xl border border-white/70 px-6 py-4 shadow-card">
    <div>
      <p class="panel-title text-lg font-semibold text-ink">{{ title }}</p>
      <p class="text-xs text-ink/60">{{ subtitle }}</p>
    </div>
    <div class="flex items-center gap-4">
      <div class="text-right text-sm">
        <div class="font-medium text-ink">{{ authStore.user?.first_name }} {{ authStore.user?.last_name }}</div>
        <div class="text-xs uppercase tracking-[0.2em] text-ink/50">{{ authStore.role || "admin" }}</div>
      </div>
      <button
        class="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink shadow-sm transition hover:-translate-y-0.5 hover:bg-accent"
        type="button"
        @click="authStore.logout()"
      >
        Выйти
      </button>
    </div>
  </header>
</template>

<script setup>
import { useAuthStore } from "../stores/auth.js";

defineProps({
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

const authStore = useAuthStore();
</script>
