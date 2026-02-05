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
        <div v-if="order.items && order.items.length > 0" class="items-list">
          <div v-for="item in order.items" :key="item.id" class="item-row">
            <div class="item-info">
              <div class="item-name">
                {{ item.item_name }}
                <span v-if="item.variant_name" class="variant">({{ item.variant_name }})</span>
              </div>
              <div class="item-qty">× {{ item.quantity }} • {{ formatPrice(item.item_price) }} ₽</div>
              <div v-if="item.modifiers && item.modifiers.length > 0" class="item-modifiers">
                <div v-for="mod in item.modifiers" :key="mod.id" class="modifier">
                  + {{ mod.modifier_name }} (+{{ formatPrice(mod.modifier_price) }} ₽)
                </div>
              </div>
            </div>
            <div class="item-price">{{ formatPrice(item.subtotal) }} ₽</div>
          </div>
        </div>
        <div v-else class="empty-state">Заказ пуст</div>
      </div>
      <div class="section" v-if="order.order_type === 'delivery'">
        <h3>Адрес доставки</h3>
        <div class="delivery-info">
          <div class="info-row" v-if="formatDeliveryAddress(order)">
            <span class="label">Адрес:</span>
            <span>{{ formatDeliveryAddress(order) }}</span>
          </div>
          <div class="info-row">
            <span class="label">Город:</span>
            <span>{{ order.city_name }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_street">
            <span class="label">Улица:</span>
            <span>{{ order.delivery_street }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_house">
            <span class="label">Дом:</span>
            <span>{{ order.delivery_house }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_apartment">
            <span class="label">Квартира:</span>
            <span>{{ order.delivery_apartment }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_entrance">
            <span class="label">Подъезд:</span>
            <span>{{ order.delivery_entrance }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_floor">
            <span class="label">Этаж:</span>
            <span>{{ order.delivery_floor }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_intercom">
            <span class="label">Код двери:</span>
            <span>{{ order.delivery_intercom }}</span>
          </div>
          <div class="info-row" v-if="order.delivery_comment">
            <span class="label">Комментарий к адресу:</span>
            <span>{{ order.delivery_comment }}</span>
          </div>
          <div class="info-row" v-if="order.comment">
            <span class="label">Комментарий к заказу:</span>
            <span>{{ order.comment }}</span>
          </div>
        </div>
      </div>
      <div class="section" v-else>
        <h3>Самовывоз</h3>
        <div class="pickup-info">
          <div class="info-row">
            <span class="label">Филиал:</span>
            <span>{{ order.branch_name }}</span>
          </div>
          <div class="info-row" v-if="order.branch_address">
            <span class="label">Адрес:</span>
            <span>{{ order.branch_address }}</span>
          </div>
          <div class="info-row" v-if="order.comment">
            <span class="label">Комментарий к заказу:</span>
            <span>{{ order.comment }}</span>
          </div>
        </div>
      </div>
      <div class="section" v-if="order.payment_method === 'cash' && order.change_from">
        <h3>Оплата</h3>
        <div class="info-row">
          <span class="label">Сдача с:</span>
          <span>{{ formatPrice(order.change_from) }} ₽</span>
        </div>
        <div class="info-row">
          <span class="label">Сдача:</span>
          <span>{{ formatPrice(getChangeAmount(order)) }} ₽</span>
        </div>
      </div>
      <div class="section">
        <h3>Итого</h3>
        <div class="total-row">
          <span>Сумма без скидок</span>
          <span>{{ formatPrice(order.subtotal) }} ₽</span>
        </div>
        <div class="total-row" v-if="order.delivery_cost > 0">
          <span>Доставка</span>
          <span>{{ formatPrice(order.delivery_cost) }} ₽</span>
        </div>
        <div class="total-row" v-if="order.bonus_spent > 0">
          <span>Списано бонусов</span>
          <span class="bonus-used">-{{ formatPrice(order.bonus_spent) }} бонусов</span>
        </div>
        <div class="total-row" v-if="order.bonuses_earned > 0">
          <span>Начислено бонусов</span>
          <span class="bonus-earned">{{ formatPrice(order.bonuses_earned) }} бонусов</span>
        </div>
        <div class="total-row final">
          <span>К оплате</span>
          <span>{{ formatPrice(order.total) }} ₽</span>
        </div>
      </div>
      <div class="actions" v-if="canRepeatOrder">
        <button class="repeat-btn" @click="repeatOrder">
          <span>🔄</span>
          Повторить заказ
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useRoute, useRouter } from "vue-router";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { ordersAPI } from "@/shared/api/endpoints.js";
import { formatPrice } from "@/shared/utils/format";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { wsService } from "@/shared/services/websocket.js";
const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const settingsStore = useSettingsStore();
const order = ref(null);
const loading = ref(false);
let statusUpdateHandler = null;
const canRepeatOrder = computed(() => {
  if (!order.value) return false;
  if (!settingsStore.ordersEnabled) return false;
  if (order.value.status !== "completed" && order.value.status !== "cancelled") return false;
  if (order.value.order_type === "delivery") return settingsStore.deliveryEnabled;
  if (order.value.order_type === "pickup") return settingsStore.pickupEnabled;
  return false;
});
onMounted(async () => {
  await loadOrder();
  setupWebSocketListeners();
});
onUnmounted(() => {
  if (statusUpdateHandler) {
    wsService.off("order-status-updated", statusUpdateHandler);
  }
});
function setupWebSocketListeners() {
  statusUpdateHandler = (data) => {
    if (order.value && data.orderId === order.value.id) {
      order.value.status = data.newStatus;
      hapticFeedback("light");
    }
  };
  wsService.on("order-status-updated", statusUpdateHandler);
}
async function loadOrder() {
  try {
    loading.value = true;
    const response = await ordersAPI.getOrderById(route.params.id);
    order.value = response.data.order;
  } catch (error) {
    console.error("Не удалось загрузить заказ:", error);
  } finally {
    loading.value = false;
  }
}
async function repeatOrder() {
  if (!order.value) return;
  if (!canRepeatOrder.value) {
    hapticFeedback("error");
    return;
  }
  hapticFeedback("medium");
  cartStore.clearCart();
  order.value.items.forEach((item) => {
    const modifiers = (item.modifiers || []).map((mod) => ({
      id: mod.modifier_id || mod.old_modifier_id || mod.id,
      name: mod.modifier_name || mod.name,
      price: Number(mod.modifier_price || mod.price || 0),
      group_id: mod.modifier_group_id || mod.group_id || null,
    }));
    const modifiersTotal = modifiers.reduce((sum, mod) => sum + (Number(mod.price) || 0), 0);
    const basePrice = Number(item.item_price || item.price || 0);
    const unitPrice = basePrice + modifiersTotal;
    cartStore.addItem({
      id: item.item_id || item.id,
      name: item.item_name || item.name,
      price: unitPrice,
      image_url: item.image_url || null,
      variant_id: item.variant_id || null,
      variant_name: item.variant_name || null,
      modifiers: modifiers,
      quantity: item.quantity || 1,
    });
  });
  hapticFeedback("success");
  router.push("/cart");
}
function getStatusText(status) {
  const isDelivery = order.value?.order_type === "delivery";
  const deliveryStatuses = {
    pending: "Ожидает подтверждения",
    confirmed: "Подтвержден",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В пути",
    completed: "Доставлен",
    cancelled: "Отменен",
  };
  const pickupStatuses = {
    pending: "Ожидает подтверждения",
    confirmed: "Подтвержден",
    preparing: "Готовится",
    ready: "Готов к выдаче",
    completed: "Выдан",
    cancelled: "Отменен",
  };
  const statuses = isDelivery ? deliveryStatuses : pickupStatuses;
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
function formatDeliveryAddress(orderData) {
  if (!orderData) return "";
  const parts = [orderData.delivery_street, orderData.delivery_house, orderData.delivery_apartment]
    .map((value) => (value ? String(value).trim() : ""))
    .filter(Boolean);
  return parts.join(", ");
}
function getChangeAmount(orderData) {
  if (!orderData) return 0;
  const changeFrom = Number(orderData.change_from || 0);
  const total = Number(orderData.total || 0);
  if (!Number.isFinite(changeFrom) || !Number.isFinite(total)) return 0;
  return Math.max(0, changeFrom - total);
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
.delivery-info,
.pickup-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}
.info-row .label {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
  min-width: 100px;
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
  align-items: flex-start;
  padding: 12px;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-sm);
}
.item-info {
  flex: 1;
}
.item-name {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}
.variant {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-normal);
  font-size: var(--font-size-caption);
}
.item-qty {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-top: 4px;
}
.item-modifiers {
  margin-top: 8px;
  padding-left: 12px;
  border-left: 2px solid var(--color-border);
}
.modifier {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
  margin-top: 4px;
}
.empty-state {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 24px;
  font-size: var(--font-size-body);
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
  transition:
    background-color 0.2s,
    transform 0.15s;
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
