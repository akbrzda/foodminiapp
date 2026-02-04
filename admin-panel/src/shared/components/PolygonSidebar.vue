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
            <Label class="flex items-center gap-2 cursor-pointer">
              <input v-model="editForm.is_active" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
              <span class="text-sm text-foreground">{{ editForm.is_active ? "Активен" : "Неактивен" }}</span>
            </Label>
          </div>
          <div>
            <p class="text-xs text-muted-foreground mb-2">Время доставки</p>
            <Input v-model.number="editForm.delivery_time" type="number" min="0" class="max-w-[200px]" />
            <p class="text-xs text-muted-foreground mt-1">00:{{ String(editForm.delivery_time || 0).padStart(2, "0") }}:00</p>
          </div>
          <Button class="w-full" variant="outline" @click="emit('redraw', polygon)"> Перерисовать </Button>
          <div v-if="isBlocked" class="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20 p-4">
            <p class="text-sm font-medium text-orange-900 dark:text-orange-100 mb-2">🔒 Полигон заблокирован</p>
            <p v-if="polygon?.block_reason" class="text-sm text-orange-800 dark:text-orange-200 mb-1">{{ polygon.block_reason }}</p>
            <p v-if="polygon?.blocked_until" class="text-xs text-orange-600 dark:text-orange-400">До: {{ formatDateTime(polygon.blocked_until) }}</p>
          </div>
        </div>
        <div v-else-if="activeTab === 'delivery'" class="space-y-4">
          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Стоимость доставки</p>
            <div v-if="tariffsLoading" class="text-xs text-muted-foreground">Загрузка тарифов...</div>
            <div v-else-if="tariffs.length === 0" class="text-xs text-muted-foreground">Тарифы не настроены.</div>
            <div v-else class="flex flex-wrap items-center gap-2">
              <div
                v-for="(tariff, index) in visibleTariffs"
                :key="tariff.id || index"
                class="rounded-full border px-3 py-1 text-xs font-semibold"
                :class="tariff.delivery_cost === 0 ? 'border-emerald-400 text-emerald-500' : 'border-border text-muted-foreground'"
              >
                <span v-if="tariff.ellipsis">• • •</span>
                <div v-else class="flex flex-col items-center leading-tight">
                  <span>{{ tariff.delivery_cost }} ₽</span>
                  <span class="text-[10px] text-muted-foreground">от {{ tariff.amount_from }} ₽</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" class="flex-1" @click="emit('edit-tariffs', polygon)">
              <Edit3 :size="16" />
              {{ tariffs.length ? "Редактировать" : "Добавить" }}
            </Button>
            <Button v-if="tariffs.length === 0 && tariffSources.length" variant="outline" class="flex-1" @click="emit('copy-tariffs', polygon)">
              <Copy :size="16" />
              Скопировать
            </Button>
          </div>
        </div>
        <div v-else class="space-y-4">
          <div class="space-y-2">
            <Label class="text-xs font-medium text-muted-foreground">Новый филиал</Label>
            <Select v-model="transferBranchId">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите филиал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Выберите филиал</SelectItem>
                <SelectItem v-for="branch in cityBranches" :key="branch.id" :value="branch.id" :disabled="branch.id === polygon?.branch_id">
                  {{ branch.name }}{{ branch.id === polygon?.branch_id ? " (текущий)" : "" }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button class="w-full" @click="handleTransfer" :disabled="!transferBranchId || parseInt(transferBranchId) === polygon?.branch_id">
            Переключить
          </Button>
        </div>
      </div>
      <div class="border-t border-border p-4 space-y-2 bg-muted/30">
        <Button class="w-full" @click="saveChanges">
          <Save :size="16" />
          Сохранить
        </Button>
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
import { Copy, Edit3, Lock, Save, Trash2, Unlock, X } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";
const props = defineProps({
  isOpen: Boolean,
  polygon: Object,
  tariffs: {
    type: Array,
    default: () => [],
  },
  tariffsLoading: Boolean,
  tariffSources: {
    type: Array,
    default: () => [],
  },
  cityBranches: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(["close", "save", "block", "unblock", "delete", "transfer", "redraw", "edit-tariffs", "copy-tariffs"]);
const transferBranchId = ref("");
const activeTab = ref("general");
const tabs = [
  { id: "general", label: "Общая информация" },
  { id: "delivery", label: "Доставка" },
  { id: "transfer", label: "Переключение" },
];
const editForm = ref({
  delivery_time: 30,
  courier_reward: 0,
  is_active: true,
});
const visibleTariffs = computed(() => {
  if (!props.tariffs || props.tariffs.length <= 5) return props.tariffs || [];
  const list = props.tariffs || [];
  return [...list.slice(0, 3), { ellipsis: true }, list[list.length - 1]];
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
        delivery_time: newPolygon.delivery_time || 30,
        is_active: newPolygon.is_active === null || newPolygon.is_active === undefined ? true : Boolean(newPolygon.is_active),
      };
      transferBranchId.value = "";
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
