<template>
  <div class="space-y-6">
    <Card>
      <CardContent class="space-y-4">
        <PageHeader title="Аналитика" description="Сводка по заказам и клиентам">
          <template #filters>
            <div class="grid w-full gap-3 lg:grid-cols-12 lg:items-end">
              <Field class="min-w-0 lg:col-span-8">
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</FieldLabel>
              <FieldContent>
                <div class="flex flex-wrap items-center gap-2">
                  <div class="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 p-[1px]">
                    <Button size="sm" :variant="periodButtonVariant('day')" @click="setPeriod('day')">Д</Button>
                    <Button size="sm" :variant="periodButtonVariant('week')" @click="setPeriod('week')">Н</Button>
                    <Button size="sm" :variant="periodButtonVariant('month')" @click="setPeriod('month')">М</Button>
                    <Button size="sm" :variant="periodButtonVariant('year')" @click="setPeriod('year')">Г</Button>
                  </div>
                  <div class="flex w-full items-center gap-2 sm:w-auto">
                    <div class="inline-flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-background px-2 py-[1px] sm:min-w-[220px] sm:flex-none">
                      <Button size="sm" variant="ghost" @click="shiftPeriod(-1)" :disabled="isCustomPeriod">
                        <ChevronLeft :size="14" />
                      </Button>
                      <span class="min-w-0 flex-1 text-center text-sm font-medium text-foreground">
                        {{ periodRangeLabel }}
                      </span>
                      <Button size="sm" variant="ghost" @click="shiftPeriod(1)" :disabled="isCustomPeriod">
                        <ChevronRight :size="14" />
                      </Button>
                    </div>
                    <Button size="icon" variant="outline" class="shrink-0" @click="activateCustomPeriod">
                      <Calendar :size="16" />
                    </Button>
                  </div>
                  <div v-if="isCustomPeriod" class="w-full sm:min-w-[240px] sm:flex-1">
                    <Popover v-model:open="isRangeOpen">
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          class="w-full justify-start text-left font-normal"
                          :class="!filters.date_from && 'text-muted-foreground'"
                        >
                          <Calendar :size="16" />
                          {{ customRangeLabel }}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent class="w-[calc(100vw-2rem)] max-w-md p-0 sm:w-auto" align="start">
                        <div class="space-y-3 p-3">
                          <CalendarView
                            :model-value="calendarRange"
                            :number-of-months="calendarMonths"
                            :is-date-disabled="isFutureDateDisabled"
                            locale="ru-RU"
                            multiple
                            @update:modelValue="handleRangeUpdate"
                          />
                          <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{{ rangeHelperLabel }}</span>
                            <button type="button" class="text-primary hover:underline" @click="clearDateRange">Очистить</button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </FieldContent>
            </Field>
            <div class="grid gap-3 sm:grid-cols-2 lg:col-span-4">
              <Field class="min-w-0">
                <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
                <FieldContent>
                  <Select v-model="filters.city_id" :disabled="isLocationLocked" @update:modelValue="onCityChange">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Все города" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все города</SelectItem>
                      <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                        {{ city.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field class="min-w-0">
                <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Филиал</FieldLabel>
                <FieldContent>
                  <Select v-model="filters.branch_id" :disabled="isLocationLocked || !filters.city_id" @update:modelValue="scheduleLoad">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Все филиалы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все филиалы</SelectItem>
                      <SelectItem v-for="branch in branches" :key="branch.id" :value="branch.id">
                        {{ branch.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Card>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Заказы
            <ClipboardList :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatNumber(stats?.orders?.total_orders || 0) }}</div>
          <div class="flex items-center gap-2 text-xs">
            <span :class="comparisonClass(stats?.comparisons?.orders) + ' flex'">
              <component :is="comparisonIcon(stats?.comparisons?.orders)" :size="14" v-if="comparisonIcon(stats?.comparisons?.orders)" />
              {{ formatPercent(stats?.comparisons?.orders?.percent) }}
            </span>
            <span class="text-muted-foreground">к прошлому периоду</span>
          </div>
          <div class="flex gap-3 text-xs text-muted-foreground">
            <span class="flex items-center gap-1 text-emerald-600"
              ><CheckCircle2 :size="14" /> {{ formatNumber(stats?.orders?.completed_orders || 0) }}</span
            >
            <span class="flex items-center gap-1 text-blue-600"
              ><Activity :size="14" />
              {{
                formatNumber(
                  (stats?.orders?.pending_orders || 0) +
                    (stats?.orders?.confirmed_orders || 0) +
                    (stats?.orders?.preparing_orders || 0) +
                    (stats?.orders?.ready_orders || 0) +
                    (stats?.orders?.delivering_orders || 0),
                )
              }}</span
            >
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Выручка
            <Wallet :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatCurrency(stats?.orders?.total_revenue) }}</div>
          <div class="flex items-center gap-2 text-xs">
            <span :class="comparisonClass(stats?.comparisons?.revenue) + ' flex'">
              <component :is="comparisonIcon(stats?.comparisons?.revenue)" :size="14" v-if="comparisonIcon(stats?.comparisons?.revenue)" />
              {{ formatPercent(stats?.comparisons?.revenue?.percent) }}
            </span>
            <span class="text-muted-foreground">к прошлому периоду</span>
          </div>
          <div class="text-xs text-muted-foreground">Средний чек: {{ formatCurrency(stats?.orders?.avg_order_value) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Клиенты
            <Users :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatNumber(stats?.customers?.total_customers || 0) }}</div>
          <div class="flex items-center gap-2 text-xs">
            <span :class="comparisonClass(stats?.comparisons?.customers) + ' flex'">
              <component :is="comparisonIcon(stats?.comparisons?.customers)" :size="14" v-if="comparisonIcon(stats?.comparisons?.customers)" />
              {{ formatPercent(stats?.comparisons?.customers?.percent) }}
            </span>
            <span class="text-muted-foreground">к прошлому периоду</span>
          </div>
          <div class="flex gap-3 text-xs text-muted-foreground">
            <span class="text-blue-600">Новые: {{ formatNumber(stats?.customers?.new_customers || 0) }}</span>
            <span class="text-purple-600">Повтор: {{ formatNumber(stats?.customers?.returning_customers || 0) }}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Скидки
            <Tag :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatCurrency(stats?.discounts?.total_discounts) }}</div>
          <div class="flex items-center gap-2 text-xs">
            <span :class="comparisonClass(stats?.comparisons?.discounts) + ' flex'">
              <component :is="comparisonIcon(stats?.comparisons?.discounts)" :size="14" v-if="comparisonIcon(stats?.comparisons?.discounts)" />
              {{ formatPercent(stats?.comparisons?.discounts?.percent) }}
            </span>
            <span class="text-muted-foreground">к прошлому периоду</span>
          </div>
          <div class="text-xs text-muted-foreground">Сумма списанных бонусов</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Активные заказы
            <Activity :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">
            {{
              formatNumber(
                (stats?.orders?.pending_orders || 0) +
                  (stats?.orders?.confirmed_orders || 0) +
                  (stats?.orders?.preparing_orders || 0) +
                  (stats?.orders?.ready_orders || 0) +
                  (stats?.orders?.delivering_orders || 0),
              )
            }}
          </div>
          <div class="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Ожидают: {{ formatNumber(stats?.orders?.pending_orders || 0) }}</span>
            <span>Подтверждены: {{ formatNumber(stats?.orders?.confirmed_orders || 0) }}</span>
            <span>Готовятся: {{ formatNumber(stats?.orders?.preparing_orders || 0) }}</span>
            <span>Готовы: {{ formatNumber(stats?.orders?.ready_orders || 0) }}</span>
            <span>В доставке: {{ formatNumber(stats?.orders?.delivering_orders || 0) }}</span>
          </div>
        </CardContent>
      </Card>
    </div>
    <Card>
      <CardHeader>
        <CardTitle>Динамика продаж</CardTitle>
        <CardDescription>По выбранному периоду и фильтрам</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs v-model="activeTab">
          <TabsList>
            <TabsTrigger v-for="(tab, index) in chartTabs" :key="tab" :value="index">{{ tab }}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div class="mt-4 overflow-x-auto">
          <div class="flex min-w-[640px] items-end gap-3">
            <div v-for="point in seriesPoints" :key="point.period" class="flex w-16 flex-col items-center gap-2">
              <div class="text-[11px] font-medium text-muted-foreground">{{ formatSeriesValue(point) }}</div>
              <div class="flex h-36 w-full items-end rounded-md bg-muted/50">
                <div class="w-full rounded-md bg-primary/70" :style="{ height: barHeight(point) }"></div>
              </div>
              <div class="text-[10px] uppercase text-muted-foreground">{{ formatSeriesLabel(point.period) }}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Способы получения</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div
            v-for="type in stats?.orderTypes"
            :key="type.order_type"
            class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Truck v-if="type.order_type === 'delivery'" :size="18" />
                <Store v-else :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-foreground">
                  {{ type.order_type === "delivery" ? "Доставка" : "Самовывоз" }}
                </p>
                <p class="text-xs text-muted-foreground">{{ formatNumber(type.count) }} заказов</p>
              </div>
            </div>
            <p class="text-sm font-semibold text-foreground">{{ formatCurrency(type.revenue) }}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Способы оплаты</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div
            v-for="method in stats?.paymentMethods"
            :key="method.payment_method"
            class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Banknote v-if="method.payment_method === 'cash'" :size="18" />
                <CreditCard v-else :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-foreground">
                  {{ method.payment_method === "cash" ? "Наличные" : "Карта" }}
                </p>
                <p class="text-xs text-muted-foreground">{{ formatNumber(method.count) }} заказов</p>
              </div>
            </div>
            <p class="text-sm font-semibold text-foreground">{{ formatCurrency(method.revenue) }}</p>
          </div>
        </CardContent>
      </Card>
    </div>
    <Card>
      <CardHeader>
        <CardTitle>Популярные позиции</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          v-for="(item, index) in stats?.topItems?.slice(0, 10)"
          :key="item.name"
          class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
              {{ index + 1 }}
            </div>
            <div>
              <p class="text-sm font-medium text-foreground">{{ item.name }}</p>
              <p class="text-xs text-muted-foreground">Продано: {{ formatNumber(item.total_quantity) }} шт.</p>
            </div>
          </div>
          <p class="text-sm font-semibold text-foreground">{{ formatCurrency(item.revenue) }}</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Activity,
  Banknote,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Store,
  Tag,
  Truck,
  Users,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate as parseCalendarDate, today } from "@internationalized/date";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatCurrency, formatNumber } from "@/shared/utils/format.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Calendar as CalendarView } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const { showErrorNotification } = useNotifications();
const stats = ref(null);
const branches = ref([]);
const branchesRequestId = ref(0);
const loadTimer = ref(null);
const activeTab = ref(0);
const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const parseDate = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const todayString = toDateString(new Date());
const filters = ref({
  period: "day",
  date_from: "",
  date_to: "",
  base_date: todayString,
  city_id: "",
  branch_id: "",
});
const isRangeOpen = ref(false);
const calendarMonths = ref(window.innerWidth < 1024 ? 1 : 2);
const timeZone = getLocalTimeZone();
const rangeFormatter = new DateFormatter("ru-RU", { dateStyle: "medium" });
const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};
const calendarRange = computed({
  get() {
    const values = [];
    if (filters.value.date_from) values.push(parseCalendarDate(filters.value.date_from));
    if (filters.value.date_to) values.push(parseCalendarDate(filters.value.date_to));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    filters.value.date_from = normalized[0]?.toString() || "";
    filters.value.date_to = normalized[1]?.toString() || "";
  },
});
const handleRangeUpdate = (value) => {
  calendarRange.value = value;
  if (filters.value.date_from && filters.value.date_to) {
    isRangeOpen.value = false;
  }
};
const customRangeLabel = computed(() => {
  if (filters.value.date_from && filters.value.date_to) {
    const from = rangeFormatter.format(parseCalendarDate(filters.value.date_from).toDate(timeZone));
    const to = rangeFormatter.format(parseCalendarDate(filters.value.date_to).toDate(timeZone));
    return `${from} — ${to}`;
  }
  if (filters.value.date_from) {
    const from = rangeFormatter.format(parseCalendarDate(filters.value.date_from).toDate(timeZone));
    return `${from} — ...`;
  }
  return "Выберите диапазон";
});
const rangeHelperLabel = computed(() => {
  if (filters.value.date_from && filters.value.date_to) return "Диапазон выбран";
  if (filters.value.date_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});
const isFutureDateDisabled = (date) => date.compare(today(timeZone)) > 0;
const clearDateRange = () => {
  filters.value.date_from = "";
  filters.value.date_to = "";
};
const updateCalendarMonths = () => {
  calendarMonths.value = window.innerWidth < 1024 ? 1 : 2;
};
const chartTabs = ["Выручка", "Заказы", "Средний чек"];
const isCustomPeriod = computed(() => filters.value.period === "custom");
const isManager = computed(() => authStore.role === "manager");
const managerBranches = computed(() => authStore.user?.branches || []);
const managerBranchIds = computed(() => authStore.user?.branch_ids || []);
const isLocationLocked = computed(() => isManager.value && managerBranches.value.length === 1);
const seriesPoints = computed(() => stats.value?.series?.points || []);
const seriesGroupBy = computed(() => stats.value?.series?.group_by || "day");
const formatRangeDate = (date) =>
  date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};
const addYears = (date, years) => {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
};
const getRangeForPeriod = () => {
  if (filters.value.period === "custom") {
    const fromDate = parseDate(filters.value.date_from);
    const toDate = parseDate(filters.value.date_to);
    return { start: fromDate, end: toDate };
  }
  const baseDate = parseDate(filters.value.base_date) || new Date();
  const baseStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  if (filters.value.period === "week") {
    const weekday = baseStart.getDay();
    const diffToMonday = (weekday + 6) % 7;
    const start = addDays(baseStart, -diffToMonday);
    const end = addDays(start, 6);
    return { start, end };
  }
  if (filters.value.period === "month") {
    const start = new Date(baseStart.getFullYear(), baseStart.getMonth(), 1);
    const end = new Date(baseStart.getFullYear(), baseStart.getMonth() + 1, 0);
    return { start, end };
  }
  if (filters.value.period === "year") {
    const start = new Date(baseStart.getFullYear(), 0, 1);
    const end = new Date(baseStart.getFullYear(), 11, 31);
    return { start, end };
  }
  return { start: baseStart, end: baseStart };
};
const periodRangeLabel = computed(() => {
  const { start, end } = getRangeForPeriod();
  if (!start || !end) return "—";
  if (start.toDateString() === end.toDateString()) {
    return formatRangeDate(start);
  }
  return `${formatRangeDate(start)} - ${formatRangeDate(end)}`;
});
const periodButtonVariant = (periodKey) => (filters.value.period === periodKey ? "" : "ghost");
const setPeriod = (periodKey) => {
  const wasCustom = filters.value.period === "custom";
  filters.value.period = periodKey;
  if (periodKey !== "custom") {
    if (wasCustom && filters.value.date_to) {
      filters.value.base_date = filters.value.date_to;
    } else if (!filters.value.base_date) {
      filters.value.base_date = todayString;
    }
  }
};
const activateCustomPeriod = () => {
  const { start, end } = getRangeForPeriod();
  filters.value.period = "custom";
  filters.value.date_from = start ? toDateString(start) : "";
  filters.value.date_to = end ? toDateString(end) : "";
};
const shiftPeriod = (direction) => {
  if (filters.value.period === "custom") return;
  const baseDate = parseDate(filters.value.base_date) || new Date();
  let nextDate = baseDate;
  if (filters.value.period === "week") {
    nextDate = addDays(baseDate, direction * 7);
  } else if (filters.value.period === "month") {
    nextDate = addMonths(baseDate, direction);
  } else if (filters.value.period === "year") {
    nextDate = addYears(baseDate, direction);
  } else {
    nextDate = addDays(baseDate, direction);
  }
  filters.value.base_date = toDateString(nextDate);
};
const formatPercent = (value) => {
  if (value === null || value === undefined) return "—";
  return `${Math.abs(value).toFixed(1)}%`;
};
const comparisonClass = (comparison) => {
  if (!comparison || comparison.percent === null) return "text-muted-foreground";
  if (comparison.change > 0) return "text-emerald-600";
  if (comparison.change < 0) return "text-red-600";
  return "text-muted-foreground";
};
const comparisonIcon = (comparison) => {
  if (!comparison || comparison.percent === null) return null;
  if (comparison.change > 0) return ArrowUpRight;
  if (comparison.change < 0) return ArrowDownRight;
  return Minus;
};
const seriesMetricKey = computed(() => {
  if (activeTab.value === 1) return "orders_count";
  if (activeTab.value === 2) return "avg_order_value";
  return "revenue";
});
const seriesMax = computed(() => {
  if (seriesPoints.value.length === 0) return 0;
  return Math.max(...seriesPoints.value.map((point) => Number(point[seriesMetricKey.value]) || 0));
});
const barHeight = (point) => {
  if (!seriesMax.value) return "0%";
  const value = Number(point[seriesMetricKey.value]) || 0;
  const height = Math.max((value / seriesMax.value) * 100, 2);
  return `${height}%`;
};
const formatSeriesValue = (point) => {
  if (seriesMetricKey.value === "orders_count") {
    return formatNumber(point.orders_count || 0);
  }
  if (seriesMetricKey.value === "avg_order_value") {
    return formatCurrency(point.avg_order_value || 0);
  }
  return formatCurrency(point.revenue || 0);
};
const formatSeriesLabel = (periodValue) => {
  if (seriesGroupBy.value === "hour") {
    const date = new Date(periodValue);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
  }
  if (seriesGroupBy.value === "day") {
    const date = new Date(periodValue);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    }
  }
  return String(periodValue);
};
const loadDashboard = async () => {
  if (filters.value.period === "custom" && (!filters.value.date_from || !filters.value.date_to)) {
    return;
  }
  try {
    const params = { period: filters.value.period };
    if (filters.value.period === "custom") {
      params.date_from = filters.value.date_from;
      params.date_to = filters.value.date_to;
    } else {
      params.base_date = filters.value.base_date;
    }
    if (filters.value.city_id) params.city_id = filters.value.city_id;
    if (filters.value.branch_id) params.branch_id = filters.value.branch_id;
    const response = await api.get("/api/analytics/dashboard", { params });
    stats.value = response.data;
  } catch (error) {
    devError("Ошибка загрузки дашборда:", error);
  }
};
const scheduleLoad = () => {
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
  loadTimer.value = setTimeout(loadDashboard, 200);
};
const onCityChange = async () => {
  const requestId = ++branchesRequestId.value;
  filters.value.branch_id = "";
  if (filters.value.city_id) {
    try {
      const loadedBranches = await referenceStore.loadBranches(filters.value.city_id);
      if (requestId === branchesRequestId.value) {
        if (isManager.value && managerBranchIds.value.length > 0) {
          const allowed = new Set(managerBranchIds.value);
          branches.value = (loadedBranches || []).filter((branch) => allowed.has(branch.id));
        } else {
          branches.value = loadedBranches || [];
        }
      }
    } catch (error) {
      devError("Ошибка загрузки филиалов:", error);
      if (requestId === branchesRequestId.value) {
        branches.value = [];
      }
    }
  } else {
    branches.value = [];
  }
  scheduleLoad();
};
watch(
  () => filters.value.period,
  () => {
    scheduleLoad();
  },
);
watch(
  () => filters.value.base_date,
  () => {
    if (!isCustomPeriod.value) {
      scheduleLoad();
    }
  },
);
watch(
  () => filters.value.date_from,
  () => {
    if (filters.value.period === "custom") {
      scheduleLoad();
    }
  },
);
watch(
  () => filters.value.date_to,
  () => {
    if (filters.value.period === "custom") {
      scheduleLoad();
    }
  },
);
watch(
  () => filters.value.branch_id,
  () => {
    scheduleLoad();
  },
);
onMounted(async () => {
  updateCalendarMonths();
  window.addEventListener("resize", updateCalendarMonths);
  try {
    await referenceStore.loadCities();
    if (isManager.value && managerBranches.value.length > 0) {
      const [firstBranch] = managerBranches.value;
      filters.value.city_id = firstBranch?.city_id || "";
      filters.value.branch_id = firstBranch?.id || "";
      if (filters.value.city_id) {
        const loadedBranches = (await referenceStore.loadBranches(filters.value.city_id)) || [];
        const allowed = new Set(managerBranchIds.value);
        branches.value = loadedBranches.filter((branch) => allowed.has(branch.id));
      }
    }
    await loadDashboard();
  } catch (error) {
    devError("Ошибка загрузки аналитики:", error);
    showErrorNotification("Ошибка загрузки аналитики");
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateCalendarMonths);
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
});
</script>
