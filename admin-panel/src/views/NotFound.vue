<template>
  <div class="flex min-h-screen items-center justify-center text-center">
    <div>
      <p class="panel-title text-4xl font-semibold text-ink">404</p>
      <p class="text-sm text-ink/60">Страница не найдена</p>
      <RouterLink class="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-white" to="/">
        На главную
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { RouterLink } from "vue-router";
</script>
