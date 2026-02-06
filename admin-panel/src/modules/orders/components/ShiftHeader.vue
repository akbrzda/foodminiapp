<template>
  <header class="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
    <div class="flex h-[72px] items-center justify-between gap-6 px-6">
      <div class="flex items-center gap-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary text-sm font-semibold">
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
        <div class="min-w-0">
          <div class="text-base font-semibold text-foreground">Текущая смена</div>
          <div class="text-xs text-muted-foreground">Оперативное управление заказами</div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="hidden items-center gap-2 sm:flex">
          <Select v-model="themeModel">
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
        <div class="min-w-[260px]">
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
        <Button variant="outline" @click="$emit('openAdminPanel')">
          <ExternalLink :size="16" />
          Админ‑панель
        </Button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from "vue";
import { ExternalLink, Monitor, Moon, Sun } from "lucide-vue-next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Button from "@/shared/components/ui/button/Button.vue";

const props = defineProps({
  theme: { type: String, required: true },
  selectedBranchId: { type: String, required: true },
  branchOptions: { type: Array, required: true },
});

const emit = defineEmits(["update:theme", "update:selectedBranchId", "openAdminPanel"]);

// Двусторонняя привязка для темы
const themeModel = computed({
  get: () => props.theme,
  set: (value) => emit("update:theme", value),
});

// Двусторонняя привязка для филиала
const branchModel = computed({
  get: () => props.selectedBranchId,
  set: (value) => emit("update:selectedBranchId", value),
});

// Иконка активной темы
const activeThemeIcon = computed(() => {
  if (props.theme === "dark") return Moon;
  if (props.theme === "light") return Sun;
  return Monitor;
});
</script>
