<template>
  <header class="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur">
    <div class="flex min-w-0 flex-1 items-center gap-2 px-3 sm:px-4">
      <button
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
        aria-label="Переключить меню"
        @click="emit('toggle-menu')"
      >
        <PanelLeft :size="18" />
      </button>
      <Separator orientation="vertical" class="hidden h-4 lg:block" />
      <Breadcrumb v-if="items.length" class="min-w-0 flex-1 overflow-hidden">
        <BreadcrumbList class="flex-nowrap overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <template v-for="(item, index) in items" :key="`${item.label}-${index}`">
            <BreadcrumbItem>
              <BreadcrumbLink v-if="item.to && index < items.length - 1" as-child>
                <RouterLink :to="item.to">{{ item.label }}</RouterLink>
              </BreadcrumbLink>
              <BreadcrumbPage v-else>{{ item.label }}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator v-if="index < items.length - 1" />
          </template>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
    <div class="ml-auto flex items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-4">
      <div class="hidden items-center gap-2 md:flex">
        <Select v-model="themeValue">
          <SelectTrigger class="h-9 w-[160px] text-xs">
            <div class="flex items-center gap-2">
              <component :is="activeThemeIcon" :size="14" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <div class="flex items-center gap-2">
                <Monitor :size="14" />
                Системный
              </div>
            </SelectItem>
            <SelectItem value="light">
              <div class="flex items-center gap-2">
                <Sun :size="14" />
                Светлый
              </div>
            </SelectItem>
            <SelectItem value="dark">
              <div class="flex items-center gap-2">
                <Moon :size="14" />
                Темный
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" size="icon-sm" class="md:hidden" aria-label="Сменить тему" @click="cycleTheme">
        <component :is="activeThemeIcon" :size="16" />
      </Button>
      <Button variant="outline" size="sm" class="h-9 px-2.5 sm:px-3" @click="openShiftPage">
        <ExternalLink :size="16" />
        <span class="hidden sm:inline">Текущая смена</span>
        <span class="sm:hidden">Смена</span>
      </Button>
    </div>
  </header>
</template>
<script setup>
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ExternalLink, PanelLeft, Monitor, Moon, Sun } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/shared/components/ui/breadcrumb";
import Separator from "@/shared/components/ui/separator/Separator.vue";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useTheme } from "@/shared/composables/useTheme.js";

defineProps({
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

const emit = defineEmits(["toggle-menu"]);
const route = useRoute();
const ordersStore = useOrdersStore();
const { theme, setTheme } = useTheme();
const themeValue = computed({
  get: () => theme.value,
  set: (value) => setTheme(value),
});
const activeThemeIcon = computed(() => {
  if (theme.value === "dark") return Moon;
  if (theme.value === "light") return Sun;
  return Monitor;
});
const cycleTheme = () => {
  const themes = ["system", "light", "dark"];
  const index = themes.indexOf(theme.value);
  const nextTheme = themes[(index + 1) % themes.length];
  setTheme(nextTheme);
};
const normalizePath = (path) => {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
};
const items = computed(() => {
  const storeCrumbs = ordersStore.breadcrumbs;
  if (storeCrumbs?.items?.length && storeCrumbs.owner === route.name) {
    return storeCrumbs.items.map((crumb) => ({
      label: crumb.label,
      to: crumb.to || null,
    }));
  }
  const metaCrumbs = route.meta?.breadcrumbs;
  if (Array.isArray(metaCrumbs) && metaCrumbs.length) {
    return metaCrumbs.map((crumb) => ({
      label: crumb.label,
      to: crumb.to || null,
    }));
  }
  const matched = route.matched.filter((record) => record.meta?.title);
  return matched.map((record, index) => ({
    label: record.meta.title,
    to: index < matched.length - 1 ? normalizePath(record.path) : null,
  }));
});
const openShiftPage = () => {
  window.open("/shift", "_blank");
};
</script>
