<template>
  <div class="space-y-4">
    <Field>
      <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Логика</FieldLabel>
      <FieldContent>
        <div class="flex flex-wrap items-center gap-3">
          <div class="space-y-1">
            <Select v-model="localOperator">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Логика" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">И</SelectItem>
                <SelectItem value="OR">ИЛИ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" class="h-10" @click="addCondition">
            <Plus :size="16" />
            Добавить условие
          </Button>
        </div>
      </FieldContent>
    </Field>

    <div v-if="!conditions.length" class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      Добавьте хотя бы одно условие сегментации.
    </div>

    <div v-for="(condition, index) in conditions" :key="condition.id" class="rounded-xl border border-border bg-muted/20 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Условие #{{ index + 1 }}</div>
        <Button type="button" size="icon" variant="ghost" @click="removeCondition(index)">
          <Trash2 :size="16" class="text-red-600" />
        </Button>
      </div>
      <FieldGroup class="mt-3 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field>
          <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип</FieldLabel>
          <FieldContent>
            <Select v-model="condition.type">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inactive_days">Нет заказов N дней</SelectItem>
                <SelectItem value="active_in_period">Активные в периоде</SelectItem>
                <SelectItem value="new_users">Новые пользователи</SelectItem>
                <SelectItem value="total_spent">Сумма заказов</SelectItem>
                <SelectItem value="avg_check">Средний чек</SelectItem>
                <SelectItem value="order_count">Кол-во заказов</SelectItem>
                <SelectItem value="city">Город</SelectItem>
                <SelectItem value="branch">Филиал</SelectItem>
                <SelectItem value="birthday_month">Месяц рождения</SelectItem>
                <SelectItem value="birthday_range">Диапазон дат рождения</SelectItem>
                <SelectItem value="loyalty_level">Уровень лояльности</SelectItem>
                <SelectItem value="bonus_balance">Баланс бонусов</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field v-show="showOperator(condition)">
          <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Оператор</FieldLabel>
          <FieldContent>
            <Select v-model="condition.operator">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите оператор" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="op in operatorOptions(condition.type)" :key="op" :value="op">{{ op }}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field v-show="showValue(condition)">
          <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Значение</FieldLabel>
          <FieldContent>
            <Input v-model="condition.value" :type="valueInputType(condition.type)" placeholder="Введите значение" />
          </FieldContent>
        </Field>
      </FieldGroup>

      <FieldGroup v-if="requiresBetween(condition)" class="mt-3 grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">От</FieldLabel>
          <FieldContent>
            <Input v-model="condition.value_from" type="number" placeholder="0" />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">До</FieldLabel>
          <FieldContent>
            <Input v-model="condition.value_to" type="number" placeholder="0" />
          </FieldContent>
        </Field>
      </FieldGroup>

      <Field v-if="needsDateRange(condition.type)" class="mt-3">
        <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</FieldLabel>
        <FieldContent>
          <div class="max-w-xl rounded-md border border-border bg-card">
            <CalendarView
              :model-value="getConditionRange(condition)"
              :number-of-months="1"
              locale="ru-RU"
              multiple
              @update:modelValue="(value) => updateConditionRange(condition, value)"
            />
          </div>
          <div class="text-xs text-muted-foreground">С: {{ condition.date_from || "—" }} · По: {{ condition.date_to || "—" }}</div>
        </FieldContent>
      </Field>

      <Field v-if="needsCity(condition.type)" class="mt-3">
        <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
        <FieldContent>
          <div class="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Select v-model="condition.value">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите город" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Выберите город</SelectItem>
                <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
              </SelectContent>
            </Select>
            <Input v-if="condition.operator === 'IN'" v-model="condition.value_list" placeholder="1,2,3" />
          </div>
          <p v-if="condition.operator === 'IN'" class="text-xs text-muted-foreground">Для IN укажите ID городов через запятую.</p>
        </FieldContent>
      </Field>

      <Field v-if="needsBranch(condition.type)" class="mt-3">
        <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Филиал</FieldLabel>
        <FieldContent>
          <div class="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Select v-model="condition.value">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите филиал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Выберите филиал</SelectItem>
                <SelectItem v-for="branch in branches" :key="branch.id" :value="branch.id">
                  {{ branch.name }}{{ branch.city_name ? ` · ${branch.city_name}` : "" }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input v-if="condition.operator === 'IN'" v-model="condition.value_list" placeholder="10,11" />
          </div>
          <p v-if="condition.operator === 'IN'" class="text-xs text-muted-foreground">Для IN укажите ID филиалов через запятую.</p>
        </FieldContent>
      </Field>

      <Field v-if="condition.type === 'birthday_month'" class="mt-3">
        <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Месяц</FieldLabel>
        <FieldContent>
          <Select v-model="condition.value">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Выберите месяц" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="month in months" :key="month.value" :value="month.value">{{ month.label }}</SelectItem>
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>

      <Field v-if="condition.type === 'loyalty_level'" class="mt-3">
        <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Уровень</FieldLabel>
        <FieldContent>
          <div class="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Select v-model="condition.value">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите уровень" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Бронза</SelectItem>
                <SelectItem value="2">Серебро</SelectItem>
                <SelectItem value="3">Золото</SelectItem>
              </SelectContent>
            </Select>
            <Input v-if="condition.operator === 'IN'" v-model="condition.value_list" placeholder="1,2,3" />
          </div>
          <p v-if="condition.operator === 'IN'" class="text-xs text-muted-foreground">Для IN укажите ID уровней через запятую.</p>
        </FieldContent>
      </Field>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
import { parseDate as parseCalendarDate } from "@internationalized/date";
import { useReferenceStore } from "../../stores/reference.js";
import Button from "../ui/button/Button.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "../ui/field";
import Input from "../ui/input/Input.vue";
import { Calendar as CalendarView } from "../ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const props = defineProps({
  modelValue: { type: Object, default: () => ({ operator: "AND", conditions: [] }) },
});
const emit = defineEmits(["update:modelValue"]);
const referenceStore = useReferenceStore();
const localOperator = ref(props.modelValue?.operator || "AND");
const conditions = ref([]);
const lastEmittedJson = ref("");
const months = [
  { value: 1, label: "Январь" },
  { value: 2, label: "Февраль" },
  { value: 3, label: "Март" },
  { value: 4, label: "Апрель" },
  { value: 5, label: "Май" },
  { value: 6, label: "Июнь" },
  { value: 7, label: "Июль" },
  { value: 8, label: "Август" },
  { value: 9, label: "Сентябрь" },
  { value: 10, label: "Октябрь" },
  { value: 11, label: "Ноябрь" },
  { value: 12, label: "Декабрь" },
];

const branches = computed(() => referenceStore.branches || []);

const createCondition = () => ({
  id: `${Date.now()}-${Math.random()}`,
  type: "inactive_days",
  operator: ">=",
  value: "",
  value_from: "",
  value_to: "",
  value_list: "",
  date_from: "",
  date_to: "",
});

const showOperator = (condition) => !["new_users", "birthday_range"].includes(condition.type);
const showValue = (condition) => {
  if (requiresBetween(condition)) return false;
  return ["inactive_days", "active_in_period", "total_spent", "avg_check", "order_count", "bonus_balance"].includes(condition.type);
};
const needsDateRange = (type) => ["active_in_period", "new_users", "birthday_range"].includes(type);
const needsCity = (type) => type === "city";
const needsBranch = (type) => type === "branch";
const valueInputType = () => "number";

const operatorOptions = (type) => {
  if (["total_spent", "avg_check", "order_count", "bonus_balance"].includes(type)) {
    return [">=", ">", "=", "<=", "<", "BETWEEN"];
  }
  if (["city", "branch", "birthday_month", "loyalty_level"].includes(type)) {
    return ["=", "IN"];
  }
  return [">=", ">", "=", "<=", "<"];
};

const requiresBetween = (condition) => {
  return ["total_spent", "avg_check", "order_count", "bonus_balance"].includes(condition.type) && condition.operator === "BETWEEN";
};

const addCondition = () => {
  conditions.value.push(createCondition());
};

const removeCondition = (index) => {
  conditions.value.splice(index, 1);
};

const normalizeValueList = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (Number.isFinite(Number(item)) ? Number(item) : item));
};

const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};

const getConditionRange = (condition) => {
  const values = [];
  if (condition.date_from) values.push(parseCalendarDate(condition.date_from));
  if (condition.date_to) values.push(parseCalendarDate(condition.date_to));
  return values.length ? values : undefined;
};

const updateConditionRange = (condition, value) => {
  const normalized = normalizeRangeValues(value);
  condition.date_from = normalized[0]?.toString() || "";
  condition.date_to = normalized[1]?.toString() || "";
};

const buildConfig = () => {
  const items = conditions.value
    .map((condition) => {
      if (!condition.type) return null;
      const base = { type: condition.type };
      if (showOperator(condition)) {
        base.operator = condition.operator || ">=";
      }
      if (needsDateRange(condition.type)) {
        if (condition.type === "active_in_period") {
          base.value = condition.value;
          base.date_from = condition.date_from || null;
          base.date_to = condition.date_to || null;
          return base;
        }
        base.value = {
          date_from: condition.date_from || null,
          date_to: condition.date_to || null,
        };
        return base;
      }
      if (["city", "branch", "birthday_month", "loyalty_level"].includes(condition.type)) {
        if (condition.operator === "IN") {
          base.operator = "IN";
          base.value = normalizeValueList(condition.value_list);
        } else {
          base.operator = "=";
          base.value = condition.value;
        }
        return base;
      }
      if (requiresBetween(condition)) {
        base.operator = "BETWEEN";
        base.value = {
          from: condition.value_from || null,
          to: condition.value_to || null,
        };
        return base;
      }
      base.value = condition.value;
      return base;
    })
    .filter(Boolean);
  return {
    operator: localOperator.value || "AND",
    conditions: items,
  };
};

const serializeConfig = (config) => JSON.stringify(config || {});

watch(
  [localOperator, conditions],
  () => {
    const config = buildConfig();
    lastEmittedJson.value = serializeConfig(config);
    emit("update:modelValue", config);
  },
  { deep: true },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;
    const incoming = serializeConfig(value);
    if (incoming === lastEmittedJson.value) return;
    localOperator.value = value.operator || "AND";
    if (Array.isArray(value.conditions) && value.conditions.length) {
      conditions.value = value.conditions.map((condition) => {
        const isValueObject = condition.value && typeof condition.value === "object" && !Array.isArray(condition.value);
        const dateFrom = condition.value?.date_from || condition.value?.from || condition.date_from || "";
        const dateTo = condition.value?.date_to || condition.value?.to || condition.date_to || "";
        return {
          id: `${Date.now()}-${Math.random()}`,
          type: condition.type || "inactive_days",
          operator: condition.operator || ">=",
          value: isValueObject ? "" : condition.value,
          value_from: condition.value?.from || condition.value?.date_from || "",
          value_to: condition.value?.to || condition.value?.date_to || "",
          value_list: Array.isArray(condition.value) ? condition.value.join(",") : "",
          date_from: dateFrom,
          date_to: dateTo,
        };
      });
    } else {
      conditions.value = [];
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await referenceStore.fetchCitiesAndBranches();
  if (!conditions.value.length) {
    addCondition();
  }
});
</script>
