import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Дашборд рассылок" description="Сводная аналитика по кампаниям">
          <template #filters>
            <div class="min-w-[180px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</label>
              <Select v-model="period">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
                  <SelectItem value="quarter">Квартал</SelectItem>
                  <SelectItem value="year">Год</SelectItem>
                  <SelectItem value="custom">Произвольный</SelectItem>
                  <SelectItem value="all">Все время</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div v-if="period === 'custom'" class="min-w-[240px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Диапазон дат</label>
              <Popover v-model:open="isRangeOpen">
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background"
                  >
                    <span :class="rangeLabelClass">{{ rangeLabel }}</span>
                    <CalendarIcon class="text-muted-foreground" :size="16" />
                  </button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0" align="start">
                  <div class="space-y-3 p-3">
                    <Calendar
                      :model-value="calendarRange"
                      :number-of-months="2"
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
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <div v-if="isLoading" class="grid gap-4 md:grid-cols-3">
      <Card v-for="index in 6" :key="`stats-skeleton-${index}`">
        <CardContent class="space-y-3">
          <Skeleton class="h-3 w-32" />
          <Skeleton class="h-8 w-24" />
        </CardContent>
      </Card>
    </div>
    <div v-else class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Всего рассылок</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_campaigns || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Активных триггеров</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.active_triggers || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Отправлено сообщений</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_sent || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Конверсий</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_conversions || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Выручка</div>
          <div class="text-2xl font-semibold">{{ formatCurrency(stats.total_revenue || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Средний CR</div>
          <div class="text-2xl font-semibold">{{ stats.avg_conversion_rate || 0 }}%</div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Calendar as CalendarIcon } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import api from "@/shared/api/client.js";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatCurrency, formatNumber } from "@/shared/utils/format.js";

const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();
const period = ref("month");
const dateFrom = ref("");
const dateTo = ref("");
const isRangeOpen = ref(false);
const isLoading = ref(false);
const stats = ref({});
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
    if (dateFrom.value) values.push(parseDate(dateFrom.value));
    if (dateTo.value) values.push(parseDate(dateTo.value));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    dateFrom.value = normalized[0]?.toString() || "";
    dateTo.value = normalized[1]?.toString() || "";
  },
});

const handleRangeUpdate = (value) => {
  calendarRange.value = value;
  if (dateFrom.value && dateTo.value) {
    isRangeOpen.value = false;
  }
};

const rangeLabel = computed(() => {
  if (dateFrom.value && dateTo.value) {
    const from = rangeFormatter.format(parseDate(dateFrom.value).toDate(timeZone));
    const to = rangeFormatter.format(parseDate(dateTo.value).toDate(timeZone));
    return `${from} — ${to}`;
  }
  if (dateFrom.value) {
    const from = rangeFormatter.format(parseDate(dateFrom.value).toDate(timeZone));
    return `${from} — ...`;
  }
  return "Выберите диапазон";
});

const rangeLabelClass = computed(() => (dateFrom.value ? "text-foreground" : "text-muted-foreground"));
const rangeHelperLabel = computed(() => {
  if (dateFrom.value && dateTo.value) return "Диапазон выбран";
  if (dateFrom.value) return "Выберите дату окончания";
  return "Выберите дату начала";
});

const isFutureDateDisabled = (date) => date.compare(today(timeZone)) > 0;

const clearDateRange = () => {
  dateFrom.value = "";
  dateTo.value = "";
};

const loadStats = async () => {
  if (period.value === "custom" && (!dateFrom.value || !dateTo.value)) {
    return;
  }
  isLoading.value = true;
  try {
    const params = { period: period.value };
    if (period.value === "custom") {
      params.date_from = dateFrom.value;
      params.date_to = dateTo.value;
    }
    const response = await api.get("/api/broadcasts/dashboard", { params });
    stats.value = response.data?.data || {};
  } catch (error) {
    devError("Ошибка загрузки дашборда:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось загрузить дашборд");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadStats);

watch(period, async (nextPeriod, prevPeriod) => {
  if (nextPeriod !== "custom" && prevPeriod === "custom") {
    clearDateRange();
  }
  if (nextPeriod !== "custom") {
    await loadStats();
    return;
  }
  if (dateFrom.value && dateTo.value) {
    await loadStats();
  }
});

watch([dateFrom, dateTo], async () => {
  if (period.value !== "custom") return;
  if (!dateFrom.value || !dateTo.value) return;
  await loadStats();
});

watch(
  () => ordersStore.lastBroadcastEvent,
  (event) => {
    if (!event) return;
    loadStats();
  },
);
</script>
