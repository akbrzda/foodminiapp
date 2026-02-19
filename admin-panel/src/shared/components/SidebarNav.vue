<template>
  <aside :class="asideClasses">
    <div class="flex h-full flex-col">
      <button
        v-if="isOpen"
        type="button"
        class="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground lg:hidden"
        aria-label="Закрыть меню"
        @click.stop="handleClose"
      >
        <X :size="16" />
      </button>
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
          <p class="text-xs text-muted-foreground">
            Админ-панель |
            <button
              type="button"
              class="text-left text-xs text-muted-foreground transition hover:bg-accent/30 hover:text-foreground"
              :title="`Версия ${sidebarVersion}`"
              @click="openChangelogModal"
            >
              <span v-if="!isCollapsed">v{{ sidebarVersion }}</span>
              <span v-else>v</span>
            </button>
          </p>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-3 pb-3">
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
      <div class="border-t border-border/60 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
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
  <Dialog v-model:open="versionModalOpen">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Что нового</DialogTitle>
        <DialogDescription>История релизов и изменений продукта</DialogDescription>
      </DialogHeader>
      <div v-if="changelogLoading" class="space-y-2">
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
      </div>
      <div v-else-if="changelogReleases.length" class="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        <div v-for="release in changelogReleases" :key="release.id" class="rounded-lg border border-border/60 bg-muted/20">
          <button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left" @click="toggleRelease(release)">
            <div class="min-w-0">
              <div class="text-xs text-muted-foreground">v{{ release.version }} · {{ formatReleaseDate(release.published_at) }}</div>
              <div class="truncate text-sm font-medium text-foreground">{{ release.title }}</div>
            </div>
            <ChevronDown
              :size="16"
              class="shrink-0 text-muted-foreground transition-transform"
              :class="expandedReleaseId === release.id ? 'rotate-180' : ''"
            />
          </button>
          <div v-if="expandedReleaseId === release.id" class="border-t border-border/60 px-3 py-2">
            <div v-if="releaseDetailsLoadingId === release.id" class="space-y-2">
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-5/6" />
            </div>
            <template v-else>
              <div v-if="releaseDetailsMap[release.id]?.description" class="mb-2 text-sm text-muted-foreground">
                {{ releaseDetailsMap[release.id].description }}
              </div>
              <div v-if="releaseDetailsMap[release.id]?.items?.length" class="space-y-1">
                <div v-for="item in releaseDetailsMap[release.id].items" :key="item.id" class="flex gap-2 text-sm">
                  <span class="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                    {{ getItemTypeLabel(item.item_type) }}
                  </span>
                  <span class="text-foreground">{{ item.title }}</span>
                </div>
              </div>
              <div v-else class="text-sm text-muted-foreground">Пункты релиза не заполнены</div>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-muted-foreground">Опубликованных релизов пока нет</div>
    </DialogContent>
  </Dialog>
</template>
<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import api from "@/shared/api/client.js";
import {
  Building2,
  ChevronDown,
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
  PlugZap,
  SlidersHorizontal,
  Tag,
  UserCog,
  Users,
  UtensilsCrossed,
  LogOut,
  X,
} from "lucide-vue-next";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  isCollapsed: { type: Boolean, default: true },
});

const emit = defineEmits(["navigate", "close"]);
const authStore = useAuthStore();
const ordersStore = useOrdersStore();
const sidebarVersion = ref("—");
const versionModalOpen = ref(false);
const changelogLoading = ref(false);
const changelogReleases = ref([]);
const expandedReleaseId = ref(null);
const releaseDetailsLoadingId = ref(null);
const releaseDetailsMap = ref({});
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
        { label: "Блюда", to: "/menu/products", icon: UtensilsCrossed, visible: !isManager.value },
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
        { label: "Интеграции", to: "/integrations", icon: PlugZap },
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
const handleClose = () => {
  emit("close");
};

const formatReleaseDate = (value) => {
  if (!value) return "Без даты";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value));
};

const getItemTypeLabel = (itemType) => {
  if (itemType === "fix") return "Исправление";
  if (itemType === "breaking") return "Важно";
  if (itemType === "internal") return "Сервисное";
  return "Новое";
};

const loadSidebarVersion = async () => {
  try {
    const latestResponse = await api.get("/api/changelog/latest");
    const latestVersion = latestResponse.data?.release?.version;
    if (latestVersion) {
      sidebarVersion.value = latestVersion;
      return;
    }
  } catch (error) {
    // ignore and fallback to /api version
  }

  try {
    const apiInfoResponse = await api.get("/api");
    sidebarVersion.value = apiInfoResponse.data?.version || "—";
  } catch (error) {
    sidebarVersion.value = "—";
  }
};

const openChangelogModal = async () => {
  versionModalOpen.value = true;
  if (changelogReleases.value.length > 0 || changelogLoading.value) return;
  changelogLoading.value = true;
  try {
    const response = await api.get("/api/changelog/releases", { params: { page: 1, limit: 20 } });
    changelogReleases.value = response.data?.items || [];
  } catch (error) {
    changelogReleases.value = [];
  } finally {
    changelogLoading.value = false;
  }
};

const toggleRelease = async (release) => {
  if (expandedReleaseId.value === release.id) {
    expandedReleaseId.value = null;
    return;
  }

  expandedReleaseId.value = release.id;

  if (releaseDetailsMap.value[release.id] || releaseDetailsLoadingId.value === release.id) {
    return;
  }

  releaseDetailsLoadingId.value = release.id;
  try {
    const response = await api.get(`/api/changelog/releases/${release.id}`);
    releaseDetailsMap.value = {
      ...releaseDetailsMap.value,
      [release.id]: response.data?.release || null,
    };
  } catch (error) {
    releaseDetailsMap.value = {
      ...releaseDetailsMap.value,
      [release.id]: null,
    };
  } finally {
    releaseDetailsLoadingId.value = null;
  }
};

onMounted(() => {
  loadSidebarVersion();
});
</script>
<style scoped>
.sidebar {
  @apply relative flex h-dvh w-60 shrink-0 flex-col border-r border-border/60 bg-card/90 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur transition-all duration-200 lg:sticky lg:top-0 lg:h-screen;
}
.sidebar.is-collapsed {
  @apply w-20;
}
@media (max-width: 1023px) {
  .sidebar {
    @apply fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] -translate-x-full;
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
