<template>
  <section class="flex w-[40%] min-w-[480px] flex-col border-r border-border bg-muted/40 p-4">
    <!-- Табы и фильтры -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 border-b border-transparent">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="relative px-3 py-2 text-sm font-semibold transition-colors"
          :class="tabButtonClass(tab.value)"
          @click="$emit('update:activeTab', tab.value)"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.badge !== null"
            class="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
            :class="tabBadgeClass(tab.value)"
          >
            {{ tab.badge }}
          </span>
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="gap-2">
            {{ orderTypeFilterLabel }}
            <ChevronDown :size="14" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup :model-value="orderTypeFilter" @update:model-value="$emit('update:orderTypeFilter', $event)">
            <DropdownMenuRadioItem value="all">Все</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="delivery">Доставка</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="pickup">Самовывоз</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Поиск -->
    <div v-if="activeTab === 'search'" class="mt-3">
      <Field>
        <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</FieldLabel>
        <FieldContent>
          <div class="relative mt-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
            <Input
              ref="searchInputRef"
              :model-value="searchQuery"
              class="pl-9 pr-9"
              placeholder="Поиск по номеру, телефону или адресу"
              @update:model-value="$emit('update:searchQuery', $event)"
              @keydown.esc.prevent="$emit('clearSearch')"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent/60"
              @click="$emit('clearSearch')"
            >
              <X :size="14" />
            </button>
          </div>
        </FieldContent>
      </Field>
    </div>

    <!-- Список заказов -->
    <div class="mt-4 flex-1 overflow-y-auto pr-1">
      <div v-if="visibleOrders.length === 0" class="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
        <component :is="emptyStateIcon" :size="28" />
        <div class="max-w-[240px]">
          <div class="font-semibold text-muted-foreground">{{ emptyStateTitle }}</div>
          <div v-if="emptyStateSubtitle" class="text-xs text-muted-foreground/70">{{ emptyStateSubtitle }}</div>
        </div>
      </div>

      <div v-else class="space-y-3 pb-6">
        <OrderCard
          v-for="order in visibleOrders"
          :key="order.id"
          :order="order"
          :is-expanded="expandedOrderId === order.id"
          :is-recent="recentOrderIds.has(order.id)"
          @toggle="$emit('toggleOrder', order)"
          @change-status="$emit('changeStatus', order)"
          @cancel="$emit('openCancelDialog', order)"
          @set-ref="(el) => $emit('setOrderRef', order.id, el)"
        />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { ChevronDown, PackageOpen, Search, X } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu/index.js";
import OrderCard from "./OrderCard.vue";

const props = defineProps({
  activeTab: { type: String, required: true },
  orderTypeFilter: { type: String, required: true },
  searchQuery: { type: String, required: true },
  debouncedSearch: { type: String, required: true },
  visibleOrders: { type: Array, required: true },
  expandedOrderId: { type: [Number, null], default: null },
  recentOrderIds: { type: Set, required: true },
  tabs: { type: Array, required: true },
});

defineEmits([
  "update:activeTab",
  "update:orderTypeFilter",
  "update:searchQuery",
  "clearSearch",
  "toggleOrder",
  "changeStatus",
  "openCancelDialog",
  "setOrderRef",
]);

const searchInputRef = ref(null);

// Метка фильтра по типу заказа
const orderTypeFilterLabel = computed(() => {
  if (props.orderTypeFilter === "delivery") return "Доставка";
  if (props.orderTypeFilter === "pickup") return "Самовывоз";
  return "Все";
});

// Стили для кнопок табов
const tabButtonClass = (value) => {
  return value === props.activeTab ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground";
};

// Стили для бейджей табов
const tabBadgeClass = (value) => {
  return value === props.activeTab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
};

// Иконка пустого состояния
const emptyStateIcon = computed(() => {
  if (props.activeTab === "search" && !props.debouncedSearch) return Search;
  return PackageOpen;
});

// Заголовок пустого состояния
const emptyStateTitle = computed(() => {
  if (props.activeTab === "search" && props.debouncedSearch) {
    return "Ничего не найдено";
  }
  return "Нет заказов";
});

// Подзаголовок пустого состояния
const emptyStateSubtitle = computed(() => {
  if (props.activeTab === "search" && props.debouncedSearch) {
    return "Попробуйте изменить запрос";
  }
  return "";
});

defineExpose({ searchInputRef });
</script>
