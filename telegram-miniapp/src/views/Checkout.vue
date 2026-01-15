<template>
  <div class="checkout">
    <PageHeader title="Оформление заказа" />

    <div class="content">
      <div class="order-type-tabs">
        <button
          class="order-tab"
          :class="{ active: orderType === 'delivery' }"
          @click="selectOrderType('delivery')"
        >
          <Truck :size="18" />
          Доставка
        </button>
        <button
          class="order-tab"
          :class="{ active: orderType === 'pickup' }"
          @click="selectOrderType('pickup')"
        >
          <Store :size="18" />
          Самовывоз
        </button>
      </div>
    </div>

    <!-- Форма доставки -->
    <div class="content" v-if="orderType === 'delivery'">
      <div class="delivery-form">
        <h2 class="section-title">Адрес доставки</h2>

        <div class="form-group">
          <label class="label">Улица, дом</label>
          <input
            v-model="deliveryAddress"
            class="input"
            placeholder="Введите адрес"
            @input="onAddressInput"
            @focus="showAddressSuggestions = true"
          />
          
          <div v-if="showAddressSuggestions && addressSuggestions.length" class="suggestions">
            <button
              v-for="(suggestion, index) in addressSuggestions"
              :key="index"
              class="suggestion-item"
              @click="selectAddress(suggestion)"
            >
              {{ suggestion.label }}
            </button>
          </div>
        </div>

        <div v-if="addressValidated && inDeliveryZone" class="address-details">
          <div class="form-group">
            <label class="label">Подъезд</label>
            <input v-model="deliveryDetails.entrance" class="input" placeholder="Номер подъезда" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="label">Код на двери</label>
              <input v-model="deliveryDetails.doorCode" class="input" placeholder="Код" />
            </div>
            <div class="form-group">
              <label class="label">Этаж</label>
              <input v-model="deliveryDetails.floor" class="input" placeholder="Этаж" />
            </div>
          </div>

          <div class="form-group">
            <label class="label">Квартира</label>
            <input v-model="deliveryDetails.apartment" class="input" placeholder="Номер квартиры" />
          </div>

          <div class="form-group">
            <label class="label">Комментарий к адресу</label>
            <textarea
              v-model="deliveryDetails.comment"
              class="textarea"
              placeholder="Дополнительная информация для курьера"
            ></textarea>
          </div>
        </div>

        <div v-if="addressValidated && !inDeliveryZone" class="error-message">
          <p>Адрес не входит в зону доставки</p>
          <button class="btn-secondary" @click="resetAddress">Выбрать другой адрес</button>
        </div>
      </div>
    </div>

    <!-- Форма самовывоза -->
    <div class="content" v-if="orderType === 'pickup'">
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

    <!-- Общие поля заказа -->
    <div class="content" v-if="orderType && (orderType === 'pickup' ? selectedBranch : inDeliveryZone)">
      <div class="order-options">
        <h2 class="section-title">Дополнительно</h2>

        <div class="form-group">
          <label class="label">Способ оплаты</label>
          <div class="payment-options">
            <button
              :class="['payment-option', { active: paymentMethod === 'cash' }]"
              @click="paymentMethod = 'cash'"
            >
              <Banknote :size="16" />
              Наличные
            </button>
            <button
              :class="['payment-option', { active: paymentMethod === 'card' }]"
              @click="paymentMethod = 'card'"
            >
              <CreditCard :size="16" />
              Карта
            </button>
          </div>
        </div>

        <div class="form-group" v-if="paymentMethod === 'cash'">
          <label class="label">Сдача с</label>
          <input
            v-model.number="changeFrom"
            type="number"
            class="input"
            placeholder="Сумма"
            min="0"
            step="100"
          />
        </div>

        <div class="form-group">
          <label class="label">Комментарий к заказу</label>
          <textarea
            v-model="orderComment"
            class="textarea"
            placeholder="Дополнительные пожелания"
          ></textarea>
        </div>
      </div>

      <!-- Итоговая сумма -->
      <div class="order-summary">
        <div class="summary-row">
          <span>Товары ({{ cartStore.itemsCount }})</span>
          <span>{{ formatPrice(cartStore.totalPrice) }} ₽</span>
        </div>
        <div class="summary-row">
          <span>Доставка</span>
          <span>{{ formatPrice(deliveryCost) }} ₽</span>
        </div>
        <div class="summary-row total">
          <span>Итого</span>
          <span>{{ formatPrice(totalPrice) }} ₽</span>
        </div>
      </div>
    </div>

    <!-- Кнопка подтверждения -->
    <div class="footer" v-if="canSubmitOrder">
      <button class="submit-btn" @click="submitOrder" :disabled="submitting">
        {{ submitting ? 'Оформление...' : `Оформить заказ • ${formatPrice(totalPrice)} ₽` }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { Banknote, CreditCard, Phone, Store, Truck } from "lucide-vue-next";
import { useCartStore } from "../stores/cart";
import { useLocationStore } from "../stores/location";
import { citiesAPI, addressesAPI, ordersAPI, geocodeAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import PageHeader from "../components/PageHeader.vue";
import { formatPrice } from "../utils/format";

const router = useRouter();
const cartStore = useCartStore();
const locationStore = useLocationStore();

const orderType = ref(locationStore.deliveryType || null);
const deliveryAddress = ref(locationStore.deliveryAddress || "");
const addressSuggestions = ref([]);
const showAddressSuggestions = ref(false);
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

const deliveryDetails = ref({
  entrance: locationStore.deliveryDetails?.entrance || "",
  doorCode: locationStore.deliveryDetails?.doorCode || "",
  floor: locationStore.deliveryDetails?.floor || "",
  apartment: locationStore.deliveryDetails?.apartment || "",
  comment: locationStore.deliveryDetails?.comment || "",
});

let addressSearchTimeout = null;

const canSubmitOrder = computed(() => {
  if (!orderType.value) return false;
  
  if (orderType.value === "delivery") {
    return addressValidated.value && inDeliveryZone.value && deliveryAddress.value.trim();
  } else {
    return selectedBranch.value !== null;
  }
});

const totalPrice = computed(() => {
  return cartStore.totalPrice + deliveryCost.value;
});

onMounted(async () => {
  if (!orderType.value) {
    orderType.value = locationStore.deliveryType || "delivery";
  }
  locationStore.setDeliveryType(orderType.value);

  if (orderType.value === "pickup") {
    await loadBranches();
  }

  if (orderType.value === "delivery" && locationStore.deliveryAddress && locationStore.deliveryCoords) {
    addressValidated.value = true;
    inDeliveryZone.value = true;
  }
});

watch(() => orderType.value, async (newType) => {
  if (newType === "pickup") {
    await loadBranches();
  }
  if (newType === "delivery" && locationStore.deliveryAddress && locationStore.deliveryCoords) {
    addressValidated.value = true;
    inDeliveryZone.value = true;
  }
});

function selectOrderType(type) {
  hapticFeedback("light");
  orderType.value = type;
  locationStore.setDeliveryType(type);
  if (type === "delivery") {
    deliveryAddress.value = locationStore.deliveryAddress || "";
  } else if (type === "pickup") {
    selectedBranch.value = locationStore.selectedBranch || null;
  }
}

async function onAddressInput() {
  if (addressSearchTimeout) {
    clearTimeout(addressSearchTimeout);
  }

  if (deliveryAddress.value.length < 3) {
    addressSuggestions.value = [];
    return;
  }

  addressSearchTimeout = setTimeout(async () => {
    try {
      // Здесь будет запрос к API для автоподсказок адресов
      // Пока используем простую логику
      const response = await addressesAPI.checkDeliveryZone(
        deliveryAddress.value,
        locationStore.selectedCity.id
      );
      // TODO: Реализовать автоподсказки через Nominatim
    } catch (error) {
      console.error("Address search error:", error);
    }
  }, 500);
}

async function selectAddress(suggestion) {
  hapticFeedback("light");
  deliveryAddress.value = suggestion.label;
  showAddressSuggestions.value = false;
  
  // Геокодируем адрес
  try {
    const geocodeResponse = await geocodeAPI.geocode(deliveryAddress.value);
    const geocodeData = geocodeResponse.data;
    
    // Проверяем зону доставки
    const checkResponse = await addressesAPI.checkDeliveryZone(
      geocodeData.lat,
      geocodeData.lng,
      locationStore.selectedCity.id
    );
    
    if (checkResponse.data.available) {
      inDeliveryZone.value = true;
      addressValidated.value = true;
      locationStore.setDeliveryAddress(deliveryAddress.value);
      locationStore.setDeliveryCoords({ lat: geocodeData.lat, lng: geocodeData.lng });
      if (checkResponse.data.polygon) {
        deliveryCost.value = parseFloat(checkResponse.data.polygon.delivery_cost || 0);
      }
    } else {
      inDeliveryZone.value = false;
      addressValidated.value = true;
    }
  } catch (error) {
    console.error("Address validation error:", error);
    hapticFeedback("error");
  }
}

function resetAddress() {
  deliveryAddress.value = "";
  addressValidated.value = false;
  inDeliveryZone.value = false;
  showAddressSuggestions.value = false;
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
}

async function submitOrder() {
  if (!canSubmitOrder.value || submitting.value) return;
  
  submitting.value = true;
  hapticFeedback("medium");
  
  try {
    const orderData = {
      city_id: locationStore.selectedCity.id,
      order_type: orderType.value,
      items: cartStore.items.map((item) => ({
        item_id: item.id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        modifiers: item.modifiers?.map((m) => m.id) || [],
      })),
      payment_method: paymentMethod.value,
      comment: orderComment.value,
    };

    if (orderType.value === "delivery") {
      orderData.delivery_street = deliveryAddress.value;
      orderData.delivery_house = ""; // Извлекается из адреса
      orderData.delivery_entrance = deliveryDetails.value.entrance;
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
    router.push(`/order/${response.data.order.id}`);
  } catch (error) {
    console.error("Failed to create order:", error);
    hapticFeedback("error");
    alert(error.response?.data?.error || "Ошибка при оформлении заказа");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.checkout {
  min-height: 100vh;
  background: var(--color-background-secondary);
  padding-bottom: 100px;
}

.content {
  padding: 16px;
}

.order-type-tabs {
  display: flex;
  gap: 10px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 6px;
}

.order-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.order-tab.active {
  background: var(--color-text-primary);
  color: var(--color-background);
}

.order-tab:not(.active):hover {
  background: var(--color-background-secondary);
}

.section-title {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
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

.input,
.textarea {
  width: 100%;
  padding: 12px 16px;
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
  border: 2px solid var(--color-border);
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
  border: 2px solid var(--color-border);
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
  margin-top: 24px;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.summary-row.total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-h2);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-bottom: 0;
}

.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  z-index: 100;
}

.submit-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
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
