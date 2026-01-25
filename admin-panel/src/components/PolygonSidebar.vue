<template>
  <transition name="slide-fade">
    <div
      v-if="isOpen"
      class="absolute right-4 top-4 bottom-4 z-20 w-[340px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur flex flex-col"
    >
      <div class="flex items-start justify-between border-b border-border px-4 py-4">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-foreground truncate">{{ polygon?.name || "Полигон" }}</h2>
          <p class="text-xs text-muted-foreground">{{ polygon?.branch_name || "Филиал не указан" }}</p>
        </div>
        <button @click="emit('close')" class="rounded-md p-1 hover:bg-muted transition-colors">
          <X :size="20" />
        </button>
      </div>
      <div class="px-4 pt-3">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition"
            :class="activeTab === tab.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-4 pb-4 pt-4">
        <div v-if="activeTab === 'general'" class="space-y-4">
          <div>
            <p class="text-xs text-muted-foreground mb-2">Статус</p>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="editForm.is_active" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
              <span class="text-sm text-foreground">{{ editForm.is_active ? "Активен" : "Неактивен" }}</span>
            </label>
          </div>
          <div v-if="isBlocked" class="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20 p-4">
            <p class="text-sm font-medium text-orange-900 dark:text-orange-100 mb-2">🔒 Полигон заблокирован</p>
            <p v-if="polygon?.block_reason" class="text-sm text-orange-800 dark:text-orange-200 mb-1">{{ polygon.block_reason }}</p>
            <p v-if="polygon?.blocked_until" class="text-xs text-orange-600 dark:text-orange-400">До: {{ formatDateTime(polygon.blocked_until) }}</p>
          </div>
        </div>
        <div v-else-if="activeTab === 'delivery'" class="space-y-4">
          <div>
            <p class="text-xs text-muted-foreground mb-2">Плата за доставку</p>
            <Input v-model.number="editForm.delivery_cost" type="number" min="0" step="10" class="max-w-[200px]" />
          </div>
          <div>
            <p class="text-xs text-muted-foreground mb-2">Дополнительное время</p>
            <Input v-model.number="editForm.delivery_time" type="number" min="0" class="max-w-[200px]" />
            <p class="text-xs text-muted-foreground mt-1">00:{{ String(editForm.delivery_time || 0).padStart(2, "0") }}:00</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground mb-2">Минимальный заказ</p>
            <Input v-model.number="editForm.min_order_amount" type="number" min="0" step="10" class="max-w-[200px]" />
            <p class="text-xs text-muted-foreground mt-1">Нет</p>
          </div>
          <Button class="w-full" variant="outline" @click="emit('redraw', polygon)"> Перерисовать </Button>
        </div>
        <div v-else class="space-y-4">
          <div class="space-y-2">
            <label class="text-xs font-medium text-muted-foreground">Новый филиал</label>
            <Select v-model="transferBranchId">
              <option value="">Выберите филиал</option>
              <option v-for="branch in cityBranches" :key="branch.id" :value="branch.id" :disabled="branch.id === polygon?.branch_id">
                {{ branch.name }}{{ branch.id === polygon?.branch_id ? " (текущий)" : "" }}
              </option>
            </Select>
          </div>
          <Button class="w-full" @click="handleTransfer" :disabled="!transferBranchId || parseInt(transferBranchId) === polygon?.branch_id">
            Переключить
          </Button>
        </div>
        <div class="pt-2">
          <Button class="w-full" @click="saveChanges">
            <Save :size="16" />
            Сохранить
          </Button>
        </div>
      </div>
      <div class="border-t border-border p-4 space-y-2 bg-muted/30">
        <Button class="w-full" variant="outline" @click="emit(isBlocked ? 'unblock' : 'block', polygon)">
          <Unlock v-if="isBlocked" :size="16" />
          <Lock v-else :size="16" />
          {{ isBlocked ? "Разблокировать" : "Заблокировать" }}
        </Button>
        <Button class="w-full" variant="destructive" @click="emit('delete', polygon)">
          <Trash2 :size="16" />
          Удалить полигон
        </Button>
      </div>
    </div>
  </transition>
</template>
<script setup>
import { ref, computed, watch } from "vue";
import { Lock, Save, Trash2, Unlock, X } from "lucide-vue-next";
import Button from "./ui/Button.vue";
import Input from "./ui/Input.vue";
import Select from "./ui/Select.vue";
const props = defineProps({
  isOpen: Boolean,
  polygon: Object,
  cityBranches: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(["close", "save", "block", "unblock", "delete", "transfer", "redraw"]);
const transferBranchId = ref("");
const activeTab = ref("general");
const tabs = [
  { id: "general", label: "Общая информация" },
  { id: "delivery", label: "Доставка" },
  { id: "transfer", label: "Переключение" },
];
const editForm = ref({
  delivery_cost: 0,
  delivery_time: 30,
  min_order_amount: 0,
  courier_reward: 0,
  is_active: true,
});
const isBlocked = computed(() => {
  if (!props.polygon?.is_blocked) return false;
  if (!props.polygon?.blocked_from || !props.polygon?.blocked_until) return true;
  const now = new Date();
  const from = new Date(props.polygon.blocked_from);
  const until = new Date(props.polygon.blocked_until);
  return now >= from && now <= until;
});
watch(
  () => props.polygon,
  (newPolygon) => {
    if (newPolygon) {
      editForm.value = {
        delivery_cost: newPolygon.delivery_cost || 0,
        delivery_time: newPolygon.delivery_time || 30,
        min_order_amount: newPolygon.min_order_amount || 0,
        is_active: newPolygon.is_active === null || newPolygon.is_active === undefined ? true : Boolean(newPolygon.is_active),
      };
      transferBranchId.value = "";
      activeTab.value = "general";
    }
  },
  { immediate: true },
);
const formatDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  const date = new Date(dateTimeStr);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const saveChanges = () => {
  emit("save", {
    id: props.polygon.id,
    ...editForm.value,
  });
};
const handleTransfer = () => {
  if (!transferBranchId.value || parseInt(transferBranchId.value) === props.polygon?.branch_id) return;
  emit("transfer", {
    polygonId: props.polygon.id,
    newBranchId: parseInt(transferBranchId.value),
  });
};
</script>
<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}
.slide-fade-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.slide-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
