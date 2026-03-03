<template>
  <div class="pickup-map">
    <div class="map-section">
      <div ref="mapContainerRef" class="map"></div>
    </div>

    <div class="form-section">
      <div class="sheet-handle"></div>

      <div v-if="filteredBranches.length && !selectedBranch" class="branch-list">
        <h2 class="sheet-heading">Рестораны</h2>
        <button v-for="branch in filteredBranches" :key="branch.id" class="branch-card" @click="selectBranch(branch)">
          <div class="branch-card-content">
            <div class="branch-title">{{ branch.displayName || branch.name }}</div>
            <div class="branch-address">{{ branch.displayAddress || branch.address }}</div>
            <div class="branch-schedule-lines">
              <div v-for="(line, index) in getBranchScheduleLines(branch)" :key="`list-schedule-${branch.id}-${index}`">
                {{ line }}
              </div>
            </div>
          </div>
          <ChevronRight :size="16" class="branch-chevron" />
        </button>
      </div>

      <div v-if="selectedBranch" class="branch-sheet">
        <div class="sheet-title">
          <button class="sheet-back" type="button" @click="selectedBranch = null">
            <ArrowLeft :size="20" />
          </button>
          {{ selectedBranch.displayName || selectedBranch.name }}
        </div>

        <div class="sheet-row">
          <MapPin :size="16" />
          <div>
            <div class="sheet-address">{{ selectedBranch.displayAddress || selectedBranch.address }}</div>
          </div>
        </div>

        <div class="sheet-row">
          <Clock3 :size="16" />
          <div class="sheet-info">
            <template v-for="(line, index) in getBranchScheduleLines(selectedBranch)" :key="`schedule-${index}`">
              <div>{{ line }}</div>
            </template>
          </div>
        </div>

        <a v-if="selectedBranch.phone" class="sheet-row sheet-phone-row" :href="`tel:${normalizePhone(selectedBranch.phone)}`">
          <Phone :size="16" />
          <div class="sheet-phone">{{ formatPhone(selectedBranch.phone) }}</div>
        </a>

        <button class="primary-btn" @click="confirmPickup">Заберу отсюда</button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ArrowLeft, ChevronRight, Clock3, MapPin, Phone } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { formatPhone, normalizePhone } from "@/shared/utils/phone.js";
import { citiesAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";
import { formatWorkHoursLines, normalizeWorkHours } from "@/shared/utils/workingHours";
import { devError } from "@/shared/utils/logger.js";
const router = useRouter();
const locationStore = useLocationStore();
const mapContainerRef = ref(null);
const branches = ref([]);
const selectedBranch = ref(null);
let mapInstance = null;
let markers = [];
let yandexMaps = null;
const filteredBranches = computed(() => branches.value);
onMounted(async () => {
  locationStore.setDeliveryType("pickup");
  if (!locationStore.selectedCity) {
    router.push("/?openCity=1");
    return;
  }
  await loadBranches();
  await initMap();
});

onUnmounted(() => {
  if (mapInstance) {
    mapInstance.destroy();
    mapInstance = null;
  }
  markers = [];
});

async function loadBranches() {
  try {
    const response = await citiesAPI.getBranches(locationStore.selectedCity.id);
    const data = response.data.branches || [];
    branches.value = data.map((branch) => buildDisplayBranch(branch));
    locationStore.setBranches(branches.value);
    // По UX всегда начинаем со списка филиалов. Карточка открывается только по клику.
    selectedBranch.value = null;
  } catch (error) {
    devError("Не удалось загрузить филиалы:", error);
  }
}
async function initMap() {
  if (!mapContainerRef.value || mapInstance) return;
  const ymaps = await loadYandexMaps().catch((error) => {
    devError("Не удалось загрузить карту Яндекс:", error);
    return null;
  });
  if (!ymaps) return;
  yandexMaps = ymaps;
  const center = getInitialMapCenter();
  mapInstance = new ymaps.Map(
    mapContainerRef.value,
    {
      center,
      zoom: 16,
      controls: [],
    },
    {
      suppressMapOpenBlock: true,
    },
  );
  setMarkers();
}
function setMarkers() {
  if (!mapInstance || !yandexMaps) return;
  markers.forEach((marker) => mapInstance.geoObjects.remove(marker));
  markers = [];
  branches.value.forEach((branch) => {
    const { lat, lon } = normalizeCoords(branch.latitude, branch.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const marker = new yandexMaps.Placemark(
      [lat, lon],
      {
        hintContent: branch.displayName || branch.name,
        balloonContent: branch.displayAddress || branch.address || "",
      },
      createBranchMarkerOptions(branch),
    );
    marker.events.add("click", () => selectBranch(branch));
    mapInstance.geoObjects.add(marker);
    markers.push(marker);
  });
}
function selectBranch(branch) {
  hapticFeedback("light");
  selectedBranch.value = branch;
  locationStore.setBranch(branch);
  setMarkers();
  const { lat, lon } = normalizeCoords(branch.latitude, branch.longitude);
  if (mapInstance && Number.isFinite(lat) && Number.isFinite(lon)) {
    mapInstance.setCenter([lat, lon], 16, {
      duration: 250,
    });
  }
}
function createBranchMarkerSvg(branch) {
  const prepTime = Number(branch?.prep_time);
  const minutes = Number.isFinite(prepTime) && prepTime > 0 ? Math.round(prepTime) : 15;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="73" viewBox="0 0 48 73">
  <defs>
    <filter id="f" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="3" flood-color="#111827" flood-opacity="0.3"/>
    </filter>
  </defs>
  <line x1="24" y1="48" x2="24" y2="73" stroke="#111827" stroke-width="3" stroke-linecap="round"/>
  <g filter="url(#f)">
    <circle cx="24" cy="24" r="24" fill="#111827"/>
  </g>
  <text x="24" y="23" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="13" font-weight="700">${minutes}</text>
  <text x="24" y="34" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="8" font-weight="700">МИН</text>
</svg>`.trim();
}
function createBranchMarkerOptions(branch) {
  const svg = createBranchMarkerSvg(branch);
  const href = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    iconLayout: "default#image",
    iconImageHref: href,
    iconImageSize: [48, 73],
    iconImageOffset: [-24, -73],
  };
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
function getInitialMapCenter() {
  const selected = selectedBranch.value;
  if (selected) {
    const selectedCoords = normalizeCoords(selected.latitude, selected.longitude);
    if (Number.isFinite(selectedCoords.lat) && Number.isFinite(selectedCoords.lon)) {
      return [selectedCoords.lat, selectedCoords.lon];
    }
  }

  const firstWithCoords = branches.value.find((branch) => {
    const coords = normalizeCoords(branch.latitude, branch.longitude);
    return Number.isFinite(coords.lat) && Number.isFinite(coords.lon);
  });
  if (firstWithCoords) {
    const coords = normalizeCoords(firstWithCoords.latitude, firstWithCoords.longitude);
    return [coords.lat, coords.lon];
  }

  return getCityCenter();
}
function buildDisplayBranch(branch) {
  const displayAddress = normalizeAddress(branch.address);
  let displayName = branch.name || "Пиццерия";
  if (isAddressLike(displayName) || normalizeAddress(displayName) === displayAddress) {
    displayName = "Панда Пицца";
  }
  return {
    ...branch,
    displayName,
    displayAddress: displayAddress || branch.address || "",
    work_hours: normalizeWorkHours(branch.work_hours || branch.working_hours),
  };
}
function getWorkHoursLines(branch) {
  return formatWorkHoursLines(branch.work_hours || branch.working_hours);
}
function getBranchScheduleLines(branch) {
  const lines = getWorkHoursLines(branch);
  if (!lines.length) return ["Время работы уточняйте"];
  if (lines.length === 1) return [`Ежедневно: ${lines[0]}`];
  return lines;
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
</script>
<style scoped>
.pickup-map {
  min-height: 100vh;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
}
.map-section {
  position: relative;
  overflow: hidden;
  height: 60vh;
  background: var(--color-background-secondary);
}
.map {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.form-section {
  background: var(--color-background);
  border-radius: var(--border-radius-xl);
  padding: 12px;
  z-index: 20;
  min-height: 0;
  margin-top: -48px;
}
.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
  margin: 0 auto 12px;
}
.branch-list {
  max-height: min(40vh, 320px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 10px;
}
.sheet-heading {
  margin: 0 0 10px;
  font-size: var(--font-size-h2);
  line-height: 1.1;
  font-weight: 800;
  color: var(--color-text-primary);
}
.branch-card {
  background: transparent;
  border-radius: 0;
  padding: 14px 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  cursor: pointer;
  box-shadow: none;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  transition:
    box-shadow var(--transition-duration) var(--transition-easing),
    background-color var(--transition-duration) var(--transition-easing);
}
.branch-card:hover {
  background: transparent;
}
.branch-card-content {
  min-width: 0;
  flex: 1;
}
.branch-title {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.branch-address {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin: 2px 0 4px;
}
.branch-schedule-lines {
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
}
.branch-chevron {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.branch-sheet {
  position: relative;
  background: transparent;
  border-radius: var(--border-radius-md);
  padding: 4px 0 6px;
  border: none;
}
.sheet-title {
  font-size: var(--font-size-h2);
  font-weight: 800;
  color: var(--color-text-primary);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet-back {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
  padding: 0;
  cursor: pointer;
}
.sheet-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  color: var(--color-text-primary);
}
.sheet-address {
  font-size: var(--font-size-body);
  line-height: var(--font-size-body);
  color: var(--color-text-primary);
}
.sheet-info {
  font-size: var(--font-size-body);
  line-height: var(--font-size-body);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-phone {
  font-size: var(--font-size-body);
  line-height: var(--font-size-body);
  color: var(--color-text-primary);
}
.sheet-phone-row {
  text-decoration: none;
}
.primary-btn {
  width: 100%;
  padding: 16px;
  border-radius: var(--border-radius-lg);
  border: none;
  background: var(--color-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
  margin-top: 14px;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.primary-btn:hover {
  background: var(--color-primary-hover);
}
.primary-btn:active {
  transform: scale(0.98);
}
</style>
