<template>
  <div class="checkout">
    <div class="content">
      <div v-if="!ordersEnabled" class="order-disabled">Прием заказов временно отключен</div>
      <div v-else-if="!deliveryEnabled && !pickupEnabled" class="order-disabled">Нет доступных способов заказа</div>
      <template v-else>
        <div class="order-type-tabs">
          <button v-if="deliveryEnabled" class="order-tab" :class="{ active: orderType === 'delivery' }" @click="selectOrderType('delivery')">
            <Truck :size="18" />
            Доставка
          </button>
          <button v-if="pickupEnabled" class="order-tab" :class="{ active: orderType === 'pickup' }" @click="selectOrderType('pickup')">
            <Store :size="18" />
            Самовывоз
          </button>
        </div>
        <div v-if="orderType" class="time-panel">
          <div v-if="estimatedFulfillmentTime" class="time-info">
            <Clock size="24" /> <span class="delivery-time">{{ estimatedFulfillmentTime }}</span>
          </div>
        </div>
      </template>
    </div>
    <div class="content" v-if="ordersEnabled && orderType === 'delivery'">
      <div class="delivery-form">
        <h2 class="section-title">Адрес доставки</h2>
        <div class="form-group">
          <label class="label">Улица, дом</label>
          <div class="address-row">
            <span class="address-text" :class="{ 'address-placeholder': !deliveryAddress }">
              {{ deliveryAddress || "Укажите адрес" }}
            </span>
            <button class="edit-address-btn" type="button" @click="openDeliveryMap">
              <Pencil :size="16" />
            </button>
          </div>
        </div>
        <div v-if="addressValidated && inDeliveryZone" class="address-details">
          <div class="form-row">
            <div class="form-group">
              <label class="label">Подъезд</label>
              <input v-model="deliveryDetails.entrance" class="input" placeholder="Номер подъезда" />
            </div>
            <div class="form-group">
              <label class="label">Этаж</label>
              <input v-model="deliveryDetails.floor" class="input" placeholder="Этаж" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="label">Квартира</label>
              <input v-model="deliveryDetails.apartment" class="input" placeholder="Номер квартиры" />
            </div>
            <div class="form-group">
              <label class="label">Код на двери</label>
              <input v-model="deliveryDetails.doorCode" class="input" placeholder="Код" />
            </div>
          </div>
          <div class="form-group">
            <label class="label">Комментарий к адресу</label>
            <textarea v-model="deliveryDetails.comment" class="textarea" placeholder="Дополнительная информация для курьера" resize="none"></textarea>
          </div>
        </div>
        <div v-if="addressValidated && !inDeliveryZone" class="error-message">
          <p>Адрес не входит в зону доставки</p>
          <button class="btn-secondary" @click="openDeliveryMap">Выбрать другой адрес</button>
        </div>
      </div>
    </div>
    <div class="content" v-if="ordersEnabled && orderType === 'pickup'">
      <div class="pickup-form">
        <h2 class="section-title">Выберите филиал</h2>
        <div v-if="loadingBranches" class="loading">Загрузка филиалов...</div>
        <div v-else class="branches-list">
          <button
            v-for="branch in branches"
            :key="branch.id"
            :class="['branch-card', { active: selectedBranch?.id === branch.id }]"
            @click="selectBranch(branch)"
          >
            <h3>{{ branch.name }}</h3>
            <p class="branch-address">{{ branch.address }}</p>
            <p class="branch-phone" v-if="branch.phone">
              <Phone :size="14" />
              {{ branch.phone }}
            </p>
          </button>
        </div>
      </div>
    </div>
    <div class="content" v-if="ordersEnabled && orderType && (orderType === 'pickup' ? selectedBranch : inDeliveryZone)">
      <div class="order-options">
        <h2 class="section-title">Дополнительно</h2>
        <div class="form-group">
          <label class="label">Способ оплаты</label>
          <div class="payment-options">
            <button :class="['payment-option', { active: paymentMethod === 'cash' }]" @click="paymentMethod = 'cash'">
              <Banknote :size="16" />
              Наличные
            </button>
            <button :class="['payment-option', { active: paymentMethod === 'card' }]" @click="paymentMethod = 'card'">
              <CreditCard :size="16" />
              Карта
            </button>
          </div>
        </div>
        <div class="form-group" v-if="paymentMethod === 'cash'">
          <label class="label">Сдача с</label>
          <input v-model.number="changeFrom" type="number" class="input" placeholder="Сумма" min="0" step="100" />
        </div>
        <div class="form-group">
          <label class="label">Комментарий к заказу</label>
          <textarea v-model="orderComment" class="textarea" placeholder="Дополнительные пожелания"></textarea>
        </div>
      </div>
      <div class="order-summary">
        <div class="summary-row">
          <span>Сумма</span>
          <span>{{ formatPrice(summarySubtotal) }} ₽</span>
        </div>
        <div class="summary-row" v-if="orderType === 'delivery' && deliveryCost > 0">
          <span>Доставка</span>
          <span>{{ formatPrice(deliveryCost) }} ₽</span>
        </div>
        <div class="summary-row bonus-earn" v-if="bonusesEnabled && bonusesToEarn > 0">
          <span>Будет начислено</span>
          <span class="earn">{{ formatPrice(bonusesToEarn) }} бонусов</span>
        </div>
        <div class="summary-row bonus-discount" v-if="bonusesEnabled && appliedBonusToUse > 0">
          <span>Будет списано</span>
          <span class="discount">{{ formatPrice(appliedBonusToUse) }} бонусов</span>
        </div>
        <div class="summary-row total">
          <span>Итого к оплате</span>
          <span>{{ formatPrice(finalTotalPrice) }} ₽</span>
        </div>
        <div class="summary-info" v-if="orderType === 'delivery' && !isMinOrderReached">
          <span class="delivery-time">Минимальная сумма заказа: {{ formatPrice(minOrderAmount) }} ₽</span>
        </div>
      </div>
    </div>
    <div class="footer" :class="{ 'hidden-on-keyboard': isKeyboardOpen }" v-if="ordersEnabled && orderType">
      <button class="submit-btn" @click="submitOrder" :disabled="submitting || !canSubmitOrder">
        {{ submitting ? "Оформление..." : `Оформить заказ • ${formatPrice(finalTotalPrice)} ₽` }}
      </button>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { Banknote, CreditCard, Phone, Store, Truck, Clock, Pencil } from "lucide-vue-next";
import { useCartStore } from "../stores/cart";
import { useLoyaltyStore } from "../stores/loyalty";
import { useLocationStore } from "../stores/location";
import { useMenuStore } from "../stores/menu";
import { useSettingsStore } from "../stores/settings";
import { useKeyboardHandler } from "../composables/useKeyboardHandler";
import { citiesAPI, addressesAPI, ordersAPI, menuAPI, bonusesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import { formatPrice } from "../utils/format";
const router = useRouter();
const cartStore = useCartStore();
const locationStore = useLocationStore();
const loyaltyStore = useLoyaltyStore();
const menuStore = useMenuStore();
const settingsStore = useSettingsStore();
const { isKeyboardOpen } = useKeyboardHandler();
const orderType = ref(locationStore.deliveryType || null);
const deliveryAddress = ref(locationStore.deliveryAddress || "");
const addressValidated = ref(false);
const inDeliveryZone = ref(false);
const selectedBranch = ref(locationStore.selectedBranch || null);
const branches = ref([]);
const loadingBranches = ref(false);
const paymentMethod = ref("cash");
const changeFrom = ref(null);
const orderComment = ref("");
const deliveryCost = ref(0);
const submitting = ref(false);
const deliveryTime = ref(0);
const minOrderAmount = ref(0);
const prepTime = ref(0);
const assemblyTime = ref(0);
const bonusBalance = ref(null);
const handleVisibilityChange = async () => {
  if (document.visibilityState === "visible") {
    await refreshBonusBalance();
  }
};
const ordersEnabled = computed(() => settingsStore.ordersEnabled);
const deliveryEnabled = computed(() => settingsStore.deliveryEnabled);
const pickupEnabled = computed(() => settingsStore.pickupEnabled);
const bonusesEnabled = computed(() => settingsStore.bonusesEnabled);
const deliveryDetails = ref({
  entrance: locationStore.deliveryDetails?.entrance || "",
  doorCode: locationStore.deliveryDetails?.doorCode || "",
  floor: locationStore.deliveryDetails?.floor || "",
  apartment: locationStore.deliveryDetails?.apartment || "",
  comment: locationStore.deliveryDetails?.comment || "",
});
const deliveryCoords = computed(() => locationStore.deliveryCoords);
const canSubmitOrder = computed(() => {
  if (!ordersEnabled.value) return false;
  if (!orderType.value) return false;
  if (orderType.value === "delivery") {
    return addressValidated.value && inDeliveryZone.value && deliveryAddress.value.trim() && isMinOrderReached.value;
  } else {
    return selectedBranch.value !== null;
  }
});
const isMinOrderReached = computed(() => {
  if (orderType.value !== "delivery") return true;
  if (!minOrderAmount.value) return true;
  return summarySubtotal.value >= minOrderAmount.value;
});
const appliedBonusToUse = computed(() => {
  if (!bonusesEnabled.value) return 0;
  if (!cartStore.bonusUsage.useBonuses) return 0;
  const balanceLimit = bonusBalance.value === null ? Number.POSITIVE_INFINITY : bonusBalance.value;
  const maxByPercent = Math.floor(cartStore.totalPrice * loyaltyStore.maxRedeemPercent);
  return Math.min(cartStore.bonusUsage.bonusToUse, maxByPercent, balanceLimit);
});
const deliveryCostForSummary = computed(() => (orderType.value === "delivery" ? deliveryCost.value : 0));
const finalTotalPrice = computed(() => {
  const subtotal = cartStore.totalPrice;
  const bonus = appliedBonusToUse.value;
  const payable = Math.max(0, subtotal - bonus);
  return payable + deliveryCostForSummary.value;
});
const summarySubtotal = computed(() => {
  return cartStore.totalPrice;
});
const bonusesToEarn = computed(() => {
  if (!bonusesEnabled.value) return 0;

  const baseAmount = summarySubtotal.value - appliedBonusToUse.value;
  return Math.floor(Math.max(0, baseAmount) * loyaltyStore.rate);
});
const estimatedFulfillmentTime = computed(() => {
  if (!orderType.value) return null;
  const formatTime = (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  const buildRange = (centerMinutes) => {
    const total = Number(centerMinutes || 0);
    if (!total) return null;
    const centerTime = new Date(now.getTime() + total * 60000);
    const minTime = new Date(centerTime.getTime() - 5 * 60000);
    const maxTime = new Date(centerTime.getTime() + 5 * 60000);
    return `${formatTime(minTime)}-${formatTime(maxTime)}`;
  };
  const now = new Date();
  if (orderType.value === "delivery") {
    const total = deliveryTime.value + prepTime.value + assemblyTime.value;
    const range = buildRange(total);
    if (!range) return null;
    return `Заказ доставим до ${range}`;
  }
  const pickupRange = buildRange(prepTime.value);
  if (!pickupRange) return null;
  return `Заказ приготовим до ${pickupRange}`;
});
const totalPrice = computed(() => finalTotalPrice.value);
const resolveOrderType = () => {
  if (!ordersEnabled.value) {
    orderType.value = null;
    return;
  }
  if (deliveryEnabled.value && pickupEnabled.value) {
    if (!["delivery", "pickup"].includes(orderType.value)) {
      orderType.value = locationStore.deliveryType || "delivery";
    }
  } else if (deliveryEnabled.value) {
    orderType.value = "delivery";
  } else if (pickupEnabled.value) {
    orderType.value = "pickup";
  } else {
    orderType.value = null;
  }
  if (orderType.value) {
    locationStore.setDeliveryType(orderType.value);
  }
};
onMounted(async () => {
  resolveOrderType();
  await refreshBonusBalance();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (orderType.value === "pickup") {
    await loadBranches();
    applyBranchTimes(selectedBranch.value);
  }
  if (orderType.value === "delivery" && locationStore.deliveryAddress && locationStore.deliveryCoords) {
    addressValidated.value = true;
    inDeliveryZone.value = true;
  }
  if (locationStore.deliveryZone && orderType.value === "delivery") {
    applyDeliveryZone(locationStore.deliveryZone);
  } else if (orderType.value === "delivery" && locationStore.deliveryCoords && locationStore.selectedCity?.id) {
    try {
      const checkResponse = await addressesAPI.checkDeliveryZone(
        locationStore.deliveryCoords.lat,
        locationStore.deliveryCoords.lng,
        locationStore.selectedCity.id,
      );
      if (checkResponse.data?.available && checkResponse.data?.polygon) {
        applyDeliveryZone(checkResponse.data.polygon);
        locationStore.setDeliveryZone(checkResponse.data.polygon);
      }
    } catch (error) {
      console.error("Failed to refresh delivery zone:", error);
    }
  }
  if (bonusesEnabled.value) {
    loyaltyStore.refreshFromProfile();
  }
});
onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
watch(
  () => [ordersEnabled.value, deliveryEnabled.value, pickupEnabled.value],
  () => {
    resolveOrderType();
  },
);
watch(
  () => bonusesEnabled.value,
  (isEnabled) => {
    if (isEnabled) {
      refreshBonusBalance();
      return;
    }
    cartStore.resetBonusUsage();
    bonusBalance.value = 0;
  },
);
watch(
  () => orderType.value,
  async (newType) => {
    if (newType === "pickup") {
      await loadBranches();
      deliveryCost.value = 0;
      deliveryTime.value = 0;
      minOrderAmount.value = 0;
      assemblyTime.value = 0;
      applyBranchTimes(selectedBranch.value);
    }
    if (newType === "delivery" && locationStore.deliveryAddress && locationStore.deliveryCoords) {
      prepTime.value = 0;
      assemblyTime.value = 0;
      addressValidated.value = true;
      inDeliveryZone.value = true;
      if (locationStore.deliveryZone) {
        applyDeliveryZone(locationStore.deliveryZone);
      }
    }
    await refreshCartPricesForOrderType();
  },
);
watch(
  () => [locationStore.deliveryAddress, deliveryCoords.value, locationStore.deliveryZone, orderType.value],
  () => {
    if (orderType.value !== "delivery") {
      addressValidated.value = false;
      inDeliveryZone.value = false;
      deliveryCost.value = 0;
      return;
    }
    deliveryAddress.value = locationStore.deliveryAddress || "";
    if (deliveryAddress.value && deliveryCoords.value) {
      addressValidated.value = true;
      inDeliveryZone.value = Boolean(locationStore.deliveryZone);
      if (locationStore.deliveryZone) {
        applyDeliveryZone(locationStore.deliveryZone);
      }
    } else {
      addressValidated.value = false;
      inDeliveryZone.value = false;
    }
  },
  { immediate: true },
);
async function refreshCartPricesForOrderType() {
  if (!orderType.value) return;
  if (!locationStore.selectedCity) return;
  const fulfillmentType = orderType.value === "pickup" ? "pickup" : "delivery";
  const branchId = locationStore.selectedBranch?.id || null;
  try {
    const response = await menuAPI.getMenu(locationStore.selectedCity.id, { fulfillmentType, branchId });
    const categories = response.data.categories || [];
    const allItems = categories.flatMap((category) => category.items || []);
    menuStore.setMenuData({
      cityId: locationStore.selectedCity.id,
      fulfillmentType,
      branchId,
      categories,
      items: allItems,
    });
    cartStore.refreshPricesFromMenu(allItems);
  } catch (error) {
    console.error("Failed to refresh cart prices:", error);
  }
}
watch(
  () => cartStore.totalPrice,
  () => {
    if (cartStore.bonusUsage.bonusToUse > appliedBonusToUse.value) {
      cartStore.setBonusToUse(appliedBonusToUse.value);
    }
  },
);
async function refreshBonusBalance() {
  if (!bonusesEnabled.value) {
    bonusBalance.value = 0;
    return;
  }
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = Math.max(0, Math.floor(Number(response.data?.balance || 0)));
    if (bonusBalance.value <= 0) {
      cartStore.resetBonusUsage();
      return;
    }
    if (cartStore.bonusUsage.useBonuses && cartStore.bonusUsage.bonusToUse > appliedBonusToUse.value) {
      cartStore.setBonusToUse(appliedBonusToUse.value);
    }
  } catch (error) {
    console.error("Не удалось обновить бонусный баланс:", error);
  }
}
function selectOrderType(type) {
  if (!ordersEnabled.value) return;
  if (type === "delivery" && !deliveryEnabled.value) return;
  if (type === "pickup" && !pickupEnabled.value) return;
  hapticFeedback("light");
  orderType.value = type;
  locationStore.setDeliveryType(type);
  if (type === "delivery") {
    deliveryAddress.value = locationStore.deliveryAddress || "";
    prepTime.value = 0;
    assemblyTime.value = 0;
    if (locationStore.deliveryZone) {
      applyDeliveryZone(locationStore.deliveryZone);
    }
  } else if (type === "pickup") {
    selectedBranch.value = locationStore.selectedBranch || null;
    deliveryCost.value = 0;
    deliveryTime.value = 0;
    minOrderAmount.value = 0;
    assemblyTime.value = 0;
    applyBranchTimes(selectedBranch.value);
  }
}
function openDeliveryMap() {
  hapticFeedback("light");
  router.push("/delivery-map");
}
async function loadBranches() {
  if (!locationStore.selectedCity) return;
  try {
    loadingBranches.value = true;
    const response = await citiesAPI.getBranches(locationStore.selectedCity.id);
    branches.value = response.data.branches || [];
  } catch (error) {
    console.error("Failed to load branches:", error);
  } finally {
    loadingBranches.value = false;
  }
}
function selectBranch(branch) {
  hapticFeedback("light");
  selectedBranch.value = branch;
  locationStore.setBranch(branch);
  applyBranchTimes(branch);
}
function applyBranchTimes(branch) {
  prepTime.value = parseInt(branch?.prep_time || 0);
}
function applyDeliveryZone(zone) {
  if (orderType.value !== "delivery") return;
  deliveryCost.value = parseFloat(zone?.delivery_cost || 0);
  deliveryTime.value = parseInt(zone?.delivery_time || 0);
  minOrderAmount.value = parseFloat(zone?.min_order_amount || 0);
  prepTime.value = parseInt(zone?.prep_time || 0);
  assemblyTime.value = parseInt(zone?.assembly_time || 0);
}
async function submitOrder() {
  if (!canSubmitOrder.value || submitting.value) return;
  if (!ordersEnabled.value) return;
  submitting.value = true;
  hapticFeedback("medium");
  try {
    if (!locationStore.selectedCity?.id) {
      alert("Выберите город перед оформлением заказа");
      return;
    }
    let bonusToUse = bonusesEnabled.value ? appliedBonusToUse.value : 0;
    if (bonusesEnabled.value && cartStore.bonusUsage.useBonuses) {
      try {
        const balanceResponse = await bonusesAPI.getBalance();
        const freshBalance = Math.max(0, Math.floor(Number(balanceResponse.data?.balance || 0)));
        bonusToUse = Math.min(bonusToUse, freshBalance);
        if (bonusToUse <= 0) {
          cartStore.resetBonusUsage();
        } else if (bonusToUse !== cartStore.bonusUsage.bonusToUse) {
          cartStore.setBonusToUse(bonusToUse);
        }
      } catch (error) {
        console.error("Не удалось обновить бонусный баланс перед оформлением:", error);
        bonusToUse = 0;
        cartStore.resetBonusUsage();
      }
    }
    const orderData = {
      city_id: locationStore.selectedCity.id,
      order_type: orderType.value,
      timezone_offset: new Date().getTimezoneOffset(),
      items: cartStore.items.map((item) => ({
        item_id: item.id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        modifiers:
          item.modifiers
            ?.map((mod) => {
              if (typeof mod === "number") return mod;
              if (typeof mod === "string") return parseInt(mod, 10);
              return mod?.id ?? mod?.modifier_id ?? mod?.old_modifier_id ?? null;
            })
            .filter((id) => Number.isFinite(id)) || [],
      })),
      payment_method: paymentMethod.value,
      comment: orderComment.value,
      bonus_to_use: bonusToUse,
    };
    if (orderType.value === "delivery") {
      const addressParts = deliveryAddress.value.split(",").map((s) => s.trim());
      let street = "";
      let house = "";
      if (addressParts.length >= 2) {
        house = addressParts[addressParts.length - 1];
        street = addressParts.slice(0, -1).join(", ");
      } else {
        const match = deliveryAddress.value.match(/^(.+?)\s+(\d+.*)$/);
        if (match) {
          street = match[1];
          house = match[2];
        } else {
          street = deliveryAddress.value;
          house = "";
        }
      }
      orderData.delivery_street = street;
      orderData.delivery_house = house;
      orderData.delivery_entrance = deliveryDetails.value.entrance;
      orderData.delivery_floor = deliveryDetails.value.floor;
      orderData.delivery_apartment = deliveryDetails.value.apartment;
      orderData.delivery_intercom = deliveryDetails.value.doorCode;
      orderData.delivery_comment = deliveryDetails.value.comment;
    } else {
      orderData.branch_id = selectedBranch.value.id;
    }
    if (paymentMethod.value === "cash" && changeFrom.value) {
      orderData.change_from = changeFrom.value;
    }
    const response = await ordersAPI.createOrder(orderData);
    hapticFeedback("success");
    cartStore.clearCart();
    router.push("/");
  } catch (error) {
    console.error("Failed to create order:", error);
    hapticFeedback("error");
    let errorMessage = "Ошибка при оформлении заказа";
    const errorTranslations = {
      "Delivery is not available to this address": "Доставка по этому адресу недоступна. Возможно, адрес находится вне зоны доставки.",
      "delivery address is required for delivery orders": "Укажите адрес доставки",
      "branch_id is required for pickup orders": "Выберите филиал для самовывоза",
      "Cart is empty": "Корзина пуста",
      "Insufficient stock": "Недостаточно товара на складе",
      "Minimum order amount is": "Минимальная сумма заказа не достигнута",
    };
    if (error.status === 0) {
      errorMessage = "Нет связи с сервером. Проверьте интернет-соединение и убедитесь, что backend запущен.";
    } else if (error.data?.error) {
      const serverError = error.data.error;
      if (serverError.startsWith("Minimum order amount is")) {
        const amount = serverError.replace("Minimum order amount is", "").trim();
        errorMessage = `Минимальная сумма заказа ${amount} ₽`;
      } else {
        errorMessage = errorTranslations[serverError] || serverError;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    alert(errorMessage);
  } finally {
    submitting.value = false;
  }
}
</script>
<style scoped>
.checkout {
  min-height: 100vh;
  background: var(--color-background);
  padding: 12px;
  padding-bottom: 108px;
}
.order-disabled {
  padding: 16px;
  border-radius: var(--border-radius-lg);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  text-align: center;
  font-weight: var(--font-weight-semibold);
}
.time-panel {
  margin-top: 12px;
  padding: 12px;
}
.time-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
}
.order-type-tabs {
  display: flex;
  gap: 10px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  padding: 2px;
}
.order-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.order-tab.active {
  background: var(--color-primary);
  color: var(--color-text-primary);
}
.order-tab:not(.active):hover {
  background: var(--color-background-secondary);
}
.section-title {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}
.order-type-selection {
  margin-top: 16px;
}
.order-type-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.order-type-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--color-background);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.order-type-card:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}
.card-icon {
  font-size: 48px;
  line-height: 1;
}
.card-content h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}
.card-content p {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin: 0;
}
.form-group {
  margin-bottom: 16px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.label {
  display: block;
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 8px;
}
.address-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
}
.address-text {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.3;
  flex: 1;
}
.address-placeholder {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-regular);
}
.edit-address-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 14px;
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}
.edit-address-btn:hover {
  background: var(--color-border);
}
.input,
.textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  font-family: inherit;
}
.input:focus,
.textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}
.textarea {
  min-height: 80px;
  resize: vertical;
}
.suggestions {
  margin-top: 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  overflow: hidden;
}
.suggestion-item {
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  border: none;
  background: var(--color-background);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color 0.2s;
}
.suggestion-item:hover {
  background: var(--color-background-secondary);
}
.error-message {
  padding: 16px;
  background: #ffebee;
  border-radius: var(--border-radius-md);
  text-align: center;
}
.error-message p {
  color: #c62828;
  margin-bottom: 12px;
  font-weight: var(--font-weight-semibold);
}
.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  cursor: pointer;
}
.branches-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.branch-card {
  padding: 16px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}
.branch-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.branch-card h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}
.branch-address {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin: 4px 0;
}
.branch-phone {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin: 4px 0 0 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.payment-options {
  display: flex;
  gap: 12px;
}
.payment-option {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.payment-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.order-summary {
  padding-bottom: 12px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  padding-bottom: 4px;
}
.summary-row.bonus-discount .discount {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}
.summary-row.bonus-discount {
  margin-bottom: 12px;
}
.summary-row.bonus-earn .earn {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}
.summary-row.total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-h3);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-bottom: 0;
}
.summary-info {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  text-align: center;
}
.delivery-time {
  display: block;
}
.footer {
  position: fixed;
  bottom: 40px;
  left: 0;
  right: 0;
  padding: 12px;
  z-index: 100;
}
.submit-btn {
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color 0.2s;
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.submit-btn:not(:disabled):hover {
  background: var(--color-primary-hover);
}
.loading {
  text-align: center;
  padding: 32px;
  color: var(--color-text-secondary);
}
</style>
