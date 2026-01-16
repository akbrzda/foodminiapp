<template>
  <header class="app-header">
    <button class="city-button" @click="openCityPopup">
      <MapPin :size="16" />
      <span class="city-name">{{ currentCityName }}</span>
    </button>

    <div class="header-right"></div>
  </header>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showCityPopup" class="city-overlay" @click="closeCityPopup">
        <div class="city-popup" @click.stop>
          <div class="popup-header">
            <div class="popup-title">Выберите город</div>
            <button class="close-btn" @click="closeCityPopup">
              <X :size="18" />
            </button>
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
import { Menu, MapPin, X } from "lucide-vue-next";
import { useLocationStore } from "../stores/location";
import { citiesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
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
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  padding-top: calc(12px + var(--tg-content-safe-area-inset-top, 0px));
  background: var(--color-background);
  min-height: calc(44px + var(--tg-content-safe-area-inset-top, 0px));
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
  color: var(--color-text-primary);
  transition: background-color var(--transition-duration) var(--transition-easing);
  border-radius: var(--border-radius-sm);
}

.menu-button:hover {
  background: var(--color-background-secondary);
}

.menu-button:active {
  transform: scale(0.95);
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
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.city-button:hover {
  background: var(--color-background-secondary);
}

.city-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  padding: 16px;
  box-shadow: var(--shadow-md);
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.popup-title {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--color-background-secondary);
  cursor: pointer;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.close-btn:hover {
  background: var(--color-border);
}

.city-search {
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  margin-bottom: 12px;
  font-size: var(--font-size-body);
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: border-color var(--transition-duration) var(--transition-easing);
}

.city-search:focus {
  outline: none;
  border-color: var(--color-primary);
}

.city-search::placeholder {
  color: var(--color-text-muted);
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
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-md);
  padding: 12px 16px;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.city-item:hover {
  background: var(--color-border);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-duration) var(--transition-easing);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
