<template>
  <div class="order-detail">
    <div v-if="loading" class="order-content page-container">
      <div class="status-card skeleton-block">
        <div class="skeleton skeleton-line skeleton-w-36"></div>
        <div class="skeleton skeleton-line skeleton-w-28"></div>
      </div>
      <div class="section skeleton-block">
        <div class="skeleton skeleton-title"></div>
        <div v-for="index in 3" :key="`item-skeleton-${index}`" class="skeleton-row">
          <div class="skeleton skeleton-line skeleton-w-60"></div>
          <div class="skeleton skeleton-line skeleton-w-24"></div>
        </div>
      </div>
      <div class="section skeleton-block">
        <div class="skeleton skeleton-title"></div>
        <div v-for="index in 4" :key="`info-skeleton-${index}`" class="skeleton skeleton-line skeleton-w-70"></div>
      </div>
      <div class="section skeleton-block">
        <div class="skeleton skeleton-title"></div>
        <div v-for="index in 3" :key="`total-skeleton-${index}`" class="skeleton-row">
          <div class="skeleton skeleton-line skeleton-w-36"></div>
          <div class="skeleton skeleton-line skeleton-w-24"></div>
        </div>
      </div>
    </div>
    <div v-else-if="order" class="order-content page-container">
      <div class="status-card">
        <div class="order-info">
          <span class="order-number">Заказ {{ order.order_number }}</span>
          <div class="order-date">{{ formatDate(order.created_at) }}</div>
        </div>
        <div :class="['status-badge', `status-${order.status}`]">
          {{ getStatusText(order.status) }}
        </div>
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
              <div class="item-qty">× {{ item.quantity }} • {{ formatPriceWithCurrency(item.item_price, settingsStore.currencyCode) }}</div>
              <div v-if="item.modifiers && item.modifiers.length > 0" class="item-modifiers">
                <div v-for="mod in item.modifiers" :key="mod.id" class="modifier">
                  + {{ mod.modifier_name }} (+{{ formatPriceWithCurrency(mod.modifier_price, settingsStore.currencyCode) }})
                </div>
              </div>
            </div>
            <div class="item-price">{{ formatPriceWithCurrency(item.subtotal, settingsStore.currencyCode) }}</div>
          </div>
        </div>
        <div v-else class="empty-state">Заказ пуст</div>
      </div>
      <div class="section" v-if="order.order_type === 'delivery'">
        <h3>Доставка по адресу:</h3>
        <div class="delivery-info">
          <div class="info-row" v-if="formatDeliveryAddress(order)">
            <span>{{ order.city_name }}, {{ formatDeliveryAddress(order) }}</span>
          </div>
        </div>
      </div>
      <div class="section" v-else>
        <h3>Самовывоз с филиала:</h3>
        <div class="pickup-info">
          <div class="info-row" v-if="order.branch_address">
            <span>{{ order.branch_address }}</span>
          </div>
        </div>
      </div>
      <div class="section">
        <h3>Итого</h3>
        <div class="total-row">
          <span>Сумма заказа</span>
          <span>{{ formatPriceWithCurrency(order.subtotal, settingsStore.currencyCode) }}</span>
        </div>
        <div class="total-row" v-if="order.delivery_cost > 0">
          <span>Доставка</span>
          <span>{{ formatPriceWithCurrency(order.delivery_cost, settingsStore.currencyCode) }}</span>
        </div>
        <div class="total-row" v-if="order.bonus_spent > 0">
          <span>Списано бонусов</span>
          <span class="bonus-used">-{{ formatPrice(order.bonus_spent) }} бонусов</span>
        </div>
        <div class="total-row" v-if="order.bonuses_earned > 0">
          <span>Начислено бонусов</span>
          <span class="bonus-earned">{{ formatPrice(order.bonuses_earned) }} бонусов</span>
        </div>
        <div class="total-row">
          <span>Оплата</span>
          <span>{{ formatPaymentMethod(order.payment_method) }}</span>
        </div>
        <div class="total-row final">
          <span>К оплате</span>
          <span>{{ formatPriceWithCurrency(order.total, settingsStore.currencyCode) }}</span>
        </div>
      </div>
      <div v-if="order.status === 'completed'" class="section">
        <h3>Оценка заказа</h3>
        <div v-if="hasSubmittedRating" class="rating-summary">
          <div class="rating-stars readonly">
            <Star v-for="index in 5" :key="`saved-star-${index}`" :size="20" :class="['star-icon', { active: index <= (order.user_rating || 0) }]" />
          </div>
          <div class="rating-value">Ваша оценка: {{ order.user_rating }} из 5</div>
          <div v-if="order.user_rating_comment" class="rating-comment">
            {{ order.user_rating_comment }}
          </div>
        </div>
        <div v-else-if="canRateOrder" class="rating-form">
          <div class="rating-stars">
            <button
              v-for="index in 5"
              :key="`rate-star-${index}`"
              type="button"
              class="star-button"
              :disabled="ratingSubmitting"
              @click="setRating(index)"
            >
              <Star :size="22" :class="['star-icon', { active: index <= ratingForm.rating }]" />
            </button>
          </div>
          <textarea
            v-model="ratingForm.comment"
            class="rating-comment-input"
            :disabled="ratingSubmitting"
            maxlength="1000"
            placeholder="Комментарий (необязательно)"
          />
          <button class="submit-rating-btn" :disabled="ratingSubmitting || ratingForm.rating < 1" @click="submitOrderRating">
            {{ ratingSubmitting ? "Отправка..." : "Отправить оценку" }}
          </button>
          <div v-if="ratingError" class="rating-error">{{ ratingError }}</div>
        </div>
        <div v-else class="rating-locked">Оценку можно поставить только в течение 24 часов после закрытия заказа.</div>

        <div v-if="hasSubmittedRating" class="nps-block">
          <template v-if="npsStatus.shouldShow">
            <label class="nps-title">Оцените наш сервис (NPS)</label>
            <div class="nps-scale">
              <button
                v-for="value in npsValues"
                :key="`order-nps-${value}`"
                type="button"
                class="nps-btn"
                :class="{ active: npsForm.score === value }"
                :disabled="npsSubmitting"
                @click="setNpsScore(value)"
              >
                {{ value }}
              </button>
            </div>
            <textarea
              v-model="npsForm.comment"
              class="nps-comment-input"
              :disabled="npsSubmitting"
              maxlength="1000"
              placeholder="Комментарий (необязательно)"
            />
            <button class="submit-rating-btn" :disabled="npsSubmitting || npsForm.score === null" @click="submitNps">
              {{ npsSubmitting ? "Отправка..." : "Отправить NPS" }}
            </button>
            <div v-if="npsError" class="rating-error">{{ npsError }}</div>
          </template>
          <template v-else-if="npsStatus.submitted">
            <label class="nps-title">Ваш NPS</label>
            <div class="nps-value">{{ npsStatus.score }}/10</div>
            <div v-if="npsStatus.comment" class="rating-comment">
              {{ npsStatus.comment }}
            </div>
            <div v-if="npsStatus.nextAvailableAt" class="nps-next-date">Следующую NPS-оценку можно поставить после {{ formatDate(npsStatus.nextAvailableAt) }}</div>
          </template>
          <template v-else-if="npsStatus.nextAvailableAt">
            <div class="nps-next-date">Следующую NPS-оценку можно поставить после {{ formatDate(npsStatus.nextAvailableAt) }}</div>
          </template>
        </div>
      </div>
      <div class="actions" v-if="canRepeatOrder">
        <button class="repeat-btn" @click="repeatOrder">
          <RefreshCw :size="20" />
          Повторить заказ
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { RefreshCw, Star } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { npsAPI, ordersAPI } from "@/shared/api/endpoints.js";
import { formatPaymentMethod, formatPrice, formatPriceWithCurrency } from "@/shared/utils/format";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { wsService } from "@/shared/services/websocket.js";
import { devError } from "@/shared/utils/logger.js";
const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const settingsStore = useSettingsStore();
const order = ref(null);
const loading = ref(false);
const ratingSubmitting = ref(false);
const ratingError = ref("");
const ratingForm = ref({
  rating: 0,
  comment: "",
});
const npsValues = Array.from({ length: 11 }, (_, index) => index);
const npsSubmitting = ref(false);
const npsError = ref("");
const npsStatus = ref({
  shouldShow: false,
  submitted: false,
  score: null,
  comment: "",
  nextAvailableAt: null,
});
const npsForm = ref({
  score: null,
  comment: "",
});
let statusUpdateHandler = null;
const canRepeatOrder = computed(() => {
  if (!order.value) return false;
  if (!settingsStore.ordersEnabled) return false;
  if (order.value.status !== "completed" && order.value.status !== "cancelled") return false;
  if (order.value.order_type === "delivery") return settingsStore.deliveryEnabled;
  if (order.value.order_type === "pickup") return settingsStore.pickupEnabled;
  return false;
});
const hasSubmittedRating = computed(() => {
  const value = Number(order.value?.user_rating || 0);
  return Number.isInteger(value) && value >= 1 && value <= 5;
});
const canRateOrder = computed(() => {
  if (!order.value || hasSubmittedRating.value) return false;
  if (order.value.status !== "completed") return false;
  if (order.value.can_rate_order === true) return true;

  const completedAt = order.value.completed_at ? new Date(order.value.completed_at) : null;
  if (!completedAt || Number.isNaN(completedAt.getTime())) return false;
  const deadlineMs = completedAt.getTime() + 24 * 60 * 60 * 1000;
  return Date.now() <= deadlineMs;
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
    if (!order.value || !data?.orderId) return;
    if (String(data.orderId) === String(order.value.id)) {
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
    if (order.value?.user_rating_comment) {
      ratingForm.value.comment = order.value.user_rating_comment;
    }
    applyNpsPrompt(order.value?.nps_prompt || null);
  } catch (error) {
    devError("Не удалось загрузить заказ:", error);
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
function setRating(value) {
  if (ratingSubmitting.value) return;
  ratingForm.value.rating = value;
  ratingError.value = "";
  hapticFeedback("light");
}
async function submitOrderRating() {
  if (!order.value || !canRateOrder.value || ratingSubmitting.value) return;
  if (!Number.isInteger(ratingForm.value.rating) || ratingForm.value.rating < 1 || ratingForm.value.rating > 5) {
    ratingError.value = "Выберите оценку от 1 до 5";
    hapticFeedback("error");
    return;
  }

  ratingSubmitting.value = true;
  ratingError.value = "";

  try {
    const response = await ordersAPI.createOrderRating(order.value.id, {
      rating: ratingForm.value.rating,
      comment: ratingForm.value.comment || "",
    });

    const rating = response.data?.rating || null;
    if (rating) {
      order.value.user_rating = Number(rating.rating) || null;
      order.value.user_rating_comment = rating.comment || null;
      order.value.user_rating_created_at = rating.created_at || null;
      order.value.can_rate_order = false;
      applyNpsPrompt(response.data?.nps_prompt || null);
      hapticFeedback("success");
    }
  } catch (error) {
    const apiError = error?.response?.data?.error || "Не удалось отправить оценку";
    ratingError.value = apiError;
    hapticFeedback("error");
  } finally {
    ratingSubmitting.value = false;
  }
}
function applyNpsPrompt(prompt) {
  const shouldShow = prompt?.should_show === true;
  const lastScore = Number.isInteger(Number(prompt?.last_score)) ? Number(prompt.last_score) : null;
  const lastComment = typeof prompt?.last_comment === "string" ? prompt.last_comment : "";
  const nextAvailableAt = prompt?.next_available_at || null;

  npsStatus.value = {
    shouldShow,
    submitted: lastScore !== null,
    score: lastScore,
    comment: lastComment,
    nextAvailableAt,
  };

  if (shouldShow) {
    npsForm.value.score = null;
    npsForm.value.comment = "";
  }
}
function setNpsScore(value) {
  if (npsSubmitting.value) return;
  npsForm.value.score = value;
  npsError.value = "";
  hapticFeedback("light");
}
async function submitNps() {
  if (npsSubmitting.value || !hasSubmittedRating.value || !npsStatus.value.shouldShow) return;
  if (!Number.isInteger(npsForm.value.score) || npsForm.value.score < 0 || npsForm.value.score > 10) {
    npsError.value = "Выберите оценку от 0 до 10";
    hapticFeedback("error");
    return;
  }

  npsSubmitting.value = true;
  npsError.value = "";
  try {
    const response = await npsAPI.submitMonthly({
      score: npsForm.value.score,
      comment: npsForm.value.comment || "",
    });

    const score = Number(response.data?.nps?.score);
    npsStatus.value = {
      shouldShow: false,
      submitted: Number.isInteger(score),
      score: Number.isInteger(score) ? score : npsForm.value.score,
      comment: response.data?.nps?.comment || npsForm.value.comment || "",
      nextAvailableAt: null,
    };
    hapticFeedback("success");
  } catch (error) {
    hapticFeedback("error");
    npsError.value = error?.response?.data?.error || "Не удалось отправить NPS";
    const nextAvailableAt = error?.response?.data?.next_available_at || null;
    if (nextAvailableAt) {
      npsStatus.value = {
        ...npsStatus.value,
        shouldShow: false,
        nextAvailableAt,
      };
    }
  } finally {
    npsSubmitting.value = false;
  }
}
function getStatusText(status) {
  const isDelivery = order.value?.order_type === "delivery";
  const deliveryStatuses = {
    pending: "Ожидает",
    confirmed: "Подтвержден",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В пути",
    completed: "Доставлен",
    cancelled: "Отменен",
  };
  const pickupStatuses = {
    pending: "Ожидает",
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
  const parts = [orderData.delivery_street, orderData.delivery_house].map((value) => (value ? String(value).trim() : "")).filter(Boolean);
  return parts.join(", ");
}
</script>
<style scoped>
.order-detail {
  min-height: 100vh;
  background: var(--color-background);
}
.skeleton-block {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 14px;
}
.skeleton-title {
  height: 20px;
  width: 40%;
  margin-bottom: 14px;
}
.skeleton-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.skeleton-row .skeleton-line {
  margin-bottom: 0;
}
.status-card {
  padding: 12px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 8px;
  border: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
}
.status-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  margin-bottom: 8px;
  height: 100%;
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
.order-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.order-number {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}
.order-date {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.section {
  padding: 12px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 8px;
  border: 1px solid var(--color-border);
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
  margin-top: 8px;
}
.rating-form {
  display: grid;
  gap: 12px;
}
.rating-summary {
  display: grid;
  gap: 8px;
}
.rating-stars {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rating-stars.readonly {
  pointer-events: none;
}
.star-button {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.star-button:disabled {
  cursor: default;
}
.star-icon {
  color: var(--color-border);
  fill: transparent;
  transition: color var(--transition-duration) var(--transition-easing);
}
.star-icon.active {
  color: #f59e0b;
  fill: #f59e0b;
}
.rating-value {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}
.rating-comment {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}
.rating-comment-input {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  padding: 10px 12px;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  background: var(--color-background);
}
.submit-rating-btn {
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: var(--border-radius-sm);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}
.submit-rating-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.rating-error {
  font-size: var(--font-size-caption);
  color: var(--color-error);
}
.rating-locked {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
}
.nps-block {
  margin-top: 14px;
  display: grid;
  gap: 10px;
  border-top: 1px dashed var(--color-border);
  padding-top: 14px;
}
.nps-title {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.nps-scale {
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  gap: 4px;
}
.nps-btn {
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--font-size-caption);
  cursor: pointer;
}
.nps-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.nps-comment-input {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  padding: 10px 12px;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  background: var(--color-background);
}
.nps-value {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.nps-next-date {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
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
