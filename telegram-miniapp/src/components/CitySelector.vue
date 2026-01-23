<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click="closeDialog">
        <div class="dialog-content" @click.stop>
          <div class="header">
            <div class="current-city">
              {{ selectedCityName }}
              <ChevronDown :size="16" class="chevron" />
            </div>
            <button @click="closeDialog" class="close-btn">
              <X :size="16" />
            </button>
          </div>
          <div class="search-section">
            <input v-model="searchQuery" placeholder="Поиск города..." class="search-input" />
          </div>
          <div class="cities-list">
            <div v-if="loading" class="loading-state">
              <div class="spinner"></div>
              <span>Загрузка...</span>
            </div>
            <div v-else-if="filteredCities.length === 0" class="empty-state">
              <p>Города не найдены</p>
            </div>
            <button
              v-else
              v-for="city in filteredCities"
              :key="city.id"
              @click="selectCity(city)"
              class="city-item"
              :class="{ active: city.id === locationStore.selectedCity?.id }"
            >
              <span class="city-name">{{ city.name }}</span>
              <span v-if="city.distance" class="distance">{{ formatDistance(city.distance) }}</span>
              <Check v-if="city.id === locationStore.selectedCity?.id" :size="18" class="checkmark" />
              <span class="branches-count">{{ city.branches_count || 0 }}</span>
            </button>
          </div>
          <button v-if="recommendedCity && !hasSelectedCity" @click="selectCity(recommendedCity)" class="select-btn">
            Выбрать {{ recommendedCity.name }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { ChevronDown, X, Check } from "lucide-vue-next";
import { useLocationStore } from "../stores/location";
import { citiesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
const props = defineProps({
  open: Boolean,
});
const emit = defineEmits(["update:open", "citySelected"]);
const locationStore = useLocationStore();
const isOpen = ref(props.open);
const cities = ref([]);
const loading = ref(false);
const searchQuery = ref("");
const userLocation = ref(null);
const recommendedCity = ref(null);
const hasRequestedLocation = ref(false);
watch(
  () => props.open,
  (value) => {
    isOpen.value = value;
    if (value) {
      loadCities();
      if (!hasRequestedLocation.value && !locationStore.selectedCity) {
        hasRequestedLocation.value = true;
        getUserLocation();
      }
    }
  },
);
watch(isOpen, (value) => {
  emit("update:open", value);
});
const selectedCityName = computed(() => {
  return locationStore.selectedCity?.name || "Когалым";
});
const hasSelectedCity = computed(() => {
  return !!locationStore.selectedCity;
});
const filteredCities = computed(() => {
  if (!searchQuery.value) return cities.value;
  const query = searchQuery.value.toLowerCase();
  return cities.value.filter((city) => city.name.toLowerCase().includes(query));
});
onMounted(() => {
  loadCities();
});
async function loadCities() {
  try {
    loading.value = true;
    const response = await citiesAPI.getCities();
    cities.value = response.data.cities || [];
    if (userLocation.value) {
      calculateDistances();
    }
  } catch (error) {
    console.error("Failed to load cities:", error);
  } finally {
    loading.value = false;
  }
}
async function getUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation.value = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        calculateDistances();
      },
      (error) => {
        console.log("Geolocation error:", error);
      },
    );
  }
}
function calculateDistances() {
  if (!userLocation.value || cities.value.length === 0) return;
  cities.value = cities.value.map((city) => {
    const distance = calculateDistance(userLocation.value.lat, userLocation.value.lon, city.latitude, city.longitude);
    return { ...city, distance };
  });
  cities.value.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
  if (cities.value.length > 0 && cities.value[0].distance < 100) {
    recommendedCity.value = cities.value[0];
  }
}
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat2 || !lon2) return null;
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
function formatDistance(distance) {
  if (!distance) return "";
  if (distance < 1) return `${Math.round(distance * 1000)} м`;
  return `${distance.toFixed(1)} км`;
}
async function selectCity(city) {
  try {
    hapticFeedback("light");
    locationStore.setCity(city);
    const response = await citiesAPI.getBranches(city.id);
    locationStore.setBranches(response.data.branches || []);
    closeDialog();
    emit("citySelected", city);
  } catch (error) {
    hapticFeedback("error");
    console.error("Failed to select city:", error);
  }
}
function closeDialog() {
  isOpen.value = false;
}
</script>
<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}
.dialog-content {
  background: var(--color-background);
  border-radius: var(--border-radius-xl) var(--border-radius-xl) 0 0;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.3s ease;
}
.dialog-enter-active .dialog-content,
.dialog-leave-active .dialog-content {
  transition: transform 0.3s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .dialog-content,
.dialog-leave-to .dialog-content {
  transform: translateY(100%);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  position: relative;
}
.header::before {
  content: "";
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
}
.current-city {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
}
.chevron {
  transition: transform var(--transition-duration) var(--transition-easing);
}
.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--color-background-secondary);
  font-size: 20px;
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.close-btn:hover {
  background: var(--color-border);
}
.search-section {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}
.search-input {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  outline: none;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.search-input:focus {
  background: var(--color-background);
  border: 1px solid var(--color-primary);
}
.search-input::placeholder {
  color: var(--color-text-muted);
}
.cities-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.city-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border: none;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform var(--transition-duration) var(--transition-easing);
  box-shadow: var(--shadow-sm);
}
.city-item:hover {
  background: var(--color-background-secondary);
}
.city-item:active {
  transform: scale(0.98);
}
.city-item.active {
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
}
.city-name {
  flex: 1;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
}
.distance {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-right: 8px;
}
.checkmark {
  color: var(--color-text-primary);
  margin-right: 8px;
  flex-shrink: 0;
}
.branches-count {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  background: var(--color-background-secondary);
  padding: 2px 8px;
  border-radius: 10px;
}
.select-btn {
  margin: 16px;
  padding: 14px;
  background: var(--color-primary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform var(--transition-duration) var(--transition-easing);
}
.select-btn:hover {
  background: var(--color-primary-hover);
}
.select-btn:active {
  transform: scale(0.98);
}
</style>
