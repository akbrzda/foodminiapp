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
          <span class="bonus-used">-{{ formatPrice(order.bonus_used) }} ₽</span>
        </div>
        <div class="total-row" v-if="order.bonus_earned > 0">
          <span>Начислено бонусов</span>
          <span class="bonus-earned">+{{ formatPrice(order.bonus_earned) }} ₽</span>
        </div>
        <div class="total-row final">
          <span>К оплате</span>
          <span>{{ formatPrice(order.total_amount - order.bonus_used) }} ₽</span>
        </div>
      </div>

      <!-- Кнопка повторения заказа -->
      <div class="actions" v-if="order.status === 'completed' || order.status === 'cancelled'">
        <button class="repeat-btn" @click="repeatOrder">
          <span>🔄</span>
          Повторить заказ
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import PageHeader from "../components/PageHeader.vue";
import { useRoute, useRouter } from "vue-router";
import { useCartStore } from "../stores/cart";
import { ordersAPI } from "../api/endpoints";
import { formatPrice } from "../utils/format";
import { hapticFeedback } from "../services/telegram";
import { wsService } from "../services/websocket";

const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const order = ref(null);
const loading = ref(false);

let statusUpdateHandler = null;

onMounted(async () => {
  await loadOrder();
  setupWebSocketListeners();
});

onUnmounted(() => {
  if (statusUpdateHandler) {
    wsService.off("order_status_update", statusUpdateHandler);
  }
});

function setupWebSocketListeners() {
  // Слушаем обновления статуса заказа
  statusUpdateHandler = (data) => {
    if (order.value && data.order_id === order.value.id) {
      order.value.status = data.status;
      hapticFeedback("light");
    }
  };

  wsService.on("order_status_update", statusUpdateHandler);
}

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

async function repeatOrder() {
  if (!order.value) return;

  hapticFeedback("medium");

  // Очищаем корзину
  cartStore.clearCart();

  // Добавляем все товары из заказа в корзину
  order.value.items.forEach((item) => {
    for (let i = 0; i < item.quantity; i++) {
      cartStore.addItem({
        id: item.item_id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        variant_id: item.variant_id || null,
        modifiers: item.modifiers || [],
      });
    }
  });

  hapticFeedback("success");
  router.push("/cart");
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

.total-row .bonus-used {
  color: #f44336;
  font-weight: var(--font-weight-semibold);
}

.total-row .bonus-earned {
  color: #4caf50;
  font-weight: var(--font-weight-semibold);
}

.total-row.final {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-top: 4px;
  margin-bottom: 0;
}

.actions {
  padding: 0 16px;
  margin-top: 16px;
}

.repeat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;
}

.repeat-btn:hover {
  background: var(--color-primary-hover);
}

.repeat-btn:active {
  transform: scale(0.98);
}

.repeat-btn span {
  font-size: 20px;
}
</style>
