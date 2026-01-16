<template>
  <div class="order-detail">
    <PageHeader :title="`Заказ #${order?.order_number || ''}`" />

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
            <div class="item-price">{{ formatPrice(item.price * item.quantity) }} ₽</div>
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
          <span>{{ formatPrice(order.total_amount) }} ₽</span>
        </div>
        <div class="total-row" v-if="order.bonus_used > 0">
          <span>Оплачено бонусами</span>
          <span>-{{ formatPrice(order.bonus_used) }} ₽</span>
        </div>
        <div class="total-row final">
          <span>К оплате</span>
          <span>{{ formatPrice(order.total_amount - order.bonus_used) }} ₽</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import PageHeader from "../components/PageHeader.vue";
import { useRoute } from "vue-router";
import { ordersAPI } from "../api/endpoints";
import { formatPrice } from "../utils/format";

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
  background: var(--color-background);
}

.loading {
  text-align: center;
  padding: 64px 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

.order-content {
  padding: 16px 12px;
}

.status-card {
  padding: 20px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  text-align: center;
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.status-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-bold);
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
}

.section {
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.section h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.section p {
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

.text-secondary {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
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

.item-info > div:first-child {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.item-qty {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.item-price {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-h3);
  color: var(--color-text-primary);
}

.total-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.total-row.final {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-top: 4px;
  margin-bottom: 0;
}
</style>
