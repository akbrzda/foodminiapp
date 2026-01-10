<template>
  <div class="order-detail">
    <div class="header">
      <button class="back-btn" @click="$router.back()">← Назад</button>
      <h1>Заказ #{{ order?.order_number }}</h1>
    </div>

    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="order" class="order-content">
      <div class="status-card">
        <div :class="['status-badge', `status-${order.status}`]">
          {{ getStatusText(order.status) }}
        </div>
        <div class="order-date">{{ formatDate(order.created_at) }}</div>
      </div>

      <div class="section">
        <h3>Состав заказа</h3>
        <div class="items-list">
          <div v-for="item in order.items" :key="item.id" class="item-row">
            <div class="item-info">
              <div>{{ item.name }}</div>
              <div class="item-qty">× {{ item.quantity }}</div>
            </div>
            <div class="item-price">{{ item.price * item.quantity }} ₽</div>
          </div>
        </div>
      </div>

      <div class="section" v-if="order.order_type === 'delivery'">
        <h3>Адрес доставки</h3>
        <p>{{ order.delivery_address }}</p>
      </div>

      <div class="section" v-else>
        <h3>Самовывоз</h3>
        <p>{{ order.branch_name }}</p>
        <p class="text-secondary">{{ order.branch_address }}</p>
      </div>

      <div class="section">
        <h3>Итого</h3>
        <div class="total-row">
          <span>Товары</span>
          <span>{{ order.total_amount }} ₽</span>
        </div>
        <div class="total-row" v-if="order.bonus_used > 0">
          <span>Оплачено бонусами</span>
          <span>-{{ order.bonus_used }} ₽</span>
        </div>
        <div class="total-row final">
          <span>К оплате</span>
          <span>{{ order.total_amount - order.bonus_used }} ₽</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { ordersAPI } from "../api/endpoints";

const route = useRoute();
const order = ref(null);
const loading = ref(false);

onMounted(async () => {
  await loadOrder();
});

async function loadOrder() {
  try {
    loading.value = true;
    const response = await ordersAPI.getOrderById(route.params.id);
    order.value = response.data.order;
  } catch (error) {
    console.error("Failed to load order:", error);
  } finally {
    loading.value = false;
  }
}

function getStatusText(status) {
  const statuses = {
    pending: "Ожидает подтверждения",
    confirmed: "Подтвержден",
    preparing: "Готовится",
    ready: "Готов к выдаче",
    delivering: "В пути",
    completed: "Доставлен",
    cancelled: "Отменен",
  };
  return statuses[status] || status;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
.order-detail {
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

.order-content {
  padding: 16px;
}

.status-card {
  padding: 20px;
  background: white;
  border-radius: 12px;
  text-align: center;
  margin-bottom: 16px;
}

.status-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
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
}

.section {
  padding: 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 16px;
}

.section h3 {
  font-size: 16px;
  margin-bottom: 12px;
}

.section p {
  color: #666;
}

.text-secondary {
  font-size: 14px;
  color: #999;
  margin-top: 4px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-info {
  flex: 1;
}

.item-qty {
  font-size: 14px;
  color: #666;
  margin-top: 4px;
}

.item-price {
  font-weight: 600;
}

.total-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.total-row.final {
  font-size: 18px;
  font-weight: 600;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
  margin-top: 4px;
  margin-bottom: 0;
}
</style>
