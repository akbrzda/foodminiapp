<template>
  <header class="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
    <div class="flex flex-col gap-3 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-6">
      <div class="min-w-0">
        <div class="flex items-start justify-between gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-sm font-semibold">
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
          <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-base font-semibold text-foreground">Текущая смена</div>
              <div class="truncate text-xs text-muted-foreground">{{ shiftSubtitle }}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              class="h-10 w-10 shrink-0 lg:hidden"
              aria-label="Открыть настройки смены"
              @click="mobileSettingsOpen = true"
            >
              <Settings :size="18" />
            </Button>
          </div>
        </div>
      </div>

      <div class="hidden w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid lg:w-auto lg:min-w-[520px]">
        <Select v-model="branchModel">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Выберите филиал" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="branch in branchOptions" :key="branch.id" :value="String(branch.id)">
              {{ branch.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="themeModel">
          <SelectTrigger class="h-10 w-full text-xs sm:w-[160px]">
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

        <Button variant="outline" class="w-full sm:w-auto" @click="$emit('openAdminPanel')">
          <ExternalLink :size="16" />
          Админ‑панель
        </Button>
      </div>

      <Dialog v-model:open="mobileSettingsOpen">
        <DialogContent class="w-[calc(100%-1.5rem)] max-w-md lg:hidden">
          <DialogHeader>
            <DialogTitle>Настройки смены</DialogTitle>
            <DialogDescription>Выберите филиал, настройте тему.</DialogDescription>
          </DialogHeader>

          <div class="space-y-3 pt-2">
            <div class="space-y-1.5">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиал</div>
              <Select v-model="branchModel">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите филиал" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="branch in branchOptions" :key="branch.id" :value="String(branch.id)">
                    {{ branch.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-1.5">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тема</div>
              <Select v-model="themeModel">
                <SelectTrigger class="w-full">
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

            <Button type="button" variant="outline" class="w-full" @click="openAdminFromModal">
              <ExternalLink :size="16" />
              Админ‑панель
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </header>
</template>

<script setup>
import { computed, ref } from "vue";
import { ExternalLink, Monitor, Moon, Settings, Sun } from "lucide-vue-next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Button from "@/shared/components/ui/button/Button.vue";

const props = defineProps({
  theme: { type: String, required: true },
  selectedBranchId: { type: String, required: true },
  branchOptions: { type: Array, required: true },
  shiftMeta: { type: Object, default: null },
  activeOrdersCount: { type: Number, default: 0 },
  deliveringCount: { type: Number, default: 0 },
  totalOrdersCount: { type: Number, default: 0 },
});

const emit = defineEmits(["update:theme", "update:selectedBranchId", "openAdminPanel"]);
const mobileSettingsOpen = ref(false);

const themeModel = computed({
  get: () => props.theme,
  set: (value) => emit("update:theme", value),
});

const branchModel = computed({
  get: () => props.selectedBranchId,
  set: (value) => emit("update:selectedBranchId", value),
});

const activeThemeIcon = computed(() => {
  if (props.theme === "dark") return Moon;
  if (props.theme === "light") return Sun;
  return Monitor;
});

const openAdminFromModal = () => {
  mobileSettingsOpen.value = false;
  emit("openAdminPanel");
};

const formatShiftDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: props.shiftMeta?.timezone || "UTC",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const shiftSubtitle = computed(() => {
  const start = formatShiftDate(props.shiftMeta?.start_at);
  const end = formatShiftDate(props.shiftMeta?.end_at);
  if (start && end) {
    return `Смена: ${start} - ${end}`;
  }
  return "Оперативное управление заказами";
});
</script>
