<template>
  <aside :class="asideClasses">
    <div class="flex h-full flex-col">
      <div class="flex min-h-[72px] items-center justify-between gap-3 border-b border-border/60 px-4">
        <div class="flex min-w-0 items-center gap-3">
            <div v-if="!isCollapsed" class="min-w-0">
            <p class="text-base font-semibold text-foreground">Управление</p>
            <p class="text-xs text-muted-foreground">Операционная панель</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="!isMobile"
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
            :title="collapseTitle"
            aria-label="Переключить ширину сайдбара"
            @click="emit('toggle-collapse')"
          >
            <ChevronRight v-if="isCollapsed" :size="16" />
            <ChevronLeft v-else :size="16" />
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground lg:hidden"
            aria-label="Закрыть меню"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <nav class="flex flex-col gap-2 text-sm">
          <div v-if="!isCollapsed" class="text-xs font-semibold uppercase text-muted-foreground">Операции</div>
          <RouterLink class="nav-link" to="/dashboard" @click="emit('navigate')">
            <LayoutDashboard :size="18" />
            <span v-if="!isCollapsed">Аналитика</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/orders" @click="emit('navigate')">
            <ClipboardList :size="18" />
            <span v-if="!isCollapsed">Заказы</span>
          </RouterLink>
          <RouterLink v-if="!isManager" class="nav-link" to="/clients" @click="emit('navigate')">
            <Users :size="18" />
            <span v-if="!isCollapsed">Клиенты</span>
          </RouterLink>

          <div v-if="!isCollapsed" class="mt-4 text-xs font-semibold uppercase text-muted-foreground">Меню</div>
          <RouterLink class="nav-link" to="/menu/categories" @click="emit('navigate')">
            <ListTree :size="18" />
            <span v-if="!isCollapsed">Категории</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/menu/items" @click="emit('navigate')">
            <UtensilsCrossed :size="18" />
            <span v-if="!isCollapsed">Позиции</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/menu/modifiers" @click="emit('navigate')">
            <Layers :size="18" />
            <span v-if="!isCollapsed">Модификаторы</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/menu/tags" @click="emit('navigate')">
            <Tag :size="18" />
            <span v-if="!isCollapsed">Теги</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/menu/stop-list" @click="emit('navigate')">
            <ListChecks :size="18" />
            <span v-if="!isCollapsed">Стоп-лист</span>
          </RouterLink>

          <div v-if="!isCollapsed" class="mt-4 text-xs font-semibold uppercase text-muted-foreground">Справочники</div>
          <RouterLink v-if="!isManager" class="nav-link" to="/cities" @click="emit('navigate')">
            <MapPinned :size="18" />
            <span v-if="!isCollapsed">Города</span>
          </RouterLink>
          <RouterLink v-if="!isManager" class="nav-link" to="/branches" @click="emit('navigate')">
            <Building2 :size="18" />
            <span v-if="!isCollapsed">Филиалы</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/delivery-zones" @click="emit('navigate')">
            <Map :size="18" />
            <span v-if="!isCollapsed">Зоны доставки</span>
          </RouterLink>

          <div v-if="!isCollapsed" class="mt-4 text-xs font-semibold uppercase text-muted-foreground">Система</div>
          <RouterLink v-if="!isManager" class="nav-link" to="/admin-users" @click="emit('navigate')">
            <UserCog :size="18" />
            <span v-if="!isCollapsed">Пользователи</span>
          </RouterLink>
          <RouterLink v-if="!isManager" class="nav-link" to="/logs" @click="emit('navigate')">
            <FileText :size="18" />
            <span v-if="!isCollapsed">Логи</span>
          </RouterLink>
          <RouterLink class="nav-link" to="/menu/settings" @click="emit('navigate')">
            <Settings :size="18" />
            <span v-if="!isCollapsed">Настройки меню</span>
          </RouterLink>
        </nav>
      </div>

      <div v-if="!isCollapsed" class="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
        <div class="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Radio :size="16" />
          Live Ops
        </div>
        <div>Обновления заказов в реальном времени</div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
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
  X,
} from "lucide-vue-next";

const props = defineProps({
  isOpen: { type: Boolean, default: true },
  isCollapsed: { type: Boolean, default: false },
});

const emit = defineEmits(["navigate", "close", "toggle-collapse"]);
const authStore = useAuthStore();
const isManager = computed(() => authStore.role === "manager");

const isMobile = ref(false);

const collapseTitle = computed(() => (props.isCollapsed ? "Развернуть меню" : "Свернуть меню"));

const updateIsMobile = () => {
  isMobile.value = window.innerWidth < 1024;
};

onMounted(() => {
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIsMobile);
});

const asideClasses = computed(() => ["sidebar", props.isOpen ? "is-open" : "is-closed", props.isCollapsed ? "is-collapsed" : ""]);
</script>

<style scoped>
.sidebar {
  @apply relative flex h-screen w-72 shrink-0 flex-col border-r border-border/60 bg-card/90 backdrop-blur transition-transform duration-200 lg:sticky lg:top-0;
}

.sidebar.is-collapsed {
  @apply w-20;
}

@media (max-width: 1023px) {
  .sidebar {
    @apply fixed inset-y-0 left-0 z-50 -translate-x-full;
  }

  .sidebar.is-open {
    @apply translate-x-0;
  }

  .sidebar.is-collapsed {
    @apply w-72;
  }
}

.nav-link {
  @apply flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground;
}

.sidebar.is-collapsed .nav-link {
  @apply justify-center px-0;
}

.router-link-active {
  @apply bg-primary/10 text-foreground;
}
</style>
