<template>
  <div class="space-y-6">
    <section class="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card">
      <div class="grid gap-4 md:grid-cols-6">
        <div class="md:col-span-2">
          <label class="text-xs uppercase tracking-widest text-ink/60">Поиск</label>
          <input
            v-model="filters.search"
            class="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
            placeholder="Номер заказа или телефон"
            @keyup.enter="loadOrders"
          />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Город</label>
          <select v-model="filters.city_id" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Все</option>
            <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Статус</label>
          <select v-model="filters.status" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Все</option>
            <option value="pending">Новый</option>
            <option value="confirmed">Принят</option>
            <option value="preparing">Готовится</option>
            <option value="ready">Готов</option>
            <option value="delivering">В пути</option>
            <option value="completed">Завершен</option>
            <option value="cancelled">Отменен</option>
          </select>
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Тип</label>
          <select v-model="filters.order_type" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Все</option>
            <option value="delivery">Доставка</option>
            <option value="pickup">Самовывоз</option>
          </select>
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Дата от</label>
          <input v-model="filters.date_from" type="date" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Дата до</label>
          <input v-model="filters.date_to" type="date" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button class="rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white" @click="loadOrders">
          Обновить
        </button>
        <button class="rounded-full border border-ink/10 px-4 py-2 text-xs uppercase tracking-widest" @click="resetFilters">
          Сбросить
        </button>
        <span class="text-xs text-ink/60">Всего: {{ orders.length }}</span>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div class="space-y-3">
        <div
          v-for="order in orders"
          :key="order.id"
          class="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm transition"
          :class="orderCardClass(order)"
          @click="selectOrder(order)"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="panel-title text-base font-semibold text-ink">#{{ order.order_number }}</p>
              <p class="text-xs text-ink/60">{{ order.city_name || "" }} · {{ formatDateTime(order.created_at) }}</p>
            </div>
            <StatusBadge :status="order.status" />
          </div>
          <div class="mt-3 flex flex-wrap gap-3 text-xs text-ink/70">
            <span>{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</span>
            <span>{{ order.branch_name }}</span>
            <span>{{ formatPhone(order.user_phone) }}</span>
          </div>
          <div class="mt-4 flex items-center justify-between">
            <div class="text-sm font-semibold text-ink">{{ formatCurrency(order.total) }}</div>
            <span class="text-xs uppercase tracking-[0.2em] text-ink/40">{{ order.payment_method }}</span>
          </div>
        </div>
      </div>

      <div class="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
        <div v-if="!selectedOrder" class="text-sm text-ink/60">Выберите заказ для деталей</div>
        <div v-else class="space-y-4">
          <div class="flex items-start justify-between">
            <div>
              <p class="panel-title text-lg font-semibold text-ink">Заказ #{{ selectedOrder.order_number }}</p>
              <p class="text-xs text-ink/60">{{ formatDateTime(selectedOrder.created_at) }}</p>
            </div>
            <StatusBadge :status="selectedOrder.status" />
          </div>

          <div class="space-y-2 text-sm">
            <div><span class="text-ink/60">Клиент:</span> {{ selectedOrder.user_first_name }} {{ selectedOrder.user_last_name }}</div>
            <div><span class="text-ink/60">Телефон:</span> {{ formatPhone(selectedOrder.user_phone) }}</div>
            <div><span class="text-ink/60">Филиал:</span> {{ selectedOrder.branch_name }}</div>
            <div v-if="selectedOrder.order_type === 'delivery'"><span class="text-ink/60">Адрес:</span> {{ formatDelivery(selectedOrder) }}</div>
            <div><span class="text-ink/60">Комментарий:</span> {{ selectedOrder.comment || "—" }}</div>
          </div>

          <div>
            <label class="text-xs uppercase tracking-widest text-ink/60">Обновить статус</label>
            <select v-model="statusUpdate" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
              <option value="">Выберите статус</option>
              <option value="pending">Новый</option>
              <option value="confirmed">Принят</option>
              <option value="preparing">Готовится</option>
              <option value="ready">Готов</option>
              <option value="delivering">В пути</option>
              <option value="completed">Завершен</option>
              <option value="cancelled">Отменен</option>
            </select>
            <button
              class="mt-3 w-full rounded-2xl bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink"
              :disabled="!statusUpdate"
              @click="updateStatus"
            >
              Применить статус
            </button>
          </div>

          <div class="rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
            <p class="text-xs uppercase tracking-widest text-ink/60">Сумма</p>
            <p class="panel-title text-2xl font-semibold">{{ formatCurrency(selectedOrder.total) }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, reactive, ref } from "vue";
import api from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";
import { useReferenceStore } from "../stores/reference.js";
import StatusBadge from "../components/StatusBadge.vue";
import { formatCurrency, formatDateTime, formatPhone } from "../utils/format.js";

const authStore = useAuthStore();
const referenceStore = useReferenceStore();

const orders = ref([]);
const selectedOrder = ref(null);
const statusUpdate = ref("");
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
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value)
  );
  const response = await api.get("/api/orders/admin/all", { params });
  orders.value = response.data.orders || [];
  if (selectedOrder.value) {
    const updated = orders.value.find((order) => order.id === selectedOrder.value.id);
    if (updated) {
      selectedOrder.value = updated;
    } else {
      selectedOrder.value = null;
    }
  }
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
  selectedOrder.value = order;
  statusUpdate.value = "";
};

const updateStatus = async () => {
  if (!selectedOrder.value || !statusUpdate.value) return;
  const response = await api.put(`/api/orders/admin/${selectedOrder.value.id}/status`, {
    status: statusUpdate.value,
  });
  const updated = response.data.order;
  orders.value = orders.value.map((order) => (order.id === updated.id ? { ...order, ...updated } : order));
  selectedOrder.value = updated;
  statusUpdate.value = "";
};

const formatDelivery = (order) => {
  const parts = [order.delivery_street, order.delivery_house, order.delivery_apartment].filter(Boolean);
  return parts.join(", ") || "—";
};

const orderCardClass = (order) => {
  const isSelected = selectedOrder.value?.id === order.id;
  const isRecent = recentOrderIds.value.has(order.id);
  return [
    isSelected ? "ring-2 ring-accent" : "",
    isRecent ? "border-accent/70 shadow-glow" : "",
  ].join(" ");
};

const playNotification = () => {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.06;
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch (error) {
    console.warn("Sound notification failed", error);
  }
};

const connectWebSocket = () => {
  const apiBase = api.defaults.baseURL || "http://localhost:3000";
  const wsBase = import.meta.env.VITE_WS_URL || apiBase;
  const wsUrl = new URL(wsBase);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("token", authStore.token);
  ws = new WebSocket(wsUrl.toString());

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "new-order") {
      orders.value.unshift(payload.data);
      const next = new Set(recentOrderIds.value);
      next.add(payload.data.id);
      recentOrderIds.value = next;
      playNotification();
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
