<template>
  <div class="space-y-6">
    <Card>
      <CardContent class="space-y-4">
        <PageHeader title="Заказы" description="Фильтры и список заказов">
          <template #filters>
            <div class="min-w-[220px] flex-1 space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
              <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
                <Input v-model="filters.search" class="pl-9" placeholder="Номер заказа или телефон" @keyup.enter="loadOrders" />
              </div>
            </div>
            <div class="min-w-[160px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
              <Select v-model="filters.city_id">
                <option value="">Все</option>
                <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
              </Select>
            </div>
            <div class="min-w-[160px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
              <Select v-model="filters.status">
                <option value="">Все</option>
                <option value="pending">Новый</option>
                <option value="confirmed">Принят</option>
                <option value="preparing">Готовится</option>
                <option value="ready">Готов</option>
                <option value="delivering">В пути</option>
                <option value="completed">Завершен</option>
                <option value="cancelled">Отменен</option>
              </Select>
            </div>
            <div class="min-w-[160px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип</label>
              <Select v-model="filters.order_type">
                <option value="">Все</option>
                <option value="delivery">Доставка</option>
                <option value="pickup">Самовывоз</option>
              </Select>
            </div>
            <div class="min-w-[220px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</label>
              <RangeCalendar v-model:from="filters.date_from" v-model:to="filters.date_to" />
            </div>
            <div class="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="outline" @click="resetFilters">
                <RotateCcw :size="16" />
                Сбросить
              </Button>
              <Badge variant="secondary">Всего: {{ formatNumber(orders.length) }}</Badge>
            </div>
          </template>
        </PageHeader>
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
            <TableRow v-for="order in orders" :key="order.id" class="cursor-pointer" :class="orderRowClass(order)" @click="selectOrder(order)">
              <TableCell>
                <div class="font-medium text-foreground">#{{ order.order_number }}</div>
                <div class="text-xs text-muted-foreground">{{ formatDateTime(order.created_at) }}</div>
              </TableCell>
              <TableCell>{{ order.city_name || "—" }}</TableCell>
              <TableCell>
                <div>{{ formatPhone(order.user_phone) || "—" }}</div>
                <div class="text-xs text-muted-foreground">{{ order.branch_name || "" }}</div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" :class="getStatusBadge(order.status).class">
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
  </div>
</template>
<script setup>
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { RotateCcw, Search } from "lucide-vue-next";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { useNotifications } from "../composables/useNotifications.js";
import { useOrdersStore } from "../stores/orders.js";
import { formatCurrency, formatDateTime, formatNumber, formatPhone } from "../utils/format.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import PageHeader from "../components/PageHeader.vue";
import Input from "../components/ui/Input.vue";
import RangeCalendar from "../components/ui/RangeCalendar.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
const router = useRouter();
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showNewOrderNotification, showErrorNotification } = useNotifications();
const orders = ref([]);
const recentOrderIds = ref(new Set());
const loadTimer = ref(null);
const filters = reactive({
  city_id: "",
  status: "",
  order_type: "",
  date_from: "",
  date_to: "",
  search: "",
});
const loadOrders = async () => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const response = await api.get("/api/orders/admin/all", { params });
  orders.value = response.data.orders || [];
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
  const classes = {
    pending: "bg-amber-100 text-amber-700 border-transparent",
    confirmed: "bg-blue-100 text-blue-700 border-transparent",
    preparing: "bg-orange-100 text-orange-700 border-transparent",
    ready: "bg-violet-100 text-violet-700 border-transparent",
    delivering: "bg-indigo-100 text-indigo-700 border-transparent",
    completed: "bg-emerald-100 text-emerald-700 border-transparent",
    cancelled: "bg-red-100 text-red-700 border-transparent",
  };
  return {
    label: labels[status] || status || "—",
    class: classes[status] || "bg-muted text-muted-foreground border-transparent",
  };
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    await loadOrders();
  } catch (error) {
    console.error("Ошибка загрузки заказов:", error);
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
