<template>
  <div class="cart">
    <div v-if="cartStore.items.length === 0" class="empty">
      <p>Корзина пуста</p>
      <button class="btn-primary" @click="$router.push('/')">Перейти в меню</button>
    </div>
    <div v-else class="cart-content">
      <div class="items">
        <div v-for="(item, index) in cartStore.items" :key="index" class="cart-item">
          <div class="item-media" v-if="item.image_url">
            <img :src="normalizeImageUrl(item.image_url)" :alt="item.name" />
          </div>
          <div class="item-info">
            <h3>
              {{ item.name }} <span class="variant-text" v-if="item.variant_name">{{ item.variant_name }}</span>
            </h3>
            <div class="modifiers" v-if="getModifierSummary(item).length">
              <div class="modifier">{{ getModifierSummary(item).join(", ") }}</div>
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
      <div class="bonus-section" v-if="bonusesEnabled && bonusBalance > 0">
        <div class="bonus-header">
          <label class="bonus-switch">
            <input type="checkbox" v-model="useBonuses" @change="onBonusToggle" />
            <span class="bonus-switch-track"></span>
          </label>
          <div class="bonus-title">
            Списать {{ formatPrice(displayBonusToUse) }} бонусов
            <button class="bonus-info-icon" type="button" @click="toggleBonusInfo" aria-label="Информация о списании">!</button>
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
      <div class="delivery-tariff-widget" v-if="isDelivery && deliveryTariffs.length >= 2">
        <div class="tariff-title">Стоимость доставки</div>
        <div v-if="deliveryCost === 0" class="tariff-subtitle">У вас бесплатная доставка</div>
        <div v-else class="tariff-subtitle">До бесплатной доставки еще {{ formatPrice(nextThreshold?.delta || 0) }} ₽</div>
        <div class="tariff-pills">
          <div
            v-for="(tariff, index) in normalizedTariffs"
            :key="index"
            class="tariff-pill"
            :class="{ free: tariff.delivery_cost === 0, current: isCurrentTariff(tariff) }"
          >
            <span>{{ formatPrice(tariff.delivery_cost) }} ₽</span>
          </div>
        </div>
      </div>
      <button class="checkout-btn" :class="{ 'hidden-on-keyboard': isKeyboardOpen }" @click="checkout" :disabled="isDelivery && !isMinOrderReached">
        Перейти к оформлению
      </button>
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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useLoyaltyStore } from "@/modules/loyalty/stores/loyalty.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useMenuStore } from "@/modules/menu/stores/menu.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { useKeyboardHandler } from "@/shared/composables/useKeyboardHandler";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { bonusesAPI, addressesAPI } from "@/shared/api/endpoints.js";
import { formatPrice, normalizeImageUrl } from "@/shared/utils/format";
import { formatWeight, formatWeightValue } from "@/shared/utils/weight";
import { calculateDeliveryCost, getThresholds, normalizeTariffs, findTariffForAmount } from "@/shared/utils/deliveryTariffs";
import { getBranchOpenState } from "@/shared/utils/workingHours";
const router = useRouter();
const cartStore = useCartStore();
const locationStore = useLocationStore();
const menuStore = useMenuStore();
const loyaltyStore = useLoyaltyStore();
const settingsStore = useSettingsStore();
const { isKeyboardOpen } = useKeyboardHandler();
const bonusBalance = ref(0);
const showBonusInfo = ref(false);
const showPartialModal = ref(false);
const partialBonusInput = ref("");
const pendingBonusState = ref(null);

const maxUsableFromApi = ref(0);
const handleVisibilityChange = async () => {
  if (document.visibilityState === "visible") {
    await loadBonusBalance();
  }
};

const bonusesEnabled = computed(() => settingsStore.bonusesEnabled);
const branchOpenState = computed(() => {
  const timeZone = locationStore.selectedCity?.timezone || "Europe/Moscow";
  if (locationStore.deliveryType === "pickup") {
    if (!locationStore.selectedBranch) {
      return { isOpen: true, reason: "" };
    }
    return getBranchOpenState(locationStore.selectedBranch.working_hours || locationStore.selectedBranch.work_hours, timeZone);
  }
  if (locationStore.deliveryType === "delivery") {
    const branchId = locationStore.deliveryZone?.branch_id;
    if (!branchId) {
      return { isOpen: true, reason: "" };
    }
    const branch = locationStore.branches.find((item) => item.id === branchId);
    if (!branch) {
      return { isOpen: false, reason: "Филиал закрыт" };
    }
    return getBranchOpenState(branch.working_hours || branch.work_hours, timeZone);
  }
  return { isOpen: true, reason: "" };
});
const ordersEnabled = computed(() => settingsStore.ordersEnabled);
const useBonuses = computed({
  get: () => cartStore.bonusUsage.useBonuses,
  set: (value) => cartStore.setUseBonuses(value),
});
const bonusToUse = computed({
  get: () => cartStore.bonusUsage.bonusToUse,
  set: (value) => cartStore.setBonusToUse(value),
});
const maxBonusToUse = computed(() => {
  if (!bonusesEnabled.value) return 0;
  return Math.min(bonusBalance.value, Math.floor(maxUsableFromApi.value));
});
const appliedBonusToUse = computed(() => {
  if (!bonusesEnabled.value) return 0;
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
const deliveryTariffs = computed(() => locationStore.deliveryZone?.tariffs || []);
const effectiveSubtotal = computed(() => Math.max(0, cartStore.totalPrice - appliedBonusToUse.value));
const deliveryCost = computed(() => {
  if (!isDelivery.value) return 0;
  return calculateDeliveryCost(deliveryTariffs.value, effectiveSubtotal.value);
});
const minOrderAmount = computed(() => 0);
const isMinOrderReached = computed(() => true);
const thresholds = computed(() => getThresholds(deliveryTariffs.value, effectiveSubtotal.value));
const nextThreshold = computed(() => (thresholds.value.length > 0 ? thresholds.value[0] : null));
const normalizedTariffs = computed(() => normalizeTariffs(deliveryTariffs.value));
const currentTariff = computed(() => findTariffForAmount(deliveryTariffs.value, effectiveSubtotal.value));
const isCurrentTariff = (tariff) => {
  if (!tariff || !currentTariff.value) return false;
  const current = currentTariff.value;
  const currentTo = current.amount_to ?? null;
  const targetTo = tariff.amount_to ?? null;
  return current.amount_from === tariff.amount_from && currentTo === targetTo && current.delivery_cost === tariff.delivery_cost;
};
const bonusChangeRequested = ref(false);
onMounted(async () => {
  await loadBonusBalance();
  if (menuStore.items?.length) {
    // Обновляем позиции корзины на основе актуального меню, чтобы подтянуть правильные цены и изображения.
    cartStore.refreshPricesFromMenu(menuStore.items);
  }
  // Обновляем баланс при возвращении в приложение, чтобы не использовать старые данные
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (isDelivery.value && !locationStore.deliveryZone && locationStore.deliveryCoords && locationStore.selectedCity?.id) {
    try {
      const checkResponse = await addressesAPI.checkDeliveryZone(
        locationStore.deliveryCoords.lat,
        locationStore.deliveryCoords.lng,
        locationStore.selectedCity.id,
      );
      if (checkResponse.data?.available && checkResponse.data?.polygon) {
        const zone = { ...checkResponse.data.polygon, tariffs: checkResponse.data.tariffs || [] };
        locationStore.setDeliveryZone(zone);
      }
    } catch (error) {
      console.error("Failed to load delivery zone in cart:", error);
    }
  }
  await ensureTariffs();
});
onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
function getItemTotalPrice(item) {
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
  if (!ordersEnabled.value) {
    hapticFeedback("error");
    alert("Прием заказов временно отключен");
    return;
  }
  if (!branchOpenState.value.isOpen) {
    hapticFeedback("error");
    alert("Филиал закрыт");
    return;
  }
  if (isDelivery.value && !settingsStore.deliveryEnabled) {
    hapticFeedback("error");
    alert("Доставка временно отключена");
    return;
  }
  if (!isDelivery.value && !settingsStore.pickupEnabled) {
    hapticFeedback("error");
    alert("Самовывоз временно отключен");
    return;
  }
  if (isDelivery.value && !isMinOrderReached.value) {
    hapticFeedback("error");
    return;
  }
  hapticFeedback("medium");
  router.push("/checkout");
}
function getModifierSummary(item) {
  if (!item || !Array.isArray(item.modifiers)) return [];
  // Группируем одинаковые допы, чтобы показывать их одной строкой с количеством.
  const grouped = new Map();
  for (const mod of item.modifiers) {
    if (!mod || typeof mod !== "object") continue;
    const id = mod.id ?? mod.modifier_id ?? mod.old_modifier_id ?? mod.name ?? "modifier";
    const key = [id, mod.group_id ?? "", mod.weight_value ?? "", mod.weight_unit ?? ""].join("|");
    const prev = grouped.get(key);
    if (prev) {
      prev.count += 1;
      continue;
    }
    grouped.set(key, {
      name: mod.name || "Доп",
      count: 1,
      weight_value: mod.weight_value ?? mod.weight ?? null,
      weight_unit: mod.weight_unit ?? null,
    });
  }
  return Array.from(grouped.values()).map((entry) => {
    const weightLabel = formatWeightValue(entry.weight_value, entry.weight_unit);
    const label = weightLabel ? `${entry.name} ${weightLabel}` : entry.name;
    return `${label} (х${entry.count})`;
  });
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
  pendingBonusState.value = {
    useBonuses: useBonuses.value,
    bonusToUse: bonusToUse.value,
  };
  const defaultValue = useBonuses.value ? appliedBonusToUse.value : maxBonusToUse.value;
  partialBonusInput.value = String(defaultValue || 0);
  showPartialModal.value = true;
}
function closePartialModal() {
  showPartialModal.value = false;
  if (pendingBonusState.value) {
    useBonuses.value = pendingBonusState.value.useBonuses;
    bonusToUse.value = pendingBonusState.value.bonusToUse;
    pendingBonusState.value = null;
  }
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
  bonusChangeRequested.value = true;
  useBonuses.value = value > 0;
  bonusToUse.value = value;
  showPartialModal.value = false;
  pendingBonusState.value = null;
}
async function loadBonusBalance() {
  if (!bonusesEnabled.value) {
    bonusBalance.value = 0;
    return;
  }
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = Math.max(0, Math.floor(Number(response.data?.balance || 0)));
    await loadMaxUsable();
    syncBonusUsage();
  } catch (error) {
    console.error("Failed to load bonus balance:", error);
  }
}
function syncBonusUsage() {
  if (!bonusesEnabled.value || bonusBalance.value <= 0) {
    cartStore.resetBonusUsage();
    return;
  }
  const maxAllowed = Math.min(bonusBalance.value, Math.floor(maxUsableFromApi.value || 0));
  if (maxAllowed <= 0) {
    cartStore.resetBonusUsage();
    return;
  }
  if (cartStore.bonusUsage.bonusToUse > maxAllowed) {
    cartStore.setBonusToUse(maxAllowed);
  }
}
async function loadMaxUsable() {
  if (!bonusesEnabled.value || cartStore.items.length === 0) {
    maxUsableFromApi.value = 0;
    return;
  }
  try {
    const orderTotal = cartStore.totalPrice + deliveryCost.value;
    const response = await bonusesAPI.calculateMaxSpend(orderTotal, deliveryCost.value);
    maxUsableFromApi.value = response.data.max_usable || 0;
  } catch (error) {
    console.error("Failed to load max usable bonuses:", error);
    maxUsableFromApi.value = 0;
  }
}
function onBonusToggle() {
  bonusChangeRequested.value = true;
  if (!useBonuses.value) {
    bonusToUse.value = 0;
    showPartialModal.value = false;
    return;
  }
  if (maxBonusToUse.value > 0) {
    bonusToUse.value = maxBonusToUse.value;
  }
}
async function ensureTariffs() {
  if (!isDelivery.value) return;
  if (!locationStore.deliveryZone || !locationStore.deliveryCoords || !locationStore.selectedCity?.id) return;
  if (Array.isArray(locationStore.deliveryZone.tariffs) && locationStore.deliveryZone.tariffs.length > 0) return;
  try {
    const response = await addressesAPI.checkDeliveryZone(
      locationStore.deliveryCoords.lat,
      locationStore.deliveryCoords.lng,
      locationStore.selectedCity.id,
      cartStore.totalPrice,
    );
    if (response.data?.available && response.data?.polygon) {
      const zone = { ...response.data.polygon, tariffs: response.data.tariffs || [] };
      locationStore.setDeliveryZone(zone);
    }
  } catch (error) {
    console.error("Failed to refresh delivery tariffs:", error);
  }
}
watch(
  () => useBonuses.value,
  (newValue) => {
    if (!newValue) {
      bonusToUse.value = 0;
    }
  },
);
watch(
  () => maxBonusToUse.value,
  (newMax) => {
    if (bonusToUse.value > newMax) {
      bonusToUse.value = newMax;
    }
  },
);
watch(
  () => bonusesEnabled.value,
  (isEnabled) => {
    if (isEnabled) return;
    cartStore.resetBonusUsage();
    bonusBalance.value = 0;
    maxUsableFromApi.value = 0;
    showPartialModal.value = false;
  },
);
watch(
  () => appliedBonusToUse.value,
  (nextValue, prevValue) => {
    if (!bonusChangeRequested.value || !isDelivery.value) return;
    const beforeCost = calculateDeliveryCost(deliveryTariffs.value, Math.max(0, cartStore.totalPrice - prevValue));
    const afterCost = calculateDeliveryCost(deliveryTariffs.value, Math.max(0, cartStore.totalPrice - nextValue));
    if (afterCost > beforeCost) {
      alert(`Внимание! После списания бонусов стоимость доставки изменится с ${beforeCost} ₽ на ${afterCost} ₽`);
    }
    bonusChangeRequested.value = false;
  },
);

watch(
  () => menuStore.items,
  (items) => {
    if (Array.isArray(items) && items.length > 0) {
      cartStore.refreshPricesFromMenu(items);
    }
  },
  { deep: true },
);

watch(
  () => [cartStore.items.length, cartStore.totalPrice, deliveryCost.value],
  async () => {
    if (bonusesEnabled.value && cartStore.items.length > 0) {
      await loadMaxUsable();
    }
    await ensureTariffs();
  },
  { deep: true },
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
  margin-bottom: 8px;
}
.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  margin-bottom: 8px;
  gap: 6px;
}
.item-media {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}
.item-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.item-info {
  flex: 1;
}
.item-info h3 {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  line-height: 1;
  margin-bottom: 4px;
}
.variant-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.weight-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
}
.modifier {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  line-height: 1.3;
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
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  margin-bottom: 8px;
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
  margin-bottom: 8px;
  padding: 8px;
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
  border: 1px solid var(--color-text-secondary);
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
.delivery-tariff-widget {
  margin: 8px 0 8px;
  padding: 8px 6px;
  border-radius: 18px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  text-align: center;
}
.tariff-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}
.tariff-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
.tariff-pills {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tariff-pill {
  position: relative;
  min-width: 64px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-weight: 700;
  background: var(--color-background);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  font-size: var(--font-size-caption);
}
.tariff-pill::after {
  position: absolute;
  content: "";
  height: 1px;
  width: 12px;
  top: 50%;
  right: -13px;
  background: var(--color-border);
}
.tariff-pill.free::after {
  width: 0;
  height: 0;
}
.tariff-pill.current {
  border-color: var(--color-success);
  color: var(--color-success);
}
.tariff-current {
  font-size: 11px;
  font-weight: 600;
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
