<template>
  <aside class="flex h-full flex-col gap-4">
    <div class="bg-primary/10 p-4">
      <p class="panel-title text-xl font-semibold text-foreground">Панель управления</p>
    </div>

    <nav class="flex flex-1 flex-col gap-1 text-sm p-3">
      <div class="text-xs font-semibold uppercase text-muted-foreground">Операции</div>
      <RouterLink class="nav-link" to="/dashboard" @click="emit('navigate')">
        <LayoutDashboard :size="18" />
        Аналитика
      </RouterLink>
      <RouterLink class="nav-link" to="/orders" @click="emit('navigate')">
        <ClipboardList :size="18" />
        Заказы
      </RouterLink>
      <RouterLink class="nav-link" to="/clients" @click="emit('navigate')">
        <Users :size="18" />
        Клиенты
      </RouterLink>

      <div class="mt-4 text-xs font-semibold uppercase text-muted-foreground">Меню</div>
      <RouterLink class="nav-link" to="/menu/categories" @click="emit('navigate')">
        <ListTree :size="18" />
        Категории
      </RouterLink>
      <RouterLink class="nav-link" to="/menu/items" @click="emit('navigate')">
        <UtensilsCrossed :size="18" />
        Позиции
      </RouterLink>
      <RouterLink class="nav-link" to="/menu/modifiers" @click="emit('navigate')">
        <Layers :size="18" />
        Модификаторы
      </RouterLink>
      <RouterLink class="nav-link" to="/menu/tags" @click="emit('navigate')">
        <Tag :size="18" />
        Теги
      </RouterLink>
      <RouterLink class="nav-link" to="/menu/stop-list" @click="emit('navigate')">
        <ListChecks :size="18" />
        Стоп-лист
      </RouterLink>

      <div class="mt-4 text-xs font-semibold uppercase text-muted-foreground">Справочники</div>
      <RouterLink class="nav-link" to="/cities" @click="emit('navigate')">
        <MapPinned :size="18" />
        Города
      </RouterLink>
      <RouterLink class="nav-link" to="/branches" @click="emit('navigate')">
        <Building2 :size="18" />
        Филиалы
      </RouterLink>
      <RouterLink class="nav-link" to="/delivery-zones" @click="emit('navigate')">
        <Map :size="18" />
        Зоны доставки
      </RouterLink>

      <div class="mt-4 text-xs font-semibold uppercase text-muted-foreground">Система</div>
      <RouterLink class="nav-link" to="/admin-users" @click="emit('navigate')">
        <UserCog :size="18" />
        Пользователи
      </RouterLink>
      <RouterLink class="nav-link" to="/logs" @click="emit('navigate')">
        <FileText :size="18" />
        Логи
      </RouterLink>
      <RouterLink class="nav-link" to="/menu/settings" @click="emit('navigate')">
        <Settings :size="18" />
        Настройки меню
      </RouterLink>
    </nav>

    <div class="border border-border/60 bg-muted/60 p-4 text-xs text-muted-foreground">
      <div class="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Radio :size="16" />
        Live Ops
      </div>
      <div>Обновления заказов в реальном времени</div>
    </div>
  </aside>
</template>

<script setup>
import { RouterLink } from "vue-router";
import {
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Layers,
  ListTree,
  ListChecks,
  Map,
  MapPinned,
  Radio,
  Settings,
  Tag,
  UserCog,
  Users,
  UtensilsCrossed,
} from "lucide-vue-next";

const emit = defineEmits(["navigate"]);
</script>

<style scoped>
.nav-link {
  @apply flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground;
}

.router-link-active {
  @apply bg-primary/10 text-foreground;
}
</style>
