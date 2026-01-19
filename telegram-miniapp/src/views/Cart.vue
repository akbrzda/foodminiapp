<template>
  <div class="cart">

    <div v-if="cartStore.items.length === 0" class="empty">
      <p>Корзина пуста</p>
      <button class="btn-primary" @click="$router.push('/')">Перейти в меню</button>
    </div>

    <div v-else class="cart-content">
      <div class="items">
        <div v-for="(item, index) in cartStore.items" :key="index" class="cart-item">
          <div class="item-info">
            <h3>{{ item.name }}</h3>
            <div class="variant" v-if="item.variant_name">
              <span class="variant-text">{{ item.variant_name }}</span>
            </div>
            <div class="weight" v-if="getItemWeight(item)">
              <span class="weight-text">{{ getItemWeight(item) }}</span>
            </div>
            <div class="modifiers" v-if="item.modifiers?.length">
              <div v-for="mod in item.modifiers" :key="`${mod.id}-${mod.group_id}`" class="modifier">+ {{ mod.name }}</div>
            </div>
            <div class="price">{{ getItemTotalPrice(item) }} ₽</div>
          </div>

          <div class="quantity-controls">
            <button @click="decreaseQuantity(index)">-</button>
            <span>{{ item.quantity }}</span>
            <button @click="increaseQuantity(index)">+</button>
          </div>
        </div>
      </div>

      <div class="bonus-section" v-if="bonusBalance > 0">
        <div class="bonus-header">
          <label class="bonus-switch">
            <input type="checkbox" v-model="useBonuses" @change="onBonusToggle" />
            <span class="bonus-switch-track"></span>
          </label>
          <div class="bonus-title">
            Списать {{ formatPrice(displayBonusToUse) }} бонусов
            <button class="bonus-info-icon" type="button" @click="toggleBonusInfo">!</button>
          </div>
        </div>

        <div v-if="showBonusInfo" class="bonus-tooltip">
          У вас {{ formatPrice(bonusBalance) }} бонусов, можно списать до {{ maxRedeemPercentLabel }}% от суммы заказа.
        </div>
        <div class="bonus-hint" v-if="maxBonusToUse === 0">Добавьте товары, чтобы использовать бонусы</div>

        <button class="bonus-action" type="button" @click="enableBonusUsage" :disabled="maxBonusToUse === 0">Списать частично</button>
      </div>

      <div class="summary">
        <div class="summary-row">
          <span>Товары ({{ cartStore.itemsCount }})</span>
          <span>{{ formatPrice(cartStore.totalPrice) }} ₽</span>
        </div>
        <div class="summary-row" v-if="isDelivery">
          <span>Доставка</span>
          <span>{{ formatPrice(deliveryCost) }} ₽</span>
        </div>
        <div class="summary-row bonus-discount" v-if="appliedBonusToUse > 0">
          <span>Бонусы</span>
          <span class="discount">-{{ formatPrice(appliedBonusToUse) }} ₽</span>
        </div>
        <div class="summary-row total">
          <span>Итого</span>
          <span>{{ formatPrice(finalCartTotal) }} ₽</span>
        </div>
        <div class="summary-warning" v-if="isDelivery && !isMinOrderReached">Минимальная сумма заказа: {{ formatPrice(minOrderAmount) }} ₽</div>
      </div>

      <button class="checkout-btn" :class="{ 'hidden-on-keyboard': isKeyboardOpen }" @click="checkout" :disabled="isDelivery && !isMinOrderReached">Оформить заказ</button>
    </div>

    <div v-if="showPartialModal" class="bonus-modal-overlay" @click.self="closePartialModal">
      <div class="bonus-modal">
        <div class="bonus-modal-header">
          <div class="bonus-modal-title">У вас {{ formatPrice(bonusBalance) }} бонусов</div>
          <button class="bonus-modal-close" type="button" @click="closePartialModal" aria-label="Закрыть">
            <X :size="18" />
          </button>
        </div>
        <div class="bonus-modal-subtitle">Доступно к списанию до {{ maxRedeemPercentLabel }}% от {{ formatPrice(cartStore.totalPrice) }} ₽.</div>
        <input v-model="partialBonusInput" type="number" min="0" :max="maxBonusToUse" class="bonus-modal-input" placeholder="Введите сумму" />
        <div class="bonus-modal-actions">
          <button class="bonus-preset" type="button" @click="applyPreset(0.25)">25%</button>
          <button class="bonus-preset" type="button" @click="applyPreset(0.5)">50%</button>
          <button class="bonus-preset active" type="button" @click="applyPreset(1)">Максимум</button>
        </div>
        <input type="range" :min="0" :max="maxBonusToUse" v-model="partialBonusInput" class="bonus-slider" @input="hapticFeedback('selection')" />
        <button class="bonus-confirm" type="button" @click="confirmPartialBonus">Списать</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useCartStore } from "../stores/cart";
import { useLoyaltyStore } from "../stores/loyalty";
import { useLocationStore } from "../stores/location";
import { useKeyboardHandler } from "../composables/useKeyboardHandler";
import { hapticFeedback } from "../services/telegram";
import { bonusesAPI, addressesAPI } from "../api/endpoints";
import { formatPrice } from "../utils/format";

const router = useRouter();
const cartStore = useCartStore();
const locationStore = useLocationStore();
const loyaltyStore = useLoyaltyStore();
const { isKeyboardOpen } = useKeyboardHandler();
const bonusBalance = ref(0);
const showBonusInfo = ref(false);
const showPartialModal = ref(false);
const partialBonusInput = ref("");

const useBonuses = computed({
  get: () => cartStore.bonusUsage.useBonuses,
  set: (value) => cartStore.setUseBonuses(value),
});

const bonusToUse = computed({
  get: () => cartStore.bonusUsage.bonusToUse,
  set: (value) => cartStore.setBonusToUse(value),
});

const maxBonusToUse = computed(() => {
  const maxAllowed = Math.floor(cartStore.totalPrice * loyaltyStore.maxRedeemPercent);
  return Math.min(bonusBalance.value, maxAllowed);
});

const appliedBonusToUse = computed(() => {
  if (!useBonuses.value) return 0;
  return Math.min(bonusToUse.value, maxBonusToUse.value);
});

const displayBonusToUse = computed(() => {
  if (useBonuses.value) {
    return appliedBonusToUse.value;
  }
  return maxBonusToUse.value;
});

const finalCartTotal = computed(() => {
  return Math.max(0, cartStore.totalPrice + deliveryCost.value - appliedBonusToUse.value);
});

const maxRedeemPercentLabel = computed(() => Math.round(loyaltyStore.maxRedeemPercent * 100));

const isDelivery = computed(() => locationStore.deliveryType === "delivery");
const deliveryCost = computed(() => {
  if (!isDelivery.value) return 0;
  return parseFloat(locationStore.deliveryZone?.delivery_cost || 0);
});
const minOrderAmount = computed(() => {
  if (!isDelivery.value) return 0;
  return parseFloat(locationStore.deliveryZone?.min_order_amount || 0);
});
const isMinOrderReached = computed(() => {
  if (!isDelivery.value) return true;
  if (!minOrderAmount.value) return true;
  return cartStore.totalPrice >= minOrderAmount.value;
});

onMounted(async () => {
  await loadBonusBalance();
  if (isDelivery.value && !locationStore.deliveryZone && locationStore.deliveryCoords && locationStore.selectedCity?.id) {
    try {
      const checkResponse = await addressesAPI.checkDeliveryZone(
        locationStore.deliveryCoords.lat,
        locationStore.deliveryCoords.lng,
        locationStore.selectedCity.id
      );
      if (checkResponse.data?.available && checkResponse.data?.polygon) {
        locationStore.setDeliveryZone(checkResponse.data.polygon);
      }
    } catch (error) {
      console.error("Failed to load delivery zone in cart:", error);
    }
  }
});

function getItemTotalPrice(item) {
  // item.price уже включает цену варианта и всех модификаторов
  const price = parseFloat(item.price) || 0;
  const quantity = parseInt(item.quantity) || 1;
  const total = price * quantity;

  if (isNaN(total)) {
    console.error("Invalid price calculation:", { item, price, quantity, total });
    return "0";
  }

  return formatPrice(total);
}

function increaseQuantity(index) {
  hapticFeedback("light");
  cartStore.updateQuantity(index, cartStore.items[index].quantity + 1);
}

function decreaseQuantity(index) {
  hapticFeedback("light");
  cartStore.updateQuantity(index, cartStore.items[index].quantity - 1);
}

function checkout() {
  if (isDelivery.value && !isMinOrderReached.value) {
    hapticFeedback("error");
    return;
  }
  hapticFeedback("medium");
  router.push("/checkout");
}

function formatWeight(value) {
  if (!value) return "";
  return String(value);
}

function getUnitLabel(unit) {
  const units = {
    g: "г",
    kg: "кг",
    ml: "мл",
    l: "л",
    pcs: "шт",
  };
  return units[unit] || "";
}

function formatWeightValue(value, unit) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0 || !unit) {
    return "";
  }
  const unitLabel = getUnitLabel(unit);
  if (!unitLabel) return "";
  return `${formatPrice(parsedValue)} ${unitLabel}`;
}

function getItemWeight(item) {
  if (!item) return "";
  const valueWeight = formatWeightValue(item.weight_value, item.weight_unit);
  if (valueWeight) return valueWeight;
  return formatWeight(item.weight);
}

function toggleBonusInfo() {
  showBonusInfo.value = !showBonusInfo.value;
}

function enableBonusUsage() {
  if (maxBonusToUse.value === 0) return;
  hapticFeedback("light");
  useBonuses.value = true;
  partialBonusInput.value = String(appliedBonusToUse.value || maxBonusToUse.value);
  showPartialModal.value = true;
}

function closePartialModal() {
  showPartialModal.value = false;
}

function normalizePartialValue(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return 0;
  return Math.max(0, Math.min(maxBonusToUse.value, Math.floor(parsedValue)));
}

function applyPreset(multiplier) {
  const target = Math.floor(maxBonusToUse.value * multiplier);
  partialBonusInput.value = String(target);
}

function confirmPartialBonus() {
  const value = normalizePartialValue(partialBonusInput.value);
  useBonuses.value = value > 0;
  bonusToUse.value = value;
  showPartialModal.value = false;
}

async function loadBonusBalance() {
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = response.data.balance || 0;
  } catch (error) {
    console.error("Failed to load bonus balance:", error);
  }
}

function onBonusToggle() {
  if (!useBonuses.value) {
    bonusToUse.value = 0;
    showPartialModal.value = false;
    return;
  }
  if (maxBonusToUse.value > 0) {
    bonusToUse.value = maxBonusToUse.value;
  }
}

watch(
  () => useBonuses.value,
  (newValue) => {
    if (!newValue) {
      bonusToUse.value = 0;
    }
  }
);

watch(
  () => maxBonusToUse.value,
  (newMax) => {
    if (bonusToUse.value > newMax) {
      bonusToUse.value = newMax;
    }
  }
);
</script>

<style scoped>
.cart {
  min-height: 100vh;
  background: var(--color-background);
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

.cart-content {
  padding: 16px 12px 100px;
}

.items {
  margin-bottom: 16px;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  margin-bottom: 12px;
}

.item-info {
  flex: 1;
}

.item-info h3 {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.modifiers {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.variant {
  margin-top: 4px;
  margin-bottom: 4px;
}

.variant-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  font-style: italic;
}

.weight {
  margin-top: 4px;
}

.weight-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
}

.modifier {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  padding: 2px 8px;
  border-radius: var(--border-radius-sm);
}

.price {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-h3);
  color: var(--color-text-primary);
  margin-top: 8px;
}

.quantity-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quantity-controls button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  background: var(--color-background);
  font-size: 18px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.quantity-controls button:hover {
  background: var(--color-background-secondary);
}

.quantity-controls span {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-body);
  min-width: 24px;
  text-align: center;
  color: var(--color-text-primary);
}

.summary {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.summary-row.bonus-discount .discount {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}

.summary-row.total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-h2);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-bottom: 0;
}

.summary-warning {
  font-size: var(--font-size-caption);
  color: var(--color-error);
  margin-top: 8px;
}

.bonus-section {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
}

.bonus-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.bonus-switch {
  position: relative;
  width: 52px;
  height: 32px;
  flex-shrink: 0;
}

.bonus-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.bonus-switch-track {
  position: absolute;
  inset: 0;
  background: var(--color-background-secondary);
  border-radius: 20px;
  border: 2px solid var(--color-border);
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.bonus-switch-track::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #8792a1;
  transition: transform var(--transition-duration) var(--transition-easing);
}

.bonus-switch input:checked + .bonus-switch-track {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.bonus-switch input:checked + .bonus-switch-track::after {
  transform: translateX(20px);
  background: var(--color-text-primary);
}

.bonus-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.bonus-info-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--color-text-secondary);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  background: transparent;
  cursor: pointer;
}

.bonus-hint {
  margin-top: 8px;
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
}

.bonus-tooltip {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
  font-size: var(--font-size-caption);
  color: var(--color-text-primary);
}

.bonus-action {
  width: 100%;
  margin-top: 12px;
  padding: 12px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
}

.bonus-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bonus-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 200;
}

.bonus-modal {
  width: 100%;
  max-width: 420px;
  background: var(--color-background);
  border-radius: 24px 24px 0 0;
  padding: 20px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bonus-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bonus-modal-title {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.bonus-modal-close {
  border: none;
  background: transparent;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.bonus-modal-subtitle {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
}

.bonus-modal-input {
  width: 100%;
  padding: 16px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.bonus-modal-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.bonus-preset {
  padding: 12px 8px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.bonus-preset.active {
  background: #d9dbe1;
}

.bonus-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: var(--color-background-secondary);
  border-radius: 999px;
  outline: none;
}

.bonus-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
}

.bonus-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.bonus-confirm {
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.checkout-btn {
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.checkout-btn:hover {
  background: var(--color-primary-hover);
}

.checkout-btn:active {
  transform: scale(0.98);
}
</style>
