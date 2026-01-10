<template>
  <div class="orders">
    <div class="header">
      <button class="back-btn" @click="$router.back()">← Назад</button>
      <h1>Мои заказы</h1>
    </div>

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
          <div class="order-total">{{ order.total_amount }} ₽</div>
        </div>

        <div class="order-type">
          {{ order.order_type === "delivery" ? "🚚 Доставка" : "🏪 Самовывоз" }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ordersAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

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
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return `Сегодня, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (days === 1) {
    return `Вчера, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
</script>

<style scoped>
.orders {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.back-btn {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  margin-right: 12px;
}

.header h1 {
  font-size: 20px;
}

.loading {
  text-align: center;
  padding: 64px 16px;
  color: #666;
}

.empty {
  text-align: center;
  padding: 64px 16px;
}

.empty p {
  font-size: 18px;
  color: #666;
  margin-bottom: 24px;
}

.btn-primary {
  padding: 12px 24px;
  border: none;
  border-radius: 12px;
  background: #667eea;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.orders-list {
  padding: 16px;
}

.order-card {
  padding: 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-number {
  font-weight: 600;
  font-size: 18px;
}

.order-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
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
  background: #d1ecf1;
  color: #0c5460;
}
.status-ready {
  background: #d4edda;
  color: #155724;
}
.status-delivering {
  background: #cce5ff;
  color: #004085;
}
.status-completed {
  background: #d4edda;
  color: #155724;
}
.status-cancelled {
  background: #f8d7da;
  color: #721c24;
}

.order-date {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
}

.order-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-total {
  font-weight: 600;
  font-size: 18px;
}

.order-type {
  font-size: 14px;
  color: #666;
}
</style>
