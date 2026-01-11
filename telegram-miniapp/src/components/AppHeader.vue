<template>
  <header class="app-header">
    <div class="header-left">
      <button @click="toggleMenu" class="menu-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3 6H21M3 12H21M3 18H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <button class="city-button" @click="openCityPopup">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 8C9.10457 8 10 7.10457 10 6C10 4.89543 9.10457 4 8 4C6.89543 4 6 4.89543 6 6C6 7.10457 6.89543 8 8 8Z" fill="currentColor" />
        <path
          d="M8 1C5.23858 1 3 3.23858 3 6C3 9.75 8 15 8 15C8 15 13 9.75 13 6C13 3.23858 10.7614 1 8 1Z"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
      <span class="city-name">{{ currentCityName }}</span>
    </button>

    <div class="header-right">
      <button @click="openCart" class="cart-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 2L7 6H3L6 9L4 14L9 11L12 14L15 11L20 14L18 9L21 6H17L15 2L12 5L9 2Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <text x="12" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">К</text>
        </svg>
        <span v-if="cartStore.itemsCount" class="cart-badge">{{ cartStore.itemsCount }}</span>
      </button>
    </div>
  </header>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showCityPopup" class="city-overlay" @click="closeCityPopup">
        <div class="city-popup" @click.stop>
          <div class="popup-header">
            <div class="popup-title">Выберите город</div>
            <button class="close-btn" @click="closeCityPopup">×</button>
          </div>
          <input v-model="cityQuery" class="city-search" placeholder="Город" />
          <div class="city-list">
            <button v-for="city in filteredCities" :key="city.id" class="city-item" @click="selectCity(city)">
              {{ city.name }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useCartStore } from "../stores/cart";
import { useLocationStore } from "../stores/location";
import { citiesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const cartStore = useCartStore();
const locationStore = useLocationStore();

const emit = defineEmits(["toggleMenu"]);

const showCityPopup = ref(false);
const cityQuery = ref("");
const cities = ref([]);

const currentCityName = computed(() => locationStore.selectedCity?.name || "Город");
const filteredCities = computed(() => {
  if (!cityQuery.value) return cities.value;
  const query = cityQuery.value.toLowerCase();
  return cities.value.filter((city) => city.name.toLowerCase().includes(query));
});

function toggleMenu() {
  emit("toggleMenu");
}

function openCart() {
  router.push("/cart");
}

async function openCityPopup() {
  hapticFeedback("light");
  showCityPopup.value = true;
  if (cities.value.length) return;
  try {
    const response = await citiesAPI.getCities();
    cities.value = response.data.cities || [];
  } catch (error) {
    console.error("Failed to load cities:", error);
  }
}

function closeCityPopup() {
  showCityPopup.value = false;
  cityQuery.value = "";
}

async function selectCity(city) {
  hapticFeedback("light");
  closeCityPopup();
  locationStore.setCity(city);
  try {
    const response = await citiesAPI.getBranches(city.id);
    locationStore.setBranches(response.data.branches || []);
  } catch (error) {
    console.error("Failed to load branches:", error);
  }
}

function handleOpenCityPopup() {
  openCityPopup();
}

onMounted(() => {
  window.addEventListener("open-city-popup", handleOpenCityPopup);
});

onBeforeUnmount(() => {
  window.removeEventListener("open-city-popup", handleOpenCityPopup);
});
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-button {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #111827;
  transition: background-color 0.2s;
  border-radius: 8px;
}

.menu-button:hover {
  background: #f3f4f6;
}

.menu-button:active {
  transform: scale(0.95);
}

.logo {
  cursor: pointer;
}

.logo-bg {
  background: #fbbf24;
  border-radius: 8px;
  padding: 6px 12px;
  position: relative;
}

.logo-text {
  font-size: 12px;
  line-height: 1.2;
  font-weight: 700;
  color: #000;
  text-transform: lowercase;
  display: block;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.city-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #ffffff;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  cursor: pointer;
}

.city-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-button {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: #111827;
  transition: background-color 0.2s;
  border-radius: 8px;
}

.cart-button:hover {
  background: #f3f4f6;
}

.cart-button:active {
  transform: scale(0.95);
}

.cart-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 600;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.city-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.city-popup {
  width: 100%;
  max-width: 360px;
  background: #ffffff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.popup-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  font-size: 18px;
  cursor: pointer;
}

.city-search {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  margin-bottom: 12px;
  font-size: 14px;
}

.city-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.city-item {
  text-align: left;
  border: none;
  background: #f7f4f2;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  cursor: pointer;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
