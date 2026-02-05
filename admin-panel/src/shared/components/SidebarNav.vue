<template>
  <aside :class="asideClasses">
    <div class="flex h-full flex-col">
      <div :class="['flex items-center', isCollapsed ? 'justify-center py-4' : 'min-h-[72px] gap-3 px-4']">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-panda-icon lucide-panda"
          >
            <path d="M11.25 17.25h1.5L12 18z" />
            <path d="m15 12 2 2" />
            <path d="M18 6.5a.5.5 0 0 0-.5-.5" />
            <path
              d="M20.69 9.67a4.5 4.5 0 1 0-7.04-5.5 8.35 8.35 0 0 0-3.3 0 4.5 4.5 0 1 0-7.04 5.5C2.49 11.2 2 12.88 2 14.5 2 19.47 6.48 22 12 22s10-2.53 10-7.5c0-1.62-.48-3.3-1.3-4.83"
            />
            <path d="M6 6.5a.495.495 0 0 1 .5-.5" />
            <path d="m9 12-2 2" />
          </svg>
        </div>
        <div v-if="!isCollapsed" class="min-w-0">
          <p class="truncate text-base font-semibold text-foreground">Panda Pizza</p>
          <p class="text-xs text-muted-foreground">Админ-панель</p>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-3">
        <nav :class="['flex flex-col text-sm', isCollapsed ? '' : 'gap-3']">
          <div v-for="section in navSections" :key="section.id" class="space-y-1">
            <div v-if="!isCollapsed" class="nav-group-title">
              {{ section.title }}
            </div>
            <div class="flex flex-col gap-1">
              <RouterLink
                v-for="item in section.items"
                :key="item.label"
                :to="item.to"
                class="nav-link"
                :title="item.label"
                @click="emit('navigate')"
              >
                <component :is="item.icon" :size="18" />
                <span v-if="!isCollapsed" class="truncate">{{ item.label }}</span>
                <span
                  v-if="item.badge && item.badge > 0"
                  :class="[
                    'ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                    isCollapsed ? 'absolute right-2 top-2' : '',
                  ]"
                  class="bg-amber-100 text-amber-700"
                >
                  {{ item.badge }}
                </span>
              </RouterLink>
            </div>
          </div>
        </nav>
      </div>
      <div class="border-t border-border/60 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent/40"
              :title="userName"
            >
              <Avatar class="h-9 w-9">
                <AvatarFallback>{{ initials }}</AvatarFallback>
              </Avatar>
              <div v-if="!isCollapsed" class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ userName }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ userRole }}</div>
              </div>
              <ChevronsUpDown v-if="!isCollapsed" :size="16" class="text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-56">
            <DropdownMenuLabel>
              {{ userName || "Профиль" }}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="authStore.logout()">
              <LogOut :size="16" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </aside>
</template>
<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import {
  Building2,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Layers,
  Ban,
  ListTree,
  Map,
  MapPinned,
  Megaphone,
  SlidersHorizontal,
  Tag,
  UserCog,
  Users,
  UtensilsCrossed,
  LogOut,
} from "lucide-vue-next";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  isCollapsed: { type: Boolean, default: true },
});

const emit = defineEmits(["navigate", "close"]);
const authStore = useAuthStore();
const ordersStore = useOrdersStore();
const isManager = computed(() => authStore.role === "manager");
const newOrdersCount = computed(() => ordersStore.newOrdersCount);
const initials = computed(() => {
  const first = authStore.user?.first_name?.[0] || "";
  const last = authStore.user?.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase() || "PA";
});
const userName = computed(() => {
  const first = authStore.user?.first_name || "";
  const last = authStore.user?.last_name || "";
  return `${first} ${last}`.trim() || "Пользователь";
});
const userRole = computed(() => authStore.user?.role || "");

const navSections = computed(() => {
  const sections = [
    {
      id: "operations",
      title: "Операции",
      items: [
        { label: "Дашборд", to: "/dashboard", icon: LayoutDashboard },
        { label: "Заказы", to: "/orders", icon: ClipboardList, badge: newOrdersCount.value },
        { label: "Клиенты", to: "/clients", icon: Users },
        { label: "Рассылки", to: "/broadcasts", icon: Megaphone, visible: !isManager.value },
      ],
    },
    {
      id: "menu",
      title: "Меню",
      items: [
        { label: "Категории", to: "/menu/categories", icon: ListTree, visible: !isManager.value },
        { label: "Позиции", to: "/menu/items", icon: UtensilsCrossed, visible: !isManager.value },
        { label: "Модификаторы", to: "/menu/modifiers", icon: Layers, visible: !isManager.value },
        { label: "Теги", to: "/menu/tags", icon: Tag, visible: !isManager.value },
        { label: "Стоп-лист", to: "/menu/stop-list", icon: Ban },
      ],
    },
    {
      id: "references",
      title: "Справочники",
      items: [
        { label: "Города", to: "/cities", icon: MapPinned, visible: !isManager.value },
        { label: "Филиалы", to: "/branches", icon: Building2 },
        { label: "Зоны доставки", to: "/delivery-zones", icon: Map },
      ],
    },
    {
      id: "system",
      title: "Система",
      visible: !isManager.value,
      items: [
        { label: "Настройки системы", to: "/system/settings", icon: SlidersHorizontal },
        { label: "Пользователи", to: "/admin-users", icon: UserCog },
        { label: "Логи", to: "/logs", icon: FileText },
      ],
    },
  ];

  return sections
    .filter((section) => section.visible !== false)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.visible !== false),
    }))
    .filter((section) => section.items.length > 0);
});

const asideClasses = computed(() => ["sidebar", props.isOpen ? "is-open" : "is-closed", props.isCollapsed ? "is-collapsed" : ""]);
</script>
<style scoped>
.sidebar {
  @apply relative flex h-screen w-60 shrink-0 flex-col border-r border-border/60 bg-card/90 backdrop-blur transition-all duration-200 lg:sticky lg:top-0;
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
.nav-group-title {
  @apply px-3 text-[11px] font-semibold uppercase text-muted-foreground;
}
.nav-link {
  @apply relative flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground;
}
.sidebar.is-collapsed .nav-link {
  @apply justify-center px-0;
}
.router-link-active {
  @apply bg-primary/10 text-foreground;
}
</style>
