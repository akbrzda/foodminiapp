<template>
  <div class="home">
    <AppHeader @toggleMenu="showMenu = true" />

    <div class="location-bar">
      <div class="location-tabs">
        <button @click="setDeliveryType('delivery')" class="pill-tab" :class="{ active: locationStore.isDelivery }">Доставка</button>
        <button @click="setDeliveryType('pickup')" class="pill-tab" :class="{ active: locationStore.isPickup }">Самовывоз</button>
      </div>

      <div class="location-actions">
        <button @click="openDeliverySelector" class="action-pill">
          <span class="action-text">{{ actionButtonText }}</span>
        </button>
      </div>
    </div>

    <div class="quick-order" v-if="lastOrder">
      <h3>Последний заказ</h3>
      <div class="order-card" @click="repeatOrder">
        <div class="order-info">
          <div class="order-number">#{{ lastOrder.order_number }}</div>
          <div class="order-items">{{ lastOrder.items_count }} позиций</div>
        </div>
        <button class="repeat-btn">Повторить</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useLocationStore } from "../stores/location";
import { useCartStore } from "../stores/cart";
import { bonusesAPI, ordersAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import AppHeader from "../components/AppHeader.vue";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const locationStore = useLocationStore();
const cartStore = useCartStore();

const bonusBalance = ref(0);
const lastOrder = ref(null);
const showMenu = ref(false);

const cityName = computed(() => locationStore.selectedCity?.name || "Когалым");
const actionButtonText = computed(() => {
  if (locationStore.isDelivery) {
    return locationStore.deliveryAddress ? truncateText(locationStore.deliveryAddress, 24) : "Укажите адрес";
  }

  if (locationStore.isPickup) {
    return locationStore.selectedBranch ? truncateText(locationStore.selectedBranch.name, 22) : "Выбрать филиал";
  }

  return "Укажите адрес";
});

onMounted(async () => {
  await loadBonusBalance();
  await loadLastOrder();

  // Попытка определить местоположение
  try {
    await locationStore.detectUserLocation();
  } catch (error) {
    console.log("Location detection failed:", error);
  }

  if (route.query.openCity === "1") {
    window.dispatchEvent(new CustomEvent("open-city-popup"));
    router.replace({ query: {} });
  }
});

async function loadBonusBalance() {
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = response.data.balance;
  } catch (error) {
    console.error("Failed to load bonus balance:", error);
  }
}

async function loadLastOrder() {
  try {
    const response = await ordersAPI.getMyOrders();
    if (response.data.orders?.length > 0) {
      lastOrder.value = response.data.orders[0];
    }
  } catch (error) {
    console.error("Failed to load last order:", error);
  }
}

async function repeatOrder() {
  try {
    hapticFeedback("light");
    const response = await ordersAPI.repeatOrder(lastOrder.value.id);

    // Добавляем позиции в корзину
    response.data.items.forEach((item) => {
      cartStore.addItem(item);
    });

    hapticFeedback("success");
    router.push("/cart");
  } catch (error) {
    hapticFeedback("error");
    console.error("Failed to repeat order:", error);
  }
}

function openCitySelector() {
  window.dispatchEvent(new CustomEvent("open-city-popup"));
}

function openDeliverySelector() {
  if (!locationStore.selectedCity) {
    window.dispatchEvent(new CustomEvent("open-city-popup"));
    return;
  }
  if (locationStore.isPickup) {
    router.push("/pickup-map");
    return;
  }
  router.push("/delivery-map");
}

function setDeliveryType(type) {
  locationStore.setDeliveryType(type);
}

function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
</script>
<style>
.home {
  min-height: 100vh;
  padding-bottom: 70px;
  background: #f5f5f5;
}

.location-bar {
  background: white;
  border-bottom: 1px solid #e6e9ef;
  padding: 10px 16px 14px;
}

.location-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.pill-tab {
  width: 100%;
  padding: 8px 18px;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #ffffff;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}

.pill-tab.active {
  background: #3b3f46;
  border-color: #3b3f46;
  color: white;
  box-shadow: none;
}

.pill-tab:hover:not(.active) {
  background: #f3f4f6;
}

.location-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.city-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 18px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  cursor: pointer;
  transition: all 0.2s;
}

.city-pill:hover {
  background: #f5f6f8;
}

.city-text {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-pill {
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: #f7d000;
  color: #1f2937;
  border-radius: 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.08);
}

.action-text {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.action-pill:hover {
  transform: translateY(-1px);
}

.action-pill:active {
  transform: translateY(0);
  box-shadow: none;
}

.banner {
  padding: 32px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
}

.banner h1 {
  font-size: 24px;
  margin-bottom: 8px;
}

.banner p {
  font-size: 14px;
  opacity: 0.9;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}

.action-btn {
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.action-btn.primary {
  background: #667eea;
  color: white;
}

.quick-order {
  padding: 16px;
}

.quick-order h3 {
  margin-bottom: 12px;
  font-size: 18px;
}

.order-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.order-number {
  font-weight: 600;
  font-size: 16px;
}

.order-items {
  font-size: 14px;
  color: #666;
  margin-top: 4px;
}

.repeat-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #667eea;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: white;
  border-top: 1px solid #e0e0e0;
  padding: 8px;
}

.nav-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  position: relative;
}

.nav-btn.active {
  color: #667eea;
  font-weight: 600;
}

.badge {
  position: absolute;
  top: 4px;
  right: 8px;
  background: #f44336;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
}
</style>
