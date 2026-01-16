<template>
  <aside class="flex h-full flex-col gap-6 border-r border-line bg-white/80 p-6">
    <div>
      <p class="panel-title text-xl font-semibold text-ink">Panda Admin</p>
      <p class="text-xs uppercase tracking-[0.2em] text-ink/60">Control Room</p>
    </div>

    <nav class="flex flex-1 flex-col gap-2 text-sm">
      <RouterLink class="nav-link" to="/orders">Заказы</RouterLink>
      <RouterLink class="nav-link" to="/clients">Клиенты</RouterLink>
      <div class="mt-4 text-xs uppercase tracking-[0.2em] text-ink/50">Меню</div>
      <RouterLink class="nav-link" to="/menu/categories">Категории</RouterLink>
      <RouterLink class="nav-link" to="/menu/items">Позиции</RouterLink>
      <RouterLink class="nav-link" to="/menu/modifiers">Модификаторы</RouterLink>
    </nav>

    <div class="rounded-2xl bg-ink/5 p-4 text-xs text-ink/70">
      <div class="font-semibold text-ink">Live Ops</div>
      <div>Обновления заказов в реальном времени</div>
    </div>
  </aside>
</template>

<script setup>
import { RouterLink } from "vue-router";
</script>

<style scoped>
.nav-link {
  @apply rounded-xl px-3 py-2 text-ink/70 transition hover:bg-ink/5 hover:text-ink;
}

.router-link-active {
  @apply bg-accent/20 text-ink shadow-glow;
}
</style>
