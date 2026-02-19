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
          <div class="sidebar-footer">
            <button class="sidebar-version-link" @click="openChangelogPopup">v{{ latestRelease?.version || "—" }}</button>
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
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showChangelogPopup" class="changelog-overlay" @click="closeChangelogPopup">
        <div class="changelog-popup" @click.stop>
          <div class="popup-header">
            <div class="popup-title">Что нового</div>
            <button class="close-btn" aria-label="Закрыть changelog" @click="closeChangelogPopup">
              <X :size="18" />
            </button>
          </div>
          <div v-if="changelogLoading" class="changelog-skeleton">
            <div class="skeleton changelog-skeleton-line"></div>
            <div class="skeleton changelog-skeleton-line"></div>
            <div class="skeleton changelog-skeleton-line"></div>
          </div>
          <div v-else-if="changelogReleases.length" class="changelog-list">
            <div v-for="release in changelogReleases" :key="release.id" class="changelog-item">
              <button class="changelog-item-header" @click="toggleRelease(release)">
                <div class="changelog-item-main">
                  <div class="changelog-item-version">v{{ release.version }}</div>
                  <div class="changelog-item-title">{{ release.title }}</div>
                  <div class="changelog-item-date">{{ formatReleaseDate(release.published_at) }}</div>
                </div>
                <ChevronDown :size="16" :class="{ 'changelog-chevron-open': expandedReleaseId === release.id }" />
              </button>
              <div v-if="expandedReleaseId === release.id" class="changelog-item-details">
                <div v-if="releaseDetailsLoadingId === release.id" class="changelog-skeleton">
                  <div class="skeleton changelog-skeleton-line"></div>
                  <div class="skeleton changelog-skeleton-line"></div>
                </div>
                <template v-else>
                  <div v-if="releaseDetailsMap[release.id]?.description" class="changelog-item-description">
                    {{ releaseDetailsMap[release.id].description }}
                  </div>
                  <div v-if="getClientItems(releaseDetailsMap[release.id]?.items)?.length" class="changelog-points">
                    <div v-for="item in getClientItems(releaseDetailsMap[release.id].items)" :key="item.id" class="changelog-point">
                      <span class="changelog-point-type">{{ getItemTypeLabel(item.item_type) }}</span>
                      <span>{{ item.title }}</span>
                    </div>
                  </div>
                  <div v-else class="changelog-empty">Пункты релиза не заполнены</div>
                </template>
              </div>
            </div>
          </div>
          <div v-else class="changelog-empty">Опубликованных релизов пока нет</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { Menu, MapPin, X, Home, Package, Gift, User, Phone, ChevronDown } from "lucide-vue-next";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { bonusesAPI, changelogAPI, citiesAPI } from "@/shared/api/endpoints.js";
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
const showChangelogPopup = ref(false);
const changelogLoading = ref(false);
const latestRelease = ref(null);
const changelogReleases = ref([]);
const expandedReleaseId = ref(null);
const releaseDetailsLoadingId = ref(null);
const releaseDetailsMap = ref({});
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
function formatReleaseDate(value) {
  if (!value) return "Без даты";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(value));
}
function getItemTypeLabel(itemType) {
  if (itemType === "fix") return "Исправление";
  if (itemType === "breaking") return "Важно";
  if (itemType === "internal") return "Сервисное";
  return "Новое";
}

function getClientItems(items) {
  if (!items || !Array.isArray(items)) return [];
  return items.filter((item) => item.module === "telegram-miniapp");
}

async function loadLatestRelease() {
  try {
    const response = await changelogAPI.getLatest();
    latestRelease.value = response.data?.release || null;
  } catch (error) {
    latestRelease.value = null;
    console.error("Не удалось загрузить текущую версию:", error);
  }
}
async function openChangelogPopup() {
  hapticFeedback("light");
  showChangelogPopup.value = true;
  if (changelogReleases.value.length > 0 || changelogLoading.value) return;
  changelogLoading.value = true;
  try {
    const response = await changelogAPI.getPublished({ page: 1, limit: 20 });
    changelogReleases.value = response.data?.items || [];
  } catch (error) {
    changelogReleases.value = [];
    console.error("Не удалось загрузить changelog:", error);
  } finally {
    changelogLoading.value = false;
  }
}
function closeChangelogPopup() {
  showChangelogPopup.value = false;
  expandedReleaseId.value = null;
}
async function toggleRelease(release) {
  if (expandedReleaseId.value === release.id) {
    expandedReleaseId.value = null;
    return;
  }
  expandedReleaseId.value = release.id;
  if (releaseDetailsMap.value[release.id] || releaseDetailsLoadingId.value === release.id) {
    return;
  }
  releaseDetailsLoadingId.value = release.id;
  try {
    const response = await changelogAPI.getReleaseById(release.id);
    releaseDetailsMap.value = {
      ...releaseDetailsMap.value,
      [release.id]: response.data?.release || null,
    };
  } catch (error) {
    console.error("Не удалось загрузить детали релиза:", error);
    releaseDetailsMap.value = {
      ...releaseDetailsMap.value,
      [release.id]: null,
    };
  } finally {
    releaseDetailsLoadingId.value = null;
  }
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
  loadLatestRelease();
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
.sidebar-footer {
  padding: 8px 12px 12px;
  border-top: 1px solid var(--color-border);
  text-align: right;
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
.sidebar-version-link {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-small);
  cursor: pointer;
  padding: 0;
  text-align: right;
}
.sidebar-version-link:hover {
  color: var(--color-text-primary);
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
.changelog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
  padding: 16px;
}
.changelog-popup {
  width: 100%;
  max-width: 560px;
  max-height: 84vh;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  padding: 16px;
  box-shadow: var(--shadow-md);
  overflow-y: auto;
}
.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.changelog-item {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
}
.changelog-item-header {
  width: 100%;
  border: none;
  background: transparent;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}
.changelog-item-main {
  text-align: left;
}
.changelog-item-version {
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-semibold);
}
.changelog-item-title {
  margin-top: 2px;
  color: var(--color-text-primary);
}
.changelog-item-date {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-small);
}
.changelog-chevron-open {
  transform: rotate(180deg);
}
.changelog-item-details {
  padding: 0 12px 12px;
}
.changelog-item-description {
  margin-bottom: 8px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-small);
}
.changelog-points {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.changelog-point {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-small);
}
.changelog-point-type {
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
}
.changelog-empty {
  color: var(--color-text-secondary);
  font-size: var(--font-size-small);
}
.changelog-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.changelog-skeleton-line {
  height: 12px;
  width: 100%;
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
