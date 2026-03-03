<template>
  <div class="contacts">
    <div class="contacts-content page-container page-container--spacious-bottom">
      <p class="page-subtitle" v-if="cityName">Город: {{ cityName }}</p>

      <div v-if="loading" class="contacts-skeleton">
        <div v-for="index in 4" :key="`branch-skeleton-${index}`" class="branch-card">
          <div class="skeleton skeleton-line skeleton-w-48"></div>
          <div class="skeleton skeleton-line skeleton-w-72"></div>
        </div>
      </div>
      <div v-else-if="errorMessage" class="state-message error">{{ errorMessage }}</div>

      <div v-else class="branches">
        <div v-for="branch in branches" :key="branch.id" class="branch-card">
          <button class="branch-header" @click="toggleBranch(branch.id)">
            <div class="branch-info">
              <div class="branch-name">{{ branch.displayName || branch.name }}</div>
              <div class="branch-address">{{ branch.displayAddress || branch.address }}</div>
            </div>
            <ChevronDown :size="18" class="chevron" :class="{ open: isBranchOpen(branch.id) }" />
          </button>

          <div v-if="isBranchOpen(branch.id)" class="branch-details">
            <div class="detail-row">
              <Clock :size="16" />
              <div class="detail-text">
                <div class="detail-label">График работы</div>
                <div class="detail-value">
                  <template v-if="getWorkHoursLines(branch).length">
                    <div v-for="(line, index) in getWorkHoursLines(branch)" :key="index">{{ line }}</div>
                  </template>
                  <template v-else>Уточняйте у оператора</template>
                </div>
              </div>
            </div>
            <div class="detail-row">
              <MapPin :size="16" />
              <div class="detail-text">
                <div class="detail-label">Полный адрес</div>
                <div class="detail-value">{{ branch.address || "Адрес не указан" }}</div>
              </div>
            </div>
            <div class="detail-row">
              <Phone :size="16" />
              <div class="detail-text">
                <div class="detail-label">Телефоны</div>
                <div class="detail-value">
                  <div v-if="getPhones(branch).length === 0">Нет контактов</div>
                  <a v-for="phone in getPhones(branch)" :key="phone.value" class="phone-link" :href="`tel:${phone.tel}`">
                    {{ phone.label }}
                  </a>
                </div>
              </div>
            </div>
            <div class="detail-row">
              <div class="branch-map" v-if="getBranchPolygons(branch).length">
                <div class="map" :ref="(el) => setMapRef(branch.id, el)"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!branches.length" class="state-message">Филиалы не найдены</div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ChevronDown, Clock, MapPin, Phone } from "lucide-vue-next";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { citiesAPI } from "@/shared/api/endpoints.js";
import { formatPhone, normalizePhone } from "@/shared/utils/phone.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { normalizeTariffs } from "@/shared/utils/deliveryTariffs";
import { formatWorkHoursLines, normalizeWorkHours } from "@/shared/utils/workingHours";
import { devError } from "@/shared/utils/logger.js";
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";
const router = useRouter();
const locationStore = useLocationStore();
const branches = ref([]);
const polygons = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const openBranches = ref(new Set());
const mapRefs = new Map();
const mapInstances = new Map();
let yandexMaps = null;
const cityName = computed(() => locationStore.selectedCity?.name || "");
const polygonsByBranch = computed(() => {
  const map = new Map();
  polygons.value.forEach((polygon) => {
    const key = String(polygon.branch_id || polygon.branch_name || "unknown");
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(polygon);
  });
  return map;
});
onMounted(async () => {
  if (!locationStore.selectedCity) {
    router.push("/?openCity=1");
    return;
  }
  await loadBranches();
  await loadPolygons();
});
onUnmounted(() => {
  mapInstances.forEach((map) => map?.destroy?.());
  mapInstances.clear();
  mapRefs.clear();
});
function toggleBranch(branchId) {
  hapticFeedback("light");
  const next = new Set(openBranches.value);
  if (next.has(branchId)) {
    next.delete(branchId);
  } else {
    next.add(branchId);
    queueInitMap(branchId);
  }
  openBranches.value = next;
}
function isBranchOpen(branchId) {
  return openBranches.value.has(branchId);
}
async function loadBranches() {
  if (!locationStore.selectedCity?.id) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await citiesAPI.getBranches(locationStore.selectedCity.id);
    const data = response.data.branches || [];
    branches.value = data.map((branch) => buildDisplayBranch(branch));
  } catch (error) {
    devError("Не удалось загрузить филиалы:", error);
    errorMessage.value = "Не удалось загрузить филиалы";
  } finally {
    loading.value = false;
  }
}
async function loadPolygons() {
  if (!locationStore.selectedCity?.id) return;
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/polygons/city/${locationStore.selectedCity.id}`);
    if (!response.ok) return;
    const data = await response.json();
    polygons.value = Array.isArray(data.polygons) ? data.polygons : [];
  } catch (error) {
    devError("Не удалось загрузить полигоны доставки:", error);
  }
}
function setMapRef(branchId, element) {
  if (!element) return;
  mapRefs.set(branchId, element);
  queueInitMap(branchId);
}
function queueInitMap(branchId) {
  if (!isBranchOpen(branchId)) return;
  if (mapInstances.has(branchId)) return;
  if (!mapRefs.get(branchId)) return;
  initBranchMap(branchId);
}
async function initBranchMap(branchId) {
  const container = mapRefs.get(branchId);
  if (!container || mapInstances.has(branchId)) return;
  if (!yandexMaps) {
    yandexMaps = await loadYandexMaps().catch((error) => {
      devError("Не удалось загрузить карту Яндекс:", error);
      return null;
    });
  }
  if (!yandexMaps) return;
  const branch = branches.value.find((item) => item.id === branchId);
  const center = getBranchCenter(branchId);
  const map = new yandexMaps.Map(
    container,
    {
      center,
      zoom: 16,
      controls: [],
    },
    {
      suppressMapOpenBlock: true,
    },
  );
  mapInstances.set(branchId, map);
  if (branch) {
    const lat = Number(branch.latitude);
    const lon = Number(branch.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const marker = new yandexMaps.Placemark([lat, lon], {
        balloonContentBody: branch.address || branch.displayAddress || branch.name || "Филиал",
      });
      map.geoObjects.add(marker);
    }
  }
  const branchPolygons = getBranchPolygons(branch);
  const boundsPoints = [];
  const referenceCenter = { lat: Number(center[0]), lng: Number(center[1]) };
  branchPolygons.forEach((polygon, index) => {
    const ring = getPolygonRing(polygon?.polygon);
    if (!ring) return;
    const coords = toYandexPolygonCoords(ring, referenceCenter);
    if (coords.length < 3) return;
    const shape = new yandexMaps.Polygon(
      [coords],
      {},
      {
        strokeColor: "#10b981",
        fillColor: "rgba(16,185,129,0.15)",
        fillOpacity: 0.4,
        strokeWidth: 2,
      },
    );
    map.geoObjects.add(shape);
    boundsPoints.push(...coords);
    const popupHtml = buildTariffPopup(polygon, index + 1);
    if (popupHtml) {
      shape.properties.set("balloonContentBody", popupHtml);
    }
  });
  const bounds = calcBounds(boundsPoints);
  if (bounds) {
    map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 12 });
  }
}
function buildTariffPopup(polygon, index) {
  const rawTariffs = polygon?.tariffs || polygon?.delivery_tariffs || [];
  if (!Array.isArray(rawTariffs) || rawTariffs.length === 0) {
    return `<div><b>${getPolygonTitle(polygon, index)}</b><br>Тарифы не указаны</div>`;
  }
  const tariffs = normalizeTariffs(rawTariffs);
  const rows = tariffs
    .map((tariff) => {
      const from = tariff.amount_from ?? 0;
      const label = tariff.amount_to === null ? `от ${from} ₽` : `${from}–${tariff.amount_to} ₽`;
      return `<div>${label}: ${tariff.delivery_cost} ₽</div>`;
    })
    .join("");
  return `<div><b>${getPolygonTitle(polygon, index)}</b>${rows}</div>`;
}
function getPolygonTitle(polygon, index) {
  return polygon?.name || polygon?.title || polygon?.zone_name || polygon?.polygon_name || (index ? `Зона ${index}` : "Зона доставки");
}
function getBranchCenter(branchId) {
  const branch = branches.value.find((item) => item.id === branchId);
  const lat = Number(branch?.latitude);
  const lon = Number(branch?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return [lat, lon];
  }
  const cityLat = Number(locationStore.selectedCity?.latitude);
  const cityLon = Number(locationStore.selectedCity?.longitude);
  if (Number.isFinite(cityLat) && Number.isFinite(cityLon)) {
    return [cityLat, cityLon];
  }
  return [55.7522, 37.6156];
}
function getBranchPolygons(branch) {
  if (!branch) return [];
  const byId = polygonsByBranch.value.get(String(branch.id)) || [];
  if (byId.length) return byId;
  return polygonsByBranch.value.get(String(branch.name)) || polygonsByBranch.value.get(String(branch.displayName)) || [];
}
function getPolygonRing(geometry) {
  if (!geometry?.coordinates) return null;
  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates[0]) ? geometry.coordinates[0] : null;
  }
  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates[0]?.[0]) ? geometry.coordinates[0][0] : null;
  }
  return null;
}
function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function calcCenter(coords = []) {
  if (!coords.length) return null;
  const sum = coords.reduce((acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
}
function distanceSq(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}
function toYandexPolygonCoords(coords = [], referenceCenter = null) {
  const points = coords.filter((coord) => Array.isArray(coord) && coord.length >= 2);
  const geoJsonOrder = points.map((coord) => [Number(coord[1]), Number(coord[0])]).filter(([lat, lng]) => isValidLatLng(lat, lng));
  const legacyOrder = points.map((coord) => [Number(coord[0]), Number(coord[1])]).filter(([lat, lng]) => isValidLatLng(lat, lng));
  if (!legacyOrder.length) return geoJsonOrder;
  if (!geoJsonOrder.length) return legacyOrder;
  if (!referenceCenter) return geoJsonOrder;
  const geoJsonCenter = calcCenter(geoJsonOrder);
  const legacyCenter = calcCenter(legacyOrder);
  return distanceSq(geoJsonCenter, referenceCenter) <= distanceSq(legacyCenter, referenceCenter) ? geoJsonOrder : legacyOrder;
}
function calcBounds(coords = []) {
  if (!Array.isArray(coords) || !coords.length) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  coords.forEach((coord) => {
    const lat = Number(coord?.[0]);
    const lng = Number(coord?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  });
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLat) || !Number.isFinite(maxLng)) {
    return null;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
function getPhones(branch) {
  if (!branch) return [];
  const raw = [branch.phone, branch.phone2, branch.phone3].filter(Boolean).join(",");
  return raw
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const tel = normalizePhone(value);
      return {
        value,
        tel: tel || value,
        label: formatPhone(value) || value,
      };
    })
    .filter((item) => item.tel);
}
function buildDisplayBranch(branch) {
  const displayAddress = normalizeAddress(branch.address);
  let displayName = branch.name || "Филиал";
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
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}
</script>
<style scoped>
.contacts {
  min-height: 100vh;
  background: var(--color-background);
}
.page-subtitle {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin: 0 0 16px 0;
}
.branches {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.branch-card {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  background: var(--color-background);
  overflow: hidden;
}
.branch-header {
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-background);
  border: none;
  cursor: pointer;
}
.branch-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.branch-name {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.branch-address {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.chevron {
  transition: transform 0.2s ease;
  color: var(--color-text-secondary);
}
.chevron.open {
  transform: rotate(180deg);
}
.branch-details {
  padding: 12px 14px 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.branch-map {
  width: 100%;
  height: 180px;
  border-radius: var(--border-radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-background-secondary);
}
.map {
  width: 100%;
  height: 100%;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--color-text-primary);
}
.detail-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.detail-label {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.detail-value {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.phone-link {
  color: var(--color-text-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.phone-link:active {
  opacity: 0.7;
}
.zones {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.zone-pill {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--color-background-secondary);
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.state-message {
  text-align: center;
  padding: 24px 12px;
  color: var(--color-text-secondary);
}
.state-message.error {
  color: var(--color-error);
}
.contacts-skeleton {
  display: grid;
  gap: 12px;
}
.contacts-skeleton .branch-card {
  padding: 12px 14px;
}
.contacts-skeleton .skeleton-line:last-child {
  margin-bottom: 0;
}
</style>
