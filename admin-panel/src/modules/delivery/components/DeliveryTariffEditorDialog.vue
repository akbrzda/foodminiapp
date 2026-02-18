<template>
  <Dialog v-if="open" :open="open" @update:open="(value) => (value ? null : emit('close'))">
    <DialogContent class="w-full max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ subtitle }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-foreground">Тарифные ступени</p>
            <p class="text-xs text-muted-foreground">Диапазоны должны идти подряд без пропусков.</p>
          </div>
          <Button size="sm" variant="secondary" @click="addTariff">
            <Plus :size="16" />
            Добавить ступень
          </Button>
        </div>
        <div class="overflow-hidden rounded-lg border border-border">
          <div class="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>От</span>
            <span>До</span>
            <span>Стоимость доставки</span>
            <span></span>
          </div>
          <div v-if="localTariffs.length === 0" class="px-4 py-6 text-sm text-muted-foreground">
            Добавьте первую ступень для настройки тарифов.
          </div>
          <div v-else class="divide-y divide-border">
            <div v-for="(tariff, index) in localTariffs" :key="index" class="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-4 py-3">
              <Input v-model.number="tariff.amount_from" type="number" min="0" step="1" readonly class="bg-muted/40" />
              <Input v-model="tariff.amount_to" type="number" min="0" step="1" placeholder="∞" @update:modelValue="onAmountToChange(index)" />
              <Input v-model.number="tariff.delivery_cost" type="number" min="0" step="1" />
              <button
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-destructive hover:text-destructive"
                @click="removeTariff(index)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>
        <div v-if="showValidationErrors && errors.length" class="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <div class="flex items-center gap-2 font-medium">
            <AlertTriangle :size="16" />
            Ошибки валидации
          </div>
          <ul class="mt-2 space-y-1 text-xs">
            <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
          </ul>
        </div>
      </div>
      <DialogFooter class="mt-6 gap-2">
        <Button variant="outline" @click="emit('close')">Отмена</Button>
        <Button @click="submit">Сохранить</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { AlertTriangle, Plus, Trash2 } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";

const props = defineProps({
  open: Boolean,
  tariffs: {
    type: Array,
    default: () => [],
  },
  title: {
    type: String,
    default: "Редактировать тарифы",
  },
  subtitle: {
    type: String,
    default: "Настройте диапазоны сумм заказа и стоимость доставки.",
  },
});

const emit = defineEmits(["close", "save"]);

const localTariffs = ref([]);
const showValidationErrors = ref(false);

const toIntOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : null;
};

const toInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : null;
};

const validate = (tariffs) => {
  const errors = [];
  if (!tariffs || tariffs.length === 0) {
    errors.push("Тарифные ступени не заданы.");
    return errors;
  }
  const normalized = tariffs.map((tariff) => ({
    amount_from: toInt(tariff.amount_from),
    amount_to: toIntOrNull(tariff.amount_to),
    delivery_cost: toInt(tariff.delivery_cost),
  }));
  const sorted = [...normalized].sort((a, b) => (a.amount_from ?? 0) - (b.amount_from ?? 0));
  const costs = new Set();
  sorted.forEach((tariff, index) => {
    const row = index + 1;
    if (!Number.isInteger(tariff.amount_from) || tariff.amount_from < 0) {
      errors.push(`Строка ${row}: поле "От" должно быть целым числом >= 0.`);
      return;
    }
    if (tariff.amount_to !== null) {
      if (!Number.isInteger(tariff.amount_to)) {
        errors.push(`Строка ${row}: поле "До" должно быть целым числом.`);
        return;
      }
      if (tariff.amount_to <= tariff.amount_from) {
        errors.push(`Строка ${row}: поле "До" должно быть больше поля "От".`);
      }
    }
    if (!Number.isInteger(tariff.delivery_cost) || tariff.delivery_cost < 0) {
      errors.push(`Строка ${row}: стоимость доставки должна быть целым числом >= 0.`);
    }
    if (Number.isInteger(tariff.delivery_cost)) {
      if (costs.has(tariff.delivery_cost)) {
        errors.push(`Строка ${row}: стоимость доставки должна быть уникальной.`);
      }
      costs.add(tariff.delivery_cost);
    }
    if (index > 0) {
      const prev = sorted[index - 1];
      if (prev.amount_to === null) {
        errors.push(`Строка ${row}: диапазон не может идти после ступени без верхней границы.`);
      } else if (Number.isInteger(prev.amount_to)) {
        const expectedFrom = prev.amount_to + 1;
        if (tariff.amount_from !== expectedFrom) {
          errors.push(`Строка ${row}: ожидается "От" = ${expectedFrom} для непрерывного диапазона.`);
        }
      }
    }
  });
  const first = sorted[0];
  if (first && first.amount_from !== 0) {
    errors.push("Первая ступень должна начинаться с 0 ₽.");
  }
  const last = sorted[sorted.length - 1];
  if (last && last.amount_to !== null) {
    errors.push("Последняя ступень должна быть без верхней границы (поле 'До' пустое).");
  }
  return errors;
};

const errors = computed(() => validate(localTariffs.value));
const syncTariffRanges = (startIndex = 0) => {
  if (!localTariffs.value.length) return;
  if (startIndex <= 0) {
    localTariffs.value[0].amount_from = 0;
    startIndex = 1;
  }
  for (let index = Math.max(1, startIndex); index < localTariffs.value.length; index += 1) {
    const prev = localTariffs.value[index - 1];
    const prevTo = toIntOrNull(prev?.amount_to);
    localTariffs.value[index].amount_from = prevTo === null ? "" : prevTo + 1;
  }
};

const onAmountToChange = (index) => {
  syncTariffRanges(index + 1);
};

const addTariff = () => {
  const last = localTariffs.value[localTariffs.value.length - 1];
  const lastTo = toIntOrNull(last?.amount_to);
  const nextFrom = last ? (lastTo === null ? "" : lastTo + 1) : 0;
  localTariffs.value.push({
    amount_from: nextFrom,
    amount_to: "",
    delivery_cost: 0,
  });
  syncTariffRanges(localTariffs.value.length - 1);
};

const removeTariff = (index) => {
  localTariffs.value.splice(index, 1);
  syncTariffRanges(index);
};

const submit = () => {
  showValidationErrors.value = true;
  if (errors.value.length > 0) {
    return;
  }
  const normalized = localTariffs.value.map((tariff) => ({
    amount_from: toInt(tariff.amount_from),
    amount_to: toIntOrNull(tariff.amount_to),
    delivery_cost: toInt(tariff.delivery_cost),
  }));
  emit("save", normalized);
};

watch(
  () => props.open,
  (value) => {
    if (!value) return;
    showValidationErrors.value = false;
    localTariffs.value = (props.tariffs || []).map((tariff) => ({
      amount_from: tariff.amount_from ?? 0,
      amount_to: tariff.amount_to ?? "",
      delivery_cost: tariff.delivery_cost ?? 0,
    }));
    syncTariffRanges(0);
  },
  { immediate: true },
);
</script>
