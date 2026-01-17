<template>
  <div class="delivery-map">
    <div class="map-section" :class="{ 'map-disabled': isAddressFocused }">
      <div ref="mapContainerRef" class="map"></div>
      <div class="center-marker" aria-hidden="true">
        <MapPin class="center-marker-icon" />
        <div class="center-marker-pulse"></div>
      </div>

      <div class="map-overlay">
        <div v-if="cityName" class="map-info">
          <div class="map-info-title">{{ cityName }}</div>
          <div class="map-info-subtitle">
            Время доставки до:
            <span class="map-info-time">{{ deliveryTimeLabel }}</span>
          </div>
        </div>
        <div class="map-controls">
          <button class="map-btn" type="button" @click="zoomIn">
            <Plus :size="18" />
          </button>
          <button class="map-btn" type="button" @click="zoomOut">
            <Minus :size="18" />
          </button>
          <button class="map-btn map-btn-primary" type="button" @click="locateUser">
            <LocateFixed :size="18" />
          </button>
        </div>
      </div>
    </div>

    <div class="form-section" data-keep-focus="true" @touchstart.stop @mousedown.stop @pointerdown.stop>
      <div class="sheet-handle"></div>
      <div class="input-wrapper" @pointerdown.stop>
        <input
          ref="addressInputRef"
          v-model="deliveryAddress"
          class="address-input"
          placeholder="улица, дом"
          @input="onAddressInput"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
          @pointerdown.stop
        />
        <button v-if="deliveryAddress" class="clear-btn" type="button" @pointerdown.stop @touchstart.stop @click="clearAddress">
          <X :size="16" />
        </button>
        <div v-if="showSuggestions && addressSuggestions.length" class="suggestions-dropdown">
          <button
            v-for="(suggestion, index) in addressSuggestions"
            :key="index"
            class="suggestion"
            @pointerdown.stop
            @touchstart.stop
            @click="selectAddress(suggestion)"
          >
            {{ suggestion.label }}
          </button>
        </div>
      </div>

      <div class="details-grid">
        <input v-model="deliveryDetails.apartment" class="detail-input" placeholder="Квартира" />
        <input v-model="deliveryDetails.entrance" class="detail-input" placeholder="Подъезд" />
        <input v-model="deliveryDetails.floor" class="detail-input" placeholder="Этаж" />
        <input v-model="deliveryDetails.doorCode" class="detail-input" placeholder="Домофон" />
      </div>
      <textarea v-model="deliveryDetails.comment" class="detail-textarea" placeholder="Комментарий курьеру"></textarea>

      <button class="primary-btn" @click="confirmAddress">Сохранить адрес</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, watch } from "vue";
import { LocateFixed, MapPin, Minus, Plus, X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { addressesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const locationStore = useLocationStore();

const mapContainerRef = ref(null);
const addressInputRef = ref(null);
const deliveryAddress = ref(locationStore.deliveryAddress || "");
const addressSuggestions = ref([]);
const showSuggestions = ref(false);
const selectedLocation = ref(locationStore.deliveryCoords || null);
const deliveryDetails = reactive({
  apartment: locationStore.deliveryDetails?.apartment || "",
  entrance: locationStore.deliveryDetails?.entrance || "",
  floor: locationStore.deliveryDetails?.floor || "",
  doorCode: locationStore.deliveryDetails?.doorCode || "",
  comment: locationStore.deliveryDetails?.comment || "",
});
const lastAddress = ref(deliveryAddress.value);
const isAddressFocused = ref(false);
const lastManualInputAt = ref(0);
const suppressReverseUntil = ref(0);

let searchTimeout = null;
let lastSearchId = 0;
let leafletLoading = null;
let mapInstance = null;
let reverseTimeout = null;
let lastReverseId = 0;
const searchCache = new Map();
const reverseCache = new Map();
let reverseController = null;
let lastReverseRequestAt = 0;
let lastReverseCenter = null;

const cityName = computed(() => locationStore.selectedCity?.name || "");
const deliveryTimeLabel = computed(() => {
  const time = locationStore.deliveryZone?.delivery_time;
  return time ? `${time} мин` : "—";
});
const cityCenter = computed(() => {
  const lat = Number(locationStore.selectedCity?.latitude);
  const lon = Number(locationStore.selectedCity?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
});

onMounted(async () => {
  locationStore.setDeliveryType("delivery");
  await initMap();
  if (deliveryAddress.value && !selectedLocation.value) {
    const resolved = await geocodeAddress(deliveryAddress.value.trim());
    if (resolved) {
      selectedLocation.value = { lat: resolved.lat, lon: resolved.lon };
      setMapCenter(resolved.lat, resolved.lon);
    }
  } else if (!deliveryAddress.value && mapInstance) {
    queueReverseGeocode();
  }
});

function goBack() {
  router.back();
}

function onAddressInput() {
  selectedLocation.value = null;
  showSuggestions.value = true;
  lastManualInputAt.value = Date.now();
  if (reverseTimeout) {
    clearTimeout(reverseTimeout);
  }
  lastReverseId += 1;

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (deliveryAddress.value.trim().length < 2) {
    addressSuggestions.value = [];
    return;
  }

  searchTimeout = setTimeout(() => {
    fetchAddressSuggestions(deliveryAddress.value.trim());
  }, 80);
}

function onAddressFocus() {
  isAddressFocused.value = true;
  showSuggestions.value = true;
  lastManualInputAt.value = Date.now();
  suppressReverseUntil.value = Date.now() + 1500;
  if (reverseTimeout) {
    clearTimeout(reverseTimeout);
  }
  lastReverseId += 1;
  if (mapContainerRef.value) {
    mapContainerRef.value.style.pointerEvents = "none";
  }
  if (mapInstance?.dragging) {
    mapInstance.dragging.disable();
  }
  if (mapInstance?.touchZoom) {
    mapInstance.touchZoom.disable();
  }
}

function onAddressBlur() {
  isAddressFocused.value = false;
  if (mapContainerRef.value) {
    mapContainerRef.value.style.pointerEvents = "";
  }
  if (mapInstance?.dragging) {
    mapInstance.dragging.enable();
  }
  if (mapInstance?.touchZoom) {
    mapInstance.touchZoom.enable();
  }
}

function selectAddress(address) {
  hapticFeedback("light");
  deliveryAddress.value = address.label;
  selectedLocation.value = { lat: address.lat, lon: address.lon };
  lastManualInputAt.value = Date.now();
  suppressReverseUntil.value = Date.now() + 800;
  setMapCenter(address.lat, address.lon);
  showSuggestions.value = false;
}

function clearAddress() {
  deliveryAddress.value = "";
  addressSuggestions.value = [];
  selectedLocation.value = null;
  lastManualInputAt.value = Date.now();
  suppressReverseUntil.value = Date.now() + 800;
}

async function confirmAddress() {
  if (!deliveryAddress.value.trim()) {
    hapticFeedback("error");
    return;
  }

  if (!selectedLocation.value) {
    const resolved = await geocodeAddress(deliveryAddress.value.trim());
    if (!resolved) {
      hapticFeedback("error");
      showSuggestions.value = true;
      return;
    }
    deliveryAddress.value = resolved.label;
    selectedLocation.value = { lat: resolved.lat, lon: resolved.lon };
    setMapCenter(resolved.lat, resolved.lon);
  }

  locationStore.setDeliveryAddress(deliveryAddress.value);
  locationStore.setDeliveryDetails({ ...deliveryDetails });
  if (selectedLocation.value) {
    locationStore.setDeliveryCoords({
      lat: selectedLocation.value.lat,
      lng: selectedLocation.value.lng ?? selectedLocation.value.lon,
    });
    if (locationStore.selectedCity?.id) {
      try {
        const lngValue = selectedLocation.value.lng ?? selectedLocation.value.lon;
        const response = await addressesAPI.checkDeliveryZone(selectedLocation.value.lat, lngValue, locationStore.selectedCity.id);
        if (response.data?.available && response.data?.polygon) {
          locationStore.setDeliveryZone(response.data.polygon);
        }
      } catch (error) {
        console.error("Failed to update delivery zone:", error);
      }
    }
  }
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push("/");
  }
}

async function initMap() {
  if (!mapContainerRef.value || mapInstance) return;
  const L = await loadLeaflet();
  if (!L) return;

  const initial = selectedLocation.value || cityCenter.value || { lat: 0, lon: 0 };
  mapInstance = L.map(mapContainerRef.value, { zoomControl: false, attributionControl: false }).setView([initial.lat, initial.lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstance);

  // Загружаем и отображаем полигоны доставки
  await loadDeliveryPolygons(L);

  mapInstance.on("movestart", () => {
    if (!isAddressFocused.value) {
      showSuggestions.value = false;
    }
  });
  mapInstance.on("moveend", () => {
    queueReverseGeocode();
  });

  if (selectedLocation.value) {
    setMapCenter(selectedLocation.value.lat, selectedLocation.value.lon);
  }
}

async function loadDeliveryPolygons(L) {
  if (!locationStore.selectedCity?.id) return;

  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/polygons/city/${locationStore.selectedCity.id}`);
    if (!response.ok) return;

    const data = await response.json();
    if (!data.polygons || !data.polygons.length) return;

    data.polygons.forEach((polygon) => {
      if (polygon.polygon && polygon.polygon.coordinates) {
        const coords = polygon.polygon.coordinates[0].map((coord) => [coord[0], coord[1]]);
        L.polygon(coords, {
          color: "#10b981",
          fillColor: "#10b981",
          fillOpacity: 0.1,
          weight: 2,
        })
          .addTo(mapInstance)
          .bindPopup(
            `
          <b>${polygon.branch_name}</b><br>
          Доставка: ${polygon.delivery_time} мин<br>
          Стоимость: ${polygon.delivery_cost}₽
        `,
            { autoPan: false },
          );
      }
    });
  } catch (error) {
    console.error("Failed to load delivery polygons:", error);
  }
}

function setMapCenter(lat, lon) {
  if (!mapInstance) return;
  mapInstance.setView([lat, lon], mapInstance.getZoom(), { animate: true });
}

function queueReverseGeocode() {
  if (!mapInstance) return;
  if (isAddressFocused.value) return;
  if (Date.now() - lastManualInputAt.value < 1500) return;
  if (Date.now() < suppressReverseUntil.value) return;
  const center = mapInstance.getCenter();
  if (lastReverseCenter) {
    const dLat = Math.abs(lastReverseCenter.lat - center.lat);
    const dLng = Math.abs(lastReverseCenter.lng - center.lng);
    if (dLat < 0.0002 && dLng < 0.0002) {
      return;
    }
  }
  selectedLocation.value = { lat: center.lat, lon: center.lng };
  if (reverseTimeout) {
    clearTimeout(reverseTimeout);
  }
  const requestId = ++lastReverseId;
  reverseTimeout = setTimeout(async () => {
    if (Date.now() - lastReverseRequestAt < 1000) return;
    const suggestion = await reverseGeocode(center.lat, center.lng);
    if (requestId !== lastReverseId) return;
    if (suggestion) {
      deliveryAddress.value = suggestion.label;
      const deltaLat = Math.abs(suggestion.lat - center.lat);
      const deltaLng = Math.abs(suggestion.lon - center.lng);
      if (deltaLat > 0.00005 || deltaLng > 0.00005) {
        suppressReverseUntil.value = Date.now() + 800;
        setMapCenter(suggestion.lat, suggestion.lon);
      }
      lastReverseCenter = { lat: center.lat, lng: center.lng };
    }
  }, 100);
}

function zoomIn() {
  mapInstance?.zoomIn();
}

function zoomOut() {
  mapInstance?.zoomOut();
}

async function locateUser() {
  try {
    const location = await locationStore.detectUserLocation();
    if (!location) return;
    setMapCenter(location.lat, location.lon);
    queueReverseGeocode();
  } catch (error) {
    console.error("Failed to detect user location:", error);
  }
}

async function fetchAddressSuggestions(query) {
  const normalized = query.trim().toLowerCase();
  if (searchCache.has(normalized)) {
    addressSuggestions.value = searchCache.get(normalized) || [];
    return;
  }
  const searchId = ++lastSearchId;
  try {
    const start = performance.now();
    const response = await fetch(buildNominatimUrl(query));
    if (!response.ok) {
      throw new Error("Address search failed");
    }
    const data = await response.json();
    const elapsed = Math.round(performance.now() - start);
    if (searchId !== lastSearchId) return;

    const suggestions = data
      .map((item) => formatAddressSuggestion(item))
      .filter((item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lon));
    addressSuggestions.value = suggestions;
    searchCache.set(normalized, suggestions);
    console.debug(`Address suggestions: ${elapsed}ms`, { query: normalized, count: suggestions.length });
  } catch (error) {
    if (searchId === lastSearchId) {
      addressSuggestions.value = [];
    }
    console.error("Failed to search address:", error);
  }
}

async function geocodeAddress(query) {
  try {
    const response = await fetch(buildNominatimUrl(query, 1));
    if (!response.ok) {
      throw new Error("Geocode failed");
    }
    const data = await response.json();
    if (!data.length) return null;
    return formatAddressSuggestion(data[0]);
  } catch (error) {
    console.error("Failed to geocode address:", error);
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (reverseCache.has(key)) {
      return reverseCache.get(key);
    }
    if (reverseController) {
      reverseController.abort();
    }
    reverseController = new AbortController();
    const start = performance.now();
    const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/polygons/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lon }),
      signal: reverseController.signal,
    });
    if (!response.ok) {
      throw new Error("Reverse geocode failed");
    }
    const data = await response.json();
    const suggestion =
      data && data.label && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))
        ? { label: data.label, lat: Number(data.lat), lon: Number(data.lon) }
        : formatAddressSuggestion(data);
    reverseCache.set(key, suggestion);
    const elapsed = Math.round(performance.now() - start);
    console.debug(`Reverse geocode: ${elapsed}ms`, { key, hasSuggestion: !!suggestion });
    lastReverseRequestAt = Date.now();
    return suggestion;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("Failed to reverse geocode:", error);
    }
    return null;
  }
}

function buildNominatimUrl(query, limit = 5) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  const queryValue = cityName.value ? `${query}, ${cityName.value}` : query;
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", queryValue);
  if (cityCenter.value) {
    const delta = 0.25;
    const { lat, lon } = cityCenter.value;
    const viewbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
    url.searchParams.set("viewbox", viewbox);
    url.searchParams.set("bounded", "1");
  }
  return url.toString();
}

function formatAddressSuggestion(item) {
  const address = item?.address || {};
  const street =
    address.road || address.pedestrian || address.footway || address.residential || address.living_street || address.street || address.neighbourhood;
  const house = address.house_number || address.building;

  if (!street) {
    return null;
  }

  return {
    label: house ? `${street}, ${house}` : street,
    lat: Number(item.lat),
    lon: Number(item.lon),
  };
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

watch(deliveryAddress, (value) => {
  if (value !== lastAddress.value) {
    deliveryDetails.apartment = "";
    deliveryDetails.entrance = "";
    deliveryDetails.floor = "";
    deliveryDetails.doorCode = "";
    deliveryDetails.comment = "";
    lastAddress.value = value;
  }
});
</script>

<style scoped>
.delivery-map {
  min-height: 100vh;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
}

.map-section {
  position: relative;
  overflow: hidden;
  height: 52vh;
  background: var(--color-background-secondary);
}

.map-disabled .map,
.map-disabled .map-overlay,
.map-disabled .center-marker {
  pointer-events: none;
}

.map {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.center-marker {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -100%);
  z-index: 15;
  pointer-events: none;
}

.center-marker-icon {
  width: 34px;
  height: 34px;
  color: #ef4444;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.25));
}

.map-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 16;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.map-info {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 16px;
  padding: 10px 14px;
  box-shadow: var(--shadow-md);
  max-width: 70%;
}

.map-info-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.map-info-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.map-info-time {
  font-weight: 600;
  color: var(--color-text-primary);
}

.map-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  cursor: pointer;
}

.map-btn-primary {
  background: var(--color-primary);
  color: var(--color-text-primary);
}

.form-section {
  margin-top: -16px;
  background: var(--color-background);
  border-radius: var(--border-radius-xl);
  padding: 12px;
  z-index: 20;
  box-shadow: var(--shadow-md);
}

.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
  margin: 0 auto 12px;
}

.input-wrapper {
  position: relative;
  margin-bottom: 12px;
}

.address-input {
  width: 100%;
  padding: 12px 40px 12px 16px;
  border-radius: var(--border-radius-md);
  border: none;
  font-size: var(--font-size-body);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.address-input:focus {
  outline: none;
  background: var(--color-background);
  border: 1px solid var(--color-primary);
}

.address-input::placeholder {
  color: var(--color-text-muted);
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--color-background-secondary);
  font-size: 18px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.clear-btn:hover {
  background: var(--color-border);
}

.suggestions-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  padding: 8px;
  box-shadow: var(--shadow-md);
  z-index: 40;
}

.suggestion {
  text-align: left;
  padding: 10px 12px;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-sm);
  border: none;
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.suggestion:hover {
  background: var(--color-border);
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

.details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.detail-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--border-radius-md);
  border: none;
  background: var(--color-background-secondary);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.detail-input:focus {
  outline: none;
  border: 1px solid var(--color-primary);
  background: var(--color-background);
}

.detail-textarea {
  width: 100%;
  min-height: 90px;
  padding: 12px 14px;
  border-radius: var(--border-radius-md);
  border: none;
  background: var(--color-background-secondary);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  resize: none;
  margin-bottom: 10px;
  font-family: inherit;
}

.detail-textarea:focus {
  outline: none;
  border: 1px solid var(--color-primary);
  background: var(--color-background);
}

.primary-btn:hover {
  background: var(--color-primary-hover);
}

.primary-btn:active {
  transform: scale(0.98);
}

</style>
