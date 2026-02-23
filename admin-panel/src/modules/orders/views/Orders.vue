<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Заказы" description="Фильтры и список заказов" />
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
          <div class="min-w-0 sm:col-span-2 xl:col-span-3">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</FieldLabel>
              <FieldContent>
                <div class="relative">
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
                  <Input v-model="filters.search" class="pl-9" placeholder="Номер заказа или телефон" @keyup.enter="loadOrders" />
                </div>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-0 xl:col-span-2">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
              <FieldContent>
                <Select v-model="filters.city_id">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все города" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-0 xl:col-span-2">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
              <FieldContent>
                <Select v-model="filters.status">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все статусы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem value="pending">Новый</SelectItem>
                    <SelectItem value="confirmed">Принят</SelectItem>
                    <SelectItem value="preparing">Готовится</SelectItem>
                    <SelectItem value="ready">Готов</SelectItem>
                    <SelectItem value="delivering">В пути</SelectItem>
                    <SelectItem value="completed">Завершен</SelectItem>
                    <SelectItem value="cancelled">Отменен</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-0 xl:col-span-2">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип</FieldLabel>
              <FieldContent>
                <Select v-model="filters.order_type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все типы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem value="delivery">Доставка</SelectItem>
                    <SelectItem value="pickup">Самовывоз</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-0 sm:col-span-2 xl:col-span-3">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</FieldLabel>
              <FieldContent>
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
                  <PopoverContent class="w-[calc(100vw-2rem)] max-w-md p-0 sm:w-auto" align="start">
                    <div class="space-y-3 p-3">
                      <Calendar
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
              </FieldContent>
            </Field>
          </div>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-12 xl:justify-end">
            <Button variant="outline" @click="resetFilters">
              <RotateCcw :size="16" />
              Сбросить
            </Button>
            <Badge variant="secondary">Всего: {{ formatNumber(orders.length) }}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <div class="flex items-center justify-between">
                <Skeleton class="h-4 w-24" />
                <Skeleton class="h-5 w-20" />
              </div>
              <Skeleton class="h-3 w-36" />
              <Skeleton class="h-3 w-40" />
              <div class="flex items-center justify-between">
                <Skeleton class="h-6 w-24" />
                <Skeleton class="h-4 w-20" />
              </div>
            </div>
          </template>
          <template v-else>
            <button
              v-for="order in paginatedOrders"
              :key="`mobile-${order.id}`"
              type="button"
              class="w-full rounded-xl border border-border bg-background p-3 text-left transition hover:bg-accent/40"
              :class="orderRowClass(order)"
              @click="selectOrder(order)"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="font-semibold text-foreground">#{{ order.order_number }}</div>
                  <div class="text-xs text-muted-foreground">{{ formatDateTime(order.created_at) }}</div>
                </div>
                <Badge variant="secondary" :class="getStatusBadge(order.status).class" :style="getStatusBadge(order.status).style">
                  {{ getStatusBadge(order.status).label }}
                </Badge>
              </div>
              <div class="mt-2 text-sm text-foreground">{{ order.city_name || "—" }}</div>
              <div class="mt-1 text-sm">
                <a v-if="normalizePhone(order.user_phone)" class="hover:underline" :href="`tel:${normalizePhone(order.user_phone)}`" @click.stop>
                  {{ formatPhone(order.user_phone) }}
                </a>
                <span v-else>—</span>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">{{ order.branch_name || "—" }}</div>
              <div class="mt-3 flex items-center justify-between">
                <Badge variant="outline">{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</Badge>
                <div class="text-right">
                  <div class="font-semibold text-foreground">{{ formatCurrency(order.total) }}</div>
                  <div class="text-xs uppercase text-muted-foreground">{{ order.payment_method }}</div>
                </div>
              </div>
            </button>
            <div v-if="orders.length === 0" class="py-8 text-center text-sm text-muted-foreground">Заказы не найдены</div>
          </template>
        </div>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заказ</TableHead>
                <TableHead>Город</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead class="text-right">Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 8" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-4 w-20" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow
                  v-for="order in paginatedOrders"
                  :key="order.id"
                  class="cursor-pointer"
                  :class="orderRowClass(order)"
                  @click="selectOrder(order)"
                >
                  <TableCell>
                    <div class="font-medium text-foreground">#{{ order.order_number }}</div>
                    <div class="text-xs text-muted-foreground">{{ formatDateTime(order.created_at) }}</div>
                  </TableCell>
                  <TableCell>{{ order.city_name || "—" }}</TableCell>
                  <TableCell>
                    <a
                      v-if="normalizePhone(order.user_phone)"
                      class="text-foreground hover:underline"
                      :href="`tel:${normalizePhone(order.user_phone)}`"
                      @click.stop
                    >
                      {{ formatPhone(order.user_phone) }}
                    </a>
                    <div v-else>—</div>
                    <div class="text-xs text-muted-foreground">{{ order.branch_name || "" }}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" :class="getStatusBadge(order.status).class" :style="getStatusBadge(order.status).style">
                      {{ getStatusBadge(order.status).label }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="font-semibold text-foreground">{{ formatCurrency(order.total) }}</div>
                    <div class="text-xs uppercase text-muted-foreground">{{ order.payment_method }}</div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="orders.length === 0">
                  <TableCell colspan="6" class="py-8 text-center text-sm text-muted-foreground">Заказы не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <TablePagination :total="orders.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Calendar as CalendarIcon, RotateCcw, Search } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatCurrency, formatDateTime, formatNumber, formatPhone, normalizePhone } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
const router = useRouter();
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showNewOrderNotification, showErrorNotification } = useNotifications();

// Навигационный контекст для восстановления фильтров и скролла
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("orders");
const orders = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const recentOrderIds = ref(new Set());
const loadTimer = ref(null);
const isRangeOpen = ref(false);
const rangeSelectionStep = ref("start");
const calendarMonths = ref(window.innerWidth < 1024 ? 1 : 2);
const timeZone = getLocalTimeZone();
const getTodayDateString = () => today(timeZone).toString();
const filters = reactive({
  city_id: "",
  status: "",
  order_type: "",
  date_from: getTodayDateString(),
  date_to: getTodayDateString(),
  search: "",
});
const rangeFormatter = new DateFormatter("ru-RU", { dateStyle: "medium" });
const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};
const toDateKeySet = (values) => new Set(values.map((item) => item.toString()));
const calendarRange = computed({
  get() {
    const values = [];
    if (filters.date_from) values.push(parseDate(filters.date_from));
    if (filters.date_to) values.push(parseDate(filters.date_to));
    return values.length ? values : undefined;
  },
});
const handleRangeUpdate = (value) => {
  const normalized = normalizeRangeValues(value);
  const currentSelection = normalizeRangeValues(calendarRange.value);

  if (!normalized.length) {
    filters.date_from = "";
    filters.date_to = "";
    rangeSelectionStep.value = "start";
    return;
  }

  const currentSet = toDateKeySet(currentSelection);
  const addedDates = normalized.filter((item) => !currentSet.has(item.toString()));
  const lastSelectedDate = addedDates[addedDates.length - 1] || normalized[normalized.length - 1];

  if (!lastSelectedDate) return;

  if (rangeSelectionStep.value === "start") {
    filters.date_from = lastSelectedDate.toString();
    filters.date_to = "";
    rangeSelectionStep.value = "end";
    return;
  }

  const startDate = filters.date_from ? parseDate(filters.date_from) : lastSelectedDate;
  if (lastSelectedDate.compare(startDate) < 0) {
    filters.date_from = lastSelectedDate.toString();
    filters.date_to = startDate.toString();
  } else {
    filters.date_from = startDate.toString();
    filters.date_to = lastSelectedDate.toString();
  }

  if (filters.date_from && filters.date_to) {
    isRangeOpen.value = false;
  }
  rangeSelectionStep.value = "start";
};
const rangeLabel = computed(() => {
  if (filters.date_from && filters.date_to) {
    const from = rangeFormatter.format(parseDate(filters.date_from).toDate(timeZone));
    const to = rangeFormatter.format(parseDate(filters.date_to).toDate(timeZone));
    return `${from} — ${to}`;
  }
  if (filters.date_from) {
    const from = rangeFormatter.format(parseDate(filters.date_from).toDate(timeZone));
    return `${from} — ...`;
  }
  return "Выберите диапазон";
});
const rangeLabelClass = computed(() => (filters.date_from ? "text-foreground" : "text-muted-foreground"));
const rangeHelperLabel = computed(() => {
  if (filters.date_from && filters.date_to) return "Диапазон выбран";
  if (filters.date_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});
const isFutureDateDisabled = (date) => date.compare(today(timeZone)) > 0;
const clearDateRange = () => {
  filters.date_from = "";
  filters.date_to = "";
  rangeSelectionStep.value = "start";
};
const updateCalendarMonths = () => {
  calendarMonths.value = window.innerWidth < 1024 ? 1 : 2;
};
const paginatedOrders = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return orders.value.slice(start, start + pageSize.value);
});
const loadOrders = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const response = await api.get("/api/orders/admin/all", { params });
    orders.value = response.data.orders || [];
    if (!preservePage) {
      page.value = 1;
    }
    ordersStore.trackOrders(orders.value);
  } catch (error) {
    devError("Ошибка загрузки заказов:", error);
    showErrorNotification("Ошибка загрузки заказов");
  } finally {
    isLoading.value = false;
  }
};
const scheduleLoad = () => {
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
  loadTimer.value = setTimeout(loadOrders, 300);
};
const resetFilters = () => {
  Object.assign(filters, {
    city_id: "",
    status: "",
    order_type: "",
    date_from: getTodayDateString(),
    date_to: getTodayDateString(),
    search: "",
  });
  scheduleLoad();
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};
const selectOrder = (order) => {
  // Сохраняем контекст перед переходом на детали заказа
  saveContext(filters, { page: page.value, pageSize: pageSize.value });
  router.push(`/orders/${order.id}`);
};
const orderRowClass = (order) => {
  const isRecent = recentOrderIds.value.has(order.id);
  return isRecent ? "bg-primary/10" : "";
};
const getStatusBadge = (status) => {
  const labels = {
    pending: "Новый",
    confirmed: "Принят",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В пути",
    completed: "Завершен",
    cancelled: "Отменен",
  };
  const styles = {
    pending: { backgroundColor: "#3B82F6", color: "#FFFFFF" },
    confirmed: { backgroundColor: "#10B981", color: "#FFFFFF" },
    preparing: { backgroundColor: "#F59E0B", color: "#FFFFFF" },
    ready: { backgroundColor: "#8B5CF6", color: "#FFFFFF" },
    delivering: { backgroundColor: "#FFD200", color: "#000000" },
    completed: { backgroundColor: "#6B7280", color: "#FFFFFF" },
    cancelled: { backgroundColor: "#EF4444", color: "#FFFFFF" },
  };
  return {
    label: labels[status] || status || "—",
    class: "",
    style: styles[status] || { backgroundColor: "#E0E0E0", color: "#666666" },
  };
};
onMounted(async () => {
  updateCalendarMonths();
  window.addEventListener("resize", updateCalendarMonths);
  try {
    await referenceStore.loadCities();

    // Проверяем, нужно ли восстанавливать контекст
    if (shouldRestore.value) {
      const context = restoreContext();

      if (context) {
        // Восстанавливаем фильтры
        Object.assign(filters, context.filters);

        // Восстанавливаем пагинацию
        if (context.page) page.value = context.page;
        if (context.pageSize) pageSize.value = context.pageSize;

        // Загружаем данные с восстановленными фильтрами
        await loadOrders({ preservePage: true });

        // Восстанавливаем скролл после загрузки данных
        restoreScroll(context.scroll);
      }
    } else {
      // Обычная загрузка
      await loadOrders();
    }
  } catch (error) {
    devError("Ошибка загрузки заказов:", error);
    showErrorNotification("Ошибка загрузки заказов");
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateCalendarMonths);
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
});
watch(
  filters,
  () => {
    scheduleLoad();
  },
  { deep: true },
);
watch(isRangeOpen, (isOpen) => {
  if (isOpen) {
    rangeSelectionStep.value = "start";
  }
});
watch(
  () => ordersStore.lastEvent,
  (payload) => {
    if (!payload) return;
    if (payload.type === "new-order") {
      orders.value = [...orders.value, payload.data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const next = new Set(recentOrderIds.value);
      next.add(payload.data.id);
      recentOrderIds.value = next;
      showNewOrderNotification(payload.data);
      setTimeout(() => {
        const updated = new Set(recentOrderIds.value);
        updated.delete(payload.data.id);
        recentOrderIds.value = updated;
      }, 15000);
    }
    if (payload.type === "order-status-updated") {
      const { orderId, newStatus } = payload.data || {};
      orders.value = orders.value.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order));
    }
  },
);
</script>
