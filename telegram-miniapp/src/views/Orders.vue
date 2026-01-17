<template>
  <div class="orders">

    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="orders.length === 0" class="empty">
      <p>У вас пока нет заказов</p>
      <button class="btn-primary" @click="$router.push('/menu')">Перейти в меню</button>
    </div>

    <div v-else class="orders-list">
      <div v-for="order in orders" :key="order.id" class="order-card" @click="openOrder(order.id)">
        <div class="order-header">
          <div class="order-number">#{{ order.order_number }}</div>
          <div :class="['order-status', `status-${order.status}`]">
            {{ getStatusText(order.status) }}
          </div>
        </div>

        <div class="order-date">
          {{ formatDate(order.created_at) }}
        </div>

        <div class="order-details">
          <div>{{ order.items_count }} позиций</div>
          <div class="order-total">{{ formatPrice(order.total_amount) }} ₽</div>
        </div>

        <div class="order-type">
          <Truck v-if="order.order_type === 'delivery'" :size="16" />
          <Store v-else :size="16" />
          {{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Truck, Store } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { ordersAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import { formatPrice } from "../utils/format";

import { formatRelativeTime, isToday, isYesterday, formatTime, formatDateOnly } from "../utils/date";

const router = useRouter();
const orders = ref([]);
const loading = ref(false);

onMounted(async () => {
  await loadOrders();
});

async function loadOrders() {
  try {
    loading.value = true;
    const response = await ordersAPI.getMyOrders();
    orders.value = response.data.orders || [];
  } catch (error) {
    console.error("Failed to load orders:", error);
  } finally {
    loading.value = false;
  }
}

function openOrder(orderId) {
  hapticFeedback("light");
  router.push(`/order/${orderId}`);
}

function getStatusText(status) {
  const statuses = {
    pending: "Ожидает",
    confirmed: "Подтвержден",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В пути",
    completed: "Доставлен",
    cancelled: "Отменен",
  };
  return statuses[status] || status;
}

function formatDate(dateString) {
  const date = new Date(dateString);

  if (isToday(date)) {
    return `Сегодня, ${formatTime(date)}`;
  } else if (isYesterday(date)) {
    return `Вчера, ${formatTime(date)}`;
  } else {
    return formatDateOnly(date);
  }
}
</script>

<style scoped>
.orders {
  min-height: 100vh;
  background: var(--color-background);
}

.loading {
  text-align: center;
  padding: 64px 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

.empty {
  text-align: center;
  padding: 64px 16px;
}

.empty p {
  font-size: var(--font-size-h3);
  color: var(--color-text-secondary);
  margin-bottom: 24px;
}

.orders-list {
  padding: 16px 12px;
}

.order-card {
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-duration) var(--transition-easing);
}

.order-card:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-number {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-h3);
  color: var(--color-text-primary);
}

.order-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
}

.status-pending {
  background: #fff3cd;
  color: #856404;
}
.status-confirmed {
  background: #d1ecf1;
  color: #0c5460;
}
.status-preparing {
  background: #fff3cd;
  color: #856404;
}
.status-ready {
  background: #cce5ff;
  color: #004085;
}
.status-delivering {
  background: #cce5ff;
  color: #004085;
}
.status-completed {
  background: var(--color-success);
  color: var(--color-background);
}
.status-cancelled {
  background: var(--color-error);
  color: var(--color-background);
}

.order-date {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.order-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-h3);
  color: var(--color-text-primary);
}

.order-type {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
