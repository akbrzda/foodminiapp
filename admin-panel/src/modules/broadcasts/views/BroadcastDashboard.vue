<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader title="Дашборд рассылок" description="Сводная аналитика рассылок">
          <template #actions>
            <BackButton label="Назад" @click="goBack" />
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <BaseFilters v-model="filtersModel" :fields="filterFields" :show-reset="false">
      <template #after>
        <div v-if="period === 'custom'" class="space-y-1 xl:col-span-2">
          <Popover v-model:open="isRangeOpen">
            <PopoverTrigger asChild>
              <button
                type="button"
                class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background"
              >
                <span :class="['min-w-0 flex-1 truncate pr-2 text-left', rangeLabelClass]">{{ rangeLabel }}</span>
                <CalendarIcon class="text-muted-foreground" :size="16" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] p-0 sm:w-auto sm:max-w-[calc(100vw-4rem)]" align="start">
              <div class="space-y-3 p-3">
                <div class="overflow-x-auto pb-1">
                  <CalendarRoot
                    v-slot="{ grid, weekDays }"
                    :model-value="calendarRange"
                    :number-of-months="calendarMonths"
                    :is-date-disabled="isFutureDateDisabled"
                    locale="ru-RU"
                    multiple
                    @update:model-value="handleRangeUpdate"
                  >
                    <CalendarHeader>
                      <CalendarPrevButton />
                      <CalendarHeading />
                      <CalendarNextButton />
                    </CalendarHeader>

                    <div class="mt-4 flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
                      <CalendarGrid v-for="month in grid" :key="month.value.toString()">
                        <CalendarGridHead>
                          <CalendarGridRow>
                            <CalendarHeadCell v-for="day in weekDays" :key="day">
                              {{ day }}
                            </CalendarHeadCell>
                          </CalendarGridRow>
                        </CalendarGridHead>
                        <CalendarGridBody>
                          <CalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`" class="mt-2 w-full">
                            <CalendarCell v-for="weekDate in weekDates" :key="weekDate.toString()" :date="weekDate">
                              <CalendarCellTrigger :day="weekDate" :month="month.value" :class="getCalendarDayClass(weekDate)">
                                {{ weekDate.day }}
                              </CalendarCellTrigger>
                            </CalendarCell>
                          </CalendarGridRow>
                        </CalendarGridBody>
                      </CalendarGrid>
                    </div>
                  </CalendarRoot>
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ rangeHelperLabel }}</span>
                  <button type="button" class="text-primary hover:underline" @click="clearDateRange">Очистить</button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </template>
    </BaseFilters>

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
import { devError } from "@/shared/utils/logger";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Calendar as CalendarIcon } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BaseFilters from "@/shared/components/filters/BaseFilters.vue";
import { CalendarRoot } from "reka-ui";
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNextButton,
  CalendarPrevButton,
} from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatCurrency, formatNumber } from "@/shared/utils/format.js";
import BackButton from "@/shared/components/BackButton.vue";
const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();
const router = useRouter();
const period = ref("month");
const dateFrom = ref("");
const dateTo = ref("");
const filtersModel = computed({
  get: () => ({
    period: period.value,
    date_from: dateFrom.value,
    date_to: dateTo.value,
  }),
  set: (value) => {
    if (!value) return;
    period.value = value.period ?? period.value;
    dateFrom.value = value.date_from ?? dateFrom.value;
    dateTo.value = value.date_to ?? dateTo.value;
  },
});
const filterFields = computed(() => [
  {
    key: "period",
    label: "Период",
    placeholder: "Период",
    type: "select",
    defaultValue: "month",
    options: [
      { value: "week", label: "Неделя" },
      { value: "month", label: "Месяц" },
      { value: "quarter", label: "Квартал" },
      { value: "year", label: "Год" },
      { value: "custom", label: "Произвольный" },
      { value: "all", label: "Все время" },
    ],
  },
]);
const isRangeOpen = ref(false);
const getCalendarMonthCount = () => (window.innerWidth < 1280 ? 1 : 2);
const calendarMonths = ref(getCalendarMonthCount());
const isLoading = ref(false);
const stats = ref({});
const timeZone = getLocalTimeZone();
const rangeFormatter = new DateFormatter("ru-RU", { dateStyle: "short" });
const goBack = () => {
  router.push("/broadcasts");
};
const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};
const parseFilterDate = (value) => (value ? parseDate(value) : null);
const isSameCalendarDate = (left, right) => Boolean(left && right && left.compare(right) === 0);
const isDayInSelectedRange = (day) => {
  const start = parseFilterDate(dateFrom.value);
  const end = parseFilterDate(dateTo.value);
  if (!start || !end) return false;
  return day.compare(start) > 0 && day.compare(end) < 0;
};
const isRangeStartDay = (day) => {
  const start = parseFilterDate(dateFrom.value);
  return isSameCalendarDate(day, start);
};
const isRangeEndDay = (day) => {
  const end = parseFilterDate(dateTo.value);
  return isSameCalendarDate(day, end);
};
const getCalendarDayClass = (day) => {
  const isStart = isRangeStartDay(day);
  const isEnd = isRangeEndDay(day);
  const isBetween = isDayInSelectedRange(day);

  if (isStart && isEnd) {
    return "bg-primary text-primary-foreground hover:bg-primary focus:bg-primary rounded-md";
  }
  if (isStart) {
    return "bg-primary text-primary-foreground hover:bg-primary focus:bg-primary rounded-r-none";
  }
  if (isEnd) {
    return "bg-primary text-primary-foreground hover:bg-primary focus:bg-primary rounded-l-none";
  }
  if (isBetween) {
    return "bg-primary/20 text-foreground hover:bg-primary/25 focus:bg-primary/25 rounded-none";
  }
  return "";
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
  return "Период";
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
const updateCalendarMonths = () => {
  calendarMonths.value = getCalendarMonthCount();
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

onMounted(async () => {
  updateCalendarMonths();
  window.addEventListener("resize", updateCalendarMonths);
  await loadStats();
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateCalendarMonths);
});

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
