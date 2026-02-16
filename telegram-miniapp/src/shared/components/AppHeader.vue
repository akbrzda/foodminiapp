<template>
  <header class="app-header">
    <button class="menu-button" aria-label="Открыть меню" @click="toggleSidebar">
      <Menu :size="20" />
    </button>
    <button class="city-button" @click="openCityPopup">
      <MapPin :size="16" />
      <span class="city-name">{{ currentCityName }}</span>
    </button>
    <button v-if="authStore.isAuthenticated && bonusesEnabled" class="bonus-button" aria-label="Открыть бонусы" @click="openBonusHistory">
      <Gift :size="16" />
      <span class="bonus-value">{{ bonusBalance }}</span>
    </button>
  </header>
  <Teleport to="body">
    <Transition name="sidebar">
      <div v-if="showSidebar" class="sidebar-overlay" @click="closeSidebar">
        <div class="sidebar" @click.stop>
          <div class="sidebar-header">
            <div class="sidebar-title">Меню</div>
            <!-- <button class="close-btn" aria-label="Закрыть меню" @click="closeSidebar">
              <X :size="18" />
            </button> -->
          </div>
          <div class="sidebar-content">
            <nav class="sidebar-nav">
              <button class="sidebar-item" @click="navigateTo('/')">
                <Home :size="20" />
                <span>Главная</span>
              </button>
              <button class="sidebar-item" @click="navigateTo('/orders')">
                <Package :size="20" />
                <span>Мои заказы</span>
              </button>
              <button v-if="bonusesEnabled" class="sidebar-item" @click="navigateTo('/bonus-history')">
                <Gift :size="20" />
                <span>Бонусы</span>
              </button>
              <button class="sidebar-item" @click="navigateTo('/profile')">
                <User :size="20" />
                <span>Профиль</span>
              </button>
              <button class="sidebar-item" @click="navigateTo('/contacts')">
                <Phone :size="20" />
                <span>Контакты</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showCityPopup" class="city-overlay" @click="closeCityPopup">
        <div class="city-popup" @click.stop>
          <div class="popup-header">
            <div class="popup-title">Выберите город</div>
            <button class="close-btn" aria-label="Закрыть выбор города" @click="closeCityPopup">
              <X :size="18" />
            </button>
          </div>
          <input v-model="cityQuery" class="city-search mini-field" placeholder="Город" />
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
import { Menu, MapPin, X, Home, Package, Gift, User, Phone } from "lucide-vue-next";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { citiesAPI, bonusesAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
const router = useRouter();
const locationStore = useLocationStore();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const emit = defineEmits(["toggleMenu"]);
const showSidebar = ref(false);
const showCityPopup = ref(false);
const cityQuery = ref("");
const cities = ref([]);
const bonusBalance = ref(0);
let removeAfterEachHook = null;
const currentCityName = computed(() => locationStore.selectedCity?.name || "Город");
const bonusesEnabled = computed(() => settingsStore.bonusesEnabled);
const filteredCities = computed(() => {
  if (!cityQuery.value) return cities.value;
  const query = cityQuery.value.toLowerCase();
  return cities.value.filter((city) => city.name.toLowerCase().includes(query));
});
function toggleSidebar() {
  hapticFeedback("light");
  showSidebar.value = !showSidebar.value;
}
function closeSidebar() {
  showSidebar.value = false;
}
function navigateTo(path) {
  hapticFeedback("light");
  closeSidebar();
  router.push(path);
}
function openBonusHistory() {
  hapticFeedback("light");
  router.push("/bonus-history");
}
async function loadBonusBalance() {
  if (!authStore.isAuthenticated || !settingsStore.bonusesEnabled) {
    bonusBalance.value = 0;
    return;
  }
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = response.data.balance || 0;
  } catch (error) {
    console.error("Не удалось загрузить бонусный баланс:", error);
  }
}
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
    console.error("Не удалось загрузить города:", error);
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
    console.error("Не удалось загрузить филиалы:", error);
  }
}
function handleOpenCityPopup() {
  openCityPopup();
}
onMounted(() => {
  window.addEventListener("open-city-popup", handleOpenCityPopup);
  loadBonusBalance();
  removeAfterEachHook = router.afterEach(() => {
    loadBonusBalance();
  });
});
onBeforeUnmount(() => {
  window.removeEventListener("open-city-popup", handleOpenCityPopup);
  if (removeAfterEachHook) {
    removeAfterEachHook();
    removeAfterEachHook = null;
  }
});
</script>
<style scoped>
.app-header {
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--color-background);
}
.menu-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.menu-button:hover {
  background: var(--color-border);
}
.menu-button:active {
  transform: scale(0.95);
}
.city-button {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.city-button:hover {
  background: var(--color-border);
}
.city-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bonus-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: none;
  border-radius: var(--border-radius-md);
  background: rgba(252, 219, 4, 0.5);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition:
    transform 0.15s,
    opacity var(--transition-duration);
}
.bonus-button:active {
  transform: scale(0.95);
}
.bonus-icon {
  font-size: 18px;
  line-height: 1;
}
.bonus-value {
  font-size: var(--font-size-caption);
}
/* Сайдбар */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  background: var(--color-background);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}
.sidebar-title {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.sidebar-item:hover {
  background: var(--color-background-secondary);
}
.sidebar-enter-active {
  transition: transform 0.3s ease-out;
}
.sidebar-leave-active {
  transition: transform 0.3s ease-in;
}
.sidebar-enter-from,
.sidebar-leave-to {
  transform: translateX(-100%);
}
.sidebar-overlay.sidebar-enter-active,
.sidebar-overlay.sidebar-leave-active {
  transition: opacity 0.3s;
}
.sidebar-overlay.sidebar-enter-from,
.sidebar-overlay.sidebar-leave-to {
  opacity: 0;
}
/* Попап города */
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
  margin-bottom: 12px;
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
