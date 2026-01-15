<template>
  <div class="delivery-map">
    <PageHeader title="Выберите адрес" />

    <div ref="mapContainerRef" class="map"></div>

    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div class="input-wrapper">
        <input
          ref="addressInputRef"
          v-model="deliveryAddress"
          class="address-input"
          placeholder="улица, дом"
          @input="onAddressInput"
          @focus="showSuggestions = true"
        />
        <button v-if="deliveryAddress" class="clear-btn" @click="clearAddress">
          <X :size="16" />
        </button>
      </div>

      <div v-if="showSuggestions && addressSuggestions.length" class="suggestions">
        <button v-for="(suggestion, index) in addressSuggestions" :key="index" class="suggestion" @click="selectAddress(suggestion)">
          {{ suggestion.label }}
        </button>
      </div>

      <button class="primary-btn" @click="confirmAddress">Доставить сюда</button>
    </div>

    <div v-if="mapSuggestion" class="map-suggestion">
      <div class="map-suggestion-title">Предложенный адрес</div>
      <div class="map-suggestion-text">{{ mapSuggestion.label }}</div>
      <button class="primary-btn" @click="applyMapSuggestion">Использовать адрес</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { X } from "lucide-vue-next";
import PageHeader from "../components/PageHeader.vue";
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const locationStore = useLocationStore();

const mapContainerRef = ref(null);
const addressInputRef = ref(null);
const deliveryAddress = ref(locationStore.deliveryAddress || "");
const addressSuggestions = ref([]);
const showSuggestions = ref(false);
const selectedLocation = ref(locationStore.deliveryCoords || null);
const mapSuggestion = ref(null);

let searchTimeout = null;
let lastSearchId = 0;
let leafletLoading = null;
let mapInstance = null;
let mapMarker = null;

const cityName = computed(() => locationStore.selectedCity?.name || "");
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
      setMapMarker(resolved.lat, resolved.lon);
    }
  }
});

function goBack() {
  router.back();
}

function onAddressInput() {
  mapSuggestion.value = null;
  selectedLocation.value = null;
  showSuggestions.value = true;

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (deliveryAddress.value.trim().length < 3) {
    addressSuggestions.value = [];
    return;
  }

  searchTimeout = setTimeout(() => {
    fetchAddressSuggestions(deliveryAddress.value.trim());
  }, 150);
}

function selectAddress(address) {
  hapticFeedback("light");
  deliveryAddress.value = address.label;
  selectedLocation.value = { lat: address.lat, lon: address.lon };
  setMapMarker(address.lat, address.lon);
  showSuggestions.value = false;
}

function clearAddress() {
  deliveryAddress.value = "";
  addressSuggestions.value = [];
  selectedLocation.value = null;
  mapSuggestion.value = null;
  clearMapMarker();
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
    setMapMarker(resolved.lat, resolved.lon);
  }

  locationStore.setDeliveryAddress(deliveryAddress.value);
  if (selectedLocation.value) {
    locationStore.setDeliveryCoords(selectedLocation.value);
  }
  router.push("/delivery-address");
}

function applyMapSuggestion() {
  if (!mapSuggestion.value) return;
  deliveryAddress.value = mapSuggestion.value.label;
  selectedLocation.value = { lat: mapSuggestion.value.lat, lon: mapSuggestion.value.lon };
  setMapMarker(mapSuggestion.value.lat, mapSuggestion.value.lon);
  mapSuggestion.value = null;
  showSuggestions.value = false;
  locationStore.setDeliveryAddress(deliveryAddress.value);
  locationStore.setDeliveryCoords(selectedLocation.value);
}

async function initMap() {
  if (!mapContainerRef.value || mapInstance) return;
  const L = await loadLeaflet();
  if (!L) return;

  const initial = selectedLocation.value || cityCenter.value || { lat: 0, lon: 0 };
  mapInstance = L.map(mapContainerRef.value, { zoomControl: false, attributionControl: false }).setView([initial.lat, initial.lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstance);

  mapInstance.on("click", async (event) => {
    const { lat, lng } = event.latlng;
    setMapMarker(lat, lng);
    mapSuggestion.value = null;
    const suggestion = await reverseGeocode(lat, lng);
    if (suggestion) {
      mapSuggestion.value = suggestion;
    }
  });

  if (selectedLocation.value) {
    setMapMarker(selectedLocation.value.lat, selectedLocation.value.lon);
  }
}

function setMapMarker(lat, lon) {
  const L = window.L;
  if (!mapInstance || !L) return;
  if (mapMarker) {
    mapMarker.setLatLng([lat, lon]);
    return;
  }
  mapMarker = L.marker([lat, lon]).addTo(mapInstance);
}

function clearMapMarker() {
  if (mapInstance && mapMarker) {
    mapInstance.removeLayer(mapMarker);
    mapMarker = null;
  }
}

async function fetchAddressSuggestions(query) {
  const searchId = ++lastSearchId;
  try {
    const response = await fetch(buildNominatimUrl(query));
    if (!response.ok) {
      throw new Error("Address search failed");
    }
    const data = await response.json();
    if (searchId !== lastSearchId) return;

    addressSuggestions.value = data
      .map((item) => formatAddressSuggestion(item))
      .filter((item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lon));
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
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error("Reverse geocode failed");
    }
    const data = await response.json();
    return formatAddressSuggestion(data);
  } catch (error) {
    console.error("Failed to reverse geocode:", error);
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

  if (!street || !house) {
    return null;
  }

  return {
    label: `${street}, ${house}`,
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
</script>

<style scoped>
.delivery-map {
  position: relative;
  min-height: 100vh;
  background: var(--color-background-secondary);
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

.bottom-sheet {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 20px;
  background: var(--color-background);
  border-radius: var(--border-radius-xl) var(--border-radius-xl) 0 0;
  padding: 16px;
  z-index: 20;
  box-shadow: var(--shadow-md);
  /* Учитываем safe area для нижних элементов */
  bottom: calc(20px + var(--tg-content-safe-area-inset-bottom, 0px));
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

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  max-height: 160px;
  overflow-y: auto;
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

.primary-btn:hover {
  background: var(--color-primary-hover);
}

.primary-btn:active {
  transform: scale(0.98);
}

.map-suggestion {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(190px + var(--tg-content-safe-area-inset-bottom, 0px));
  background: var(--color-background);
  border-radius: var(--border-radius-lg);
  padding: 12px 14px;
  z-index: 20;
  box-shadow: var(--shadow-md);
}

.bottom-sheet .suggestions {
  max-height: 120px;
}

.map-suggestion-title {
  font-size: var(--font-size-small);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.map-suggestion-text {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 10px;
}
</style>
