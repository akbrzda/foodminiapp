import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Заказы" description="Фильтры и список заказов" />
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[220px] flex-1">
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
          <div class="min-w-[160px]">
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
          <div class="min-w-[160px]">
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
          <div class="min-w-[160px]">
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
          <div class="min-w-[220px]">
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
              </FieldContent>
            </Field>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
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
            <TableRow v-for="order in paginatedOrders" :key="order.id" class="cursor-pointer" :class="orderRowClass(order)" @click="selectOrder(order)">
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
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <TablePagination :total="orders.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Calendar as CalendarIcon, RotateCcw, Search } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
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
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
const router = useRouter();
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showNewOrderNotification, showErrorNotification } = useNotifications();
const orders = ref([]);
const page = ref(1);
const pageSize = ref(20);
const recentOrderIds = ref(new Set());
const loadTimer = ref(null);
const isRangeOpen = ref(false);
const filters = reactive({
  city_id: "",
  status: "",
  order_type: "",
  date_from: "",
  date_to: "",
  search: "",
});
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
    if (filters.date_from) values.push(parseDate(filters.date_from));
    if (filters.date_to) values.push(parseDate(filters.date_to));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    filters.date_from = normalized[0]?.toString() || "";
    filters.date_to = normalized[1]?.toString() || "";
  },
});
const handleRangeUpdate = (value) => {
  calendarRange.value = value;
  if (filters.date_from && filters.date_to) {
    isRangeOpen.value = false;
  }
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
};
const paginatedOrders = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return orders.value.slice(start, start + pageSize.value);
});
const loadOrders = async () => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const response = await api.get("/api/orders/admin/all", { params });
  orders.value = response.data.orders || [];
  page.value = 1;
  ordersStore.trackOrders(orders.value);
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
    date_from: "",
    date_to: "",
    search: "",
  });
  scheduleLoad();
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};
const selectOrder = (order) => {
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
  try {
    await referenceStore.loadCities();
    await loadOrders();
  } catch (error) {
    devError("Ошибка загрузки заказов:", error);
    showErrorNotification("Ошибка загрузки заказов");
  }
});
watch(
  filters,
  () => {
    scheduleLoad();
  },
  { deep: true },
);
watch(
  () => ordersStore.lastEvent,
  (payload) => {
    if (!payload) return;
    if (payload.type === "new-order") {
      orders.value.unshift(payload.data);
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
