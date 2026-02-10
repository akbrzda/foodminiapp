<template>
  <div class="pickup-map">
    <PageHeader title="Самовывоз" />
    <div ref="mapContainerRef" class="map"></div>
    <div class="search-bar">
      <input v-model="searchQuery" class="search-input" placeholder="Найти пиццерию" />
    </div>
    <div v-if="filteredBranches.length" class="branch-list">
      <button v-for="branch in filteredBranches" :key="branch.id" class="branch-card" @click="selectBranch(branch)">
        <div class="branch-title">{{ branch.displayName || branch.name }}</div>
        <div class="branch-address">{{ branch.displayAddress || branch.address }}</div>
        <div class="branch-status" :class="branch.isOpen ? 'open' : 'closed'">
          {{ branch.isOpen ? "Открыто" : "Закрыто" }}
        </div>
      </button>
    </div>
    <div v-if="selectedBranch" class="branch-sheet">
      <button class="sheet-close" aria-label="Закрыть карточку филиала" @click="selectedBranch = null">
        <X :size="16" />
      </button>
      <div class="sheet-title">{{ selectedBranch.displayName || selectedBranch.name }}</div>
      <div class="sheet-address">{{ selectedBranch.displayAddress || selectedBranch.address }}</div>
      <a v-if="selectedBranch.phone" class="sheet-phone" :href="`tel:${normalizePhone(selectedBranch.phone)}`">
        {{ formatPhone(selectedBranch.phone) }}
      </a>
      <div class="sheet-status" :class="selectedBranch.isOpen ? 'open' : 'closed'">
        {{ selectedBranch.isOpen ? "Открыто" : "Закрыто" }}
      </div>
      <div class="sheet-hours">
        <template v-if="getWorkHoursLines(selectedBranch).length">
          <div v-for="(line, index) in getWorkHoursLines(selectedBranch)" :key="index">{{ line }}</div>
        </template>
        <template v-else>Время работы уточняйте</template>
      </div>
      <button class="primary-btn" @click="confirmPickup">Заберу отсюда</button>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { X, MapPin } from "lucide-vue-next";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { formatPhone, normalizePhone } from "@/shared/utils/phone.js";
import { citiesAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { formatWorkHoursLines, getBranchOpenState, normalizeWorkHours } from "@/shared/utils/workingHours";
import { devError } from "@/shared/utils/logger.js";
const router = useRouter();
const locationStore = useLocationStore();
const mapContainerRef = ref(null);
const searchQuery = ref("");
const branches = ref([]);
const selectedBranch = ref(locationStore.selectedBranch || null);
let leafletLoading = null;
let mapInstance = null;
let markers = [];
const filteredBranches = computed(() => {
  if (!searchQuery.value) return branches.value;
  const query = searchQuery.value.toLowerCase();
  return branches.value.filter((branch) =>
    `${branch.displayName || branch.name} ${branch.displayAddress || branch.address}`.toLowerCase().includes(query),
  );
});
onMounted(async () => {
  locationStore.setDeliveryType("pickup");
  if (!locationStore.selectedCity) {
    router.push("/?openCity=1");
    return;
  }
  await loadBranches();
  await initMap();
});
function goBack() {
  router.back();
}
async function loadBranches() {
  try {
    const response = await citiesAPI.getBranches(locationStore.selectedCity.id);
    const data = response.data.branches || [];
    branches.value = data.map((branch) => buildDisplayBranch(branch));
    locationStore.setBranches(branches.value);
    if (locationStore.selectedBranch) {
      const matched = branches.value.find((branch) => branch.id === locationStore.selectedBranch.id);
      if (matched) {
        selectedBranch.value = matched;
        locationStore.setBranch(matched);
      }
    }
  } catch (error) {
    devError("Не удалось загрузить филиалы:", error);
  }
}
async function initMap() {
  if (!mapContainerRef.value || mapInstance) return;
  const L = await loadLeaflet();
  if (!L) return;
  const center = getCityCenter();
  mapInstance = L.map(mapContainerRef.value, { zoomControl: false, attributionControl: false }).setView(center, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstance);
  setMarkers(L);
}
function setMarkers(L) {
  markers.forEach((marker) => marker.remove());
  markers = [];
  branches.value.forEach((branch) => {
    const { lat, lon } = normalizeCoords(branch.latitude, branch.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const marker = L.marker([lat, lon]).addTo(mapInstance);
    marker.on("click", () => selectBranch(branch));
    markers.push(marker);
  });
}
function selectBranch(branch) {
  hapticFeedback("light");
  selectedBranch.value = branch;
  locationStore.setBranch(branch);
}
function confirmPickup() {
  if (!selectedBranch.value) {
    hapticFeedback("error");
    return;
  }
  hapticFeedback("success");
  router.push("/");
}
function getCityCenter() {
  const { lat, lon } = normalizeCoords(locationStore.selectedCity?.latitude, locationStore.selectedCity?.longitude);
  return [Number.isFinite(lat) ? lat : 55.7522, Number.isFinite(lon) ? lon : 37.6156];
}
function buildDisplayBranch(branch) {
  const displayAddress = normalizeAddress(branch.address);
  let displayName = branch.name || "Пиццерия";
  if (isAddressLike(displayName) || normalizeAddress(displayName) === displayAddress) {
    displayName = "Панда Пицца";
  }
  const timeZone = locationStore.selectedCity?.timezone || "Europe/Moscow";
  const openState = getBranchOpenState(branch.working_hours || branch.work_hours, timeZone);
  return {
    ...branch,
    isOpen: openState.isOpen,
    displayName,
    displayAddress: displayAddress || branch.address || "",
    work_hours: normalizeWorkHours(branch.work_hours || branch.working_hours),
  };
}
function getWorkHoursLines(branch) {
  return formatWorkHoursLines(branch.work_hours || branch.working_hours);
}
function normalizeAddress(value) {
  if (!value) return "";
  let normalized = String(value).replace(/\s+/g, " ").trim();
  const city = locationStore.selectedCity?.name;
  if (city) {
    const cityRegex = new RegExp(`,?\\s*${escapeRegExp(city)}$`, "i");
    normalized = normalized.replace(cityRegex, "");
  }
  return normalized.trim();
}
function isAddressLike(value) {
  if (!value) return false;
  return /(ул\\.|улица|пр\\.|проспект|пер\\.|переулок|шоссе|дом|\\d)/i.test(value);
}
function parseCoord(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  const normalized = String(value).trim().replace(",", ".");
  return Number.parseFloat(normalized);
}
function normalizeCoords(latValue, lonValue) {
  const lat = parseCoord(latValue);
  const lon = parseCoord(lonValue);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const latInRange = Math.abs(lat) <= 90;
    const lonInRange = Math.abs(lon) <= 180;
    const swappedLatInRange = Math.abs(lon) <= 90;
    const swappedLonInRange = Math.abs(lat) <= 180;
    if (!latInRange && swappedLatInRange && swappedLonInRange) {
      return { lat: lon, lon: lat };
    }
  }
  return { lat, lon };
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}
async function loadLeaflet() {
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve) => {
    if (window.L) {
      resolve(window.L);
      return;
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.integrity = "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H";
    css.crossOrigin = "anonymous";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
  return leafletLoading;
}
</script>
<style scoped>
.pickup-map {
  position: relative;
  min-height: 100vh;
  background: var(--color-background);
  isolation: isolate;
}
.map {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
}
.search-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(92px + var(--tg-content-safe-area-inset-bottom, 0px));
  z-index: 20;
}
.search-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--border-radius-md);
  border: none;
  background: var(--color-background);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-duration) var(--transition-easing);
}
.search-input:focus {
  outline: none;
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
}
.search-input::placeholder {
  color: var(--color-text-muted);
}
.branch-list {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(150px + var(--tg-content-safe-area-inset-bottom, 0px));
  z-index: 20;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.branch-card {
  background: var(--color-background);
  border-radius: var(--border-radius-lg);
  padding: 12px 14px;
  border: none;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  color: var(--color-text-primary);
  transition: box-shadow var(--transition-duration) var(--transition-easing);
}
.branch-card:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
}
.branch-title {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.branch-address {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  margin: 4px 0;
}
.branch-status {
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-semibold);
}
.branch-status.open {
  color: var(--color-success);
}
.branch-status.closed {
  color: var(--color-error);
}
.branch-sheet {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(20px + var(--tg-content-safe-area-inset-bottom, 0px));
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  padding: 18px 16px 16px;
  z-index: 20;
}
.sheet-close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.sheet-close:hover {
  background: var(--color-border);
}
.sheet-title {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 6px;
}
.sheet-address {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.sheet-status {
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-semibold);
  margin-bottom: 4px;
}
.sheet-status.open {
  color: var(--color-success);
}
.sheet-status.closed {
  color: var(--color-error);
}
.sheet-hours {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.sheet-phone {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.primary-btn {
  width: 100%;
  padding: 16px;
  border-radius: var(--border-radius-md);
  border: none;
  background: var(--color-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.primary-btn:hover {
  background: var(--color-primary-hover);
}
.primary-btn:active {
  transform: scale(0.98);
}
</style>
