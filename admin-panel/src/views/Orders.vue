<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Заказы</CardTitle>
        <CardDescription>Фильтры и список заказов</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
          <div class="space-y-2 lg:col-span-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
              <Input v-model="filters.search" class="pl-9" placeholder="Номер заказа или телефон" @keyup.enter="loadOrders" />
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="filters.city_id">
              <option value="">Все</option>
              <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
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
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип</label>
            <Select v-model="filters.order_type">
              <option value="">Все</option>
              <option value="delivery">Доставка</option>
              <option value="pickup">Самовывоз</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата от</label>
            <Input v-model="filters.date_from" type="date" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата до</label>
            <Input v-model="filters.date_to" type="date" />
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button @click="loadOrders">
            <RefreshCcw :size="16" />
            Обновить
          </Button>
          <Button variant="outline" @click="resetFilters">
            <RotateCcw :size="16" />
            Сбросить
          </Button>
          <Badge variant="secondary">Всего: {{ formatNumber(orders.length) }}</Badge>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Список заказов</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
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
                <StatusBadge :status="order.status" />
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
import { onMounted, onBeforeUnmount, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { RefreshCcw, RotateCcw, Search } from "lucide-vue-next";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { useNotifications } from "../composables/useNotifications.js";
import StatusBadge from "../components/StatusBadge.vue";
import { formatCurrency, formatDateTime, formatNumber, formatPhone } from "../utils/format.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";

const router = useRouter();
const referenceStore = useReferenceStore();
const { showNewOrderNotification } = useNotifications();

const orders = ref([]);
const recentOrderIds = ref(new Set());
let ws = null;

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
  loadOrders();
};

const selectOrder = (order) => {
  router.push(`/orders/${order.id}`);
};

const orderRowClass = (order) => {
  const isRecent = recentOrderIds.value.has(order.id);
  return isRecent ? "bg-primary/10" : "";
};

const connectWebSocket = () => {
  const apiBase = api.defaults.baseURL || "http://localhost:3000";
  const wsBase = import.meta.env.VITE_WS_URL || apiBase;

  let wsUrl;
  try {
    wsUrl = new URL(wsBase);
    const isSecure = window.location.protocol === "https:" || wsUrl.protocol === "https:";
    wsUrl.protocol = isSecure ? "wss:" : "ws:";
    ws = new WebSocket(wsUrl.toString());

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "new-order") {
        orders.value.unshift(payload.data);
        const next = new Set(recentOrderIds.value);
        next.add(payload.data.id);
        recentOrderIds.value = next;

        // Показываем браузерное уведомление (со звуком)
        showNewOrderNotification(payload.data);

        setTimeout(() => {
          const updated = new Set(recentOrderIds.value);
          updated.delete(payload.data.id);
          recentOrderIds.value = updated;
        }, 15000);
      }
      if (payload.type === "order-status-updated") {
        const { orderId, newStatus } = payload.data;
        orders.value = orders.value.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order));
      }
    };
  } catch (error) {
    console.error("WebSocket URL parsing failed", error);
    return;
  }
  ws.onclose = () => {
    setTimeout(connectWebSocket, 5000);
  };
};

onMounted(async () => {
  await referenceStore.loadCities();
  await loadOrders();
  connectWebSocket();
});

onBeforeUnmount(() => {
  if (ws) ws.close();
});
</script>
