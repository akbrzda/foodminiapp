<template>
  <div class="pickup-map">
    <div class="map-header">
      <button class="back-btn" @click="goBack">‹</button>
      <div class="header-title">Найти пиццерию</div>
    </div>

    <div ref="mapContainerRef" class="map"></div>

    <div class="search-bar">
      <input v-model="searchQuery" class="search-input" placeholder="Найти пиццерию" />
    </div>

    <div v-if="filteredBranches.length" class="branch-list">
      <button
        v-for="branch in filteredBranches"
        :key="branch.id"
        class="branch-card"
        @click="selectBranch(branch)"
      >
        <div class="branch-title">{{ branch.displayName || branch.name }}</div>
        <div class="branch-address">{{ branch.displayAddress || branch.address }}</div>
        <div class="branch-status" :class="branch.isOpen ? 'open' : 'closed'">
          {{ branch.isOpen ? 'Открыто' : 'Закрыто' }}
        </div>
      </button>
    </div>

    <div v-if="selectedBranch" class="branch-sheet">
      <button class="sheet-close" @click="selectedBranch = null">×</button>
      <div class="sheet-title">{{ selectedBranch.displayName || selectedBranch.name }}</div>
      <div class="sheet-address">{{ selectedBranch.displayAddress || selectedBranch.address }}</div>
      <div class="sheet-status" :class="selectedBranch.isOpen ? 'open' : 'closed'">
        {{ selectedBranch.isOpen ? 'Открыто' : 'Закрыто' }}
      </div>
      <div class="sheet-hours">{{ selectedBranch.work_hours || 'Время работы уточняйте' }}</div>
      <div class="sheet-phone">{{ selectedBranch.phone || '+7 (800) 777-70-55' }}</div>
      <button class="primary-btn" @click="confirmPickup">Заберу отсюда</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { citiesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

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
    `${branch.displayName || branch.name} ${branch.displayAddress || branch.address}`.toLowerCase().includes(query)
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
  } catch (error) {
    console.error("Failed to load branches:", error);
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

  return {
    ...branch,
    isOpen: true,
    displayName,
    displayAddress: displayAddress || branch.address || "",
  };
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
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
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
  background: #f7f4f2;
  isolation: isolate;
}

.map-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.92);
}

.back-btn {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  border: none;
  background: #ffffff;
  font-size: 20px;
  cursor: pointer;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: #222222;
}

.map {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.search-bar {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 92px;
  z-index: 20;
}

.search-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #dedad7;
  background: #ffffff;
  font-size: 14px;
  color: #1f1f1f;
}

.search-input::placeholder {
  color: #8b8b8b;
}

.branch-list {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 150px;
  z-index: 20;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.branch-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 12px 14px;
  border: none;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 18px rgba(0, 0, 0, 0.08);
  color: #1f1f1f;
}

.branch-title {
  font-size: 14px;
  font-weight: 700;
  color: #1f1f1f;
}

.branch-address {
  font-size: 12px;
  color: #6d6d6d;
  margin: 4px 0;
}

.branch-status {
  font-size: 12px;
  font-weight: 600;
}

.branch-status.open {
  color: #22c55e;
}

.branch-status.closed {
  color: #ef4444;
}

.branch-sheet {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 20px;
  background: #ffffff;
  border-radius: 24px;
  padding: 18px 16px 16px;
  z-index: 20;
  box-shadow: 0 18px 28px rgba(0, 0, 0, 0.16);
}

.sheet-close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  border: none;
  background: #f0edeb;
  font-size: 16px;
  cursor: pointer;
}

.sheet-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}

.sheet-address {
  font-size: 13px;
  color: #6d6d6d;
  margin-bottom: 6px;
}

.sheet-status {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.sheet-status.open {
  color: #22c55e;
}

.sheet-status.closed {
  color: #ef4444;
}

.sheet-hours {
  font-size: 12px;
  color: #6d6d6d;
  margin-bottom: 6px;
}

.sheet-phone {
  font-size: 12px;
  color: #3b82f6;
  margin-bottom: 12px;
}

.primary-btn {
  width: 100%;
  padding: 14px;
  border-radius: 20px;
  border: none;
  background: #f7d000;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
</style>
