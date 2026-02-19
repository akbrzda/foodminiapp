<template>
  <div class="delivery-map">
    <div class="map-section">
      <div ref="mapContainerRef" class="map"></div>
      <div class="center-marker" aria-hidden="true">
        <MapPin class="center-marker-icon" />
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
          <button class="map-btn" type="button" aria-label="Увеличить масштаб карты" @click="zoomIn">
            <Plus :size="18" />
          </button>
          <button class="map-btn" type="button" aria-label="Уменьшить масштаб карты" @click="zoomOut">
            <Minus :size="18" />
          </button>
          <button class="map-btn map-btn-primary" type="button" aria-label="Определить мою геопозицию" @click="locateUser">
            <LocateFixed :size="18" />
          </button>
        </div>
      </div>
    </div>

    <div class="form-section" data-keep-focus="true" @touchstart.stop @mousedown.stop @pointerdown.stop>
      <div class="sheet-handle"></div>
      <div class="input-wrapper" @pointerdown.stop>
        <FloatingField
          ref="addressFieldRef"
          v-model="deliveryStreet"
          class="street-field"
          label="Улица"
          placeholder="Улица"
          :control-class="['address-input', 'mini-field']"
          @input="onAddressInput"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
        >
          <template #suffix>
            <button
              v-if="deliveryStreet"
              class="clear-btn"
              type="button"
              aria-label="Очистить улицу"
              @pointerdown.stop="onInputControlPointerDown"
              @touchstart.stop="onInputControlPointerDown"
              @mousedown.stop="onInputControlPointerDown"
              @click="clearAddress"
            >
              <X :size="14" />
            </button>
          </template>
        </FloatingField>
        <div v-if="showSuggestionsPanel" class="suggestions-dropdown">
          <div v-if="isSuggestionsLoading" class="suggestion suggestion-meta">Поиск адреса...</div>
          <button
            v-for="(suggestion, index) in addressSuggestions"
            :key="`${suggestion.id || suggestion.label}-${index}`"
            class="suggestion"
            @pointerdown.stop="onInputControlPointerDown"
            @touchstart.stop="onInputControlPointerDown"
            @mousedown.stop="onInputControlPointerDown"
            @click="selectAddress(suggestion)"
          >
            {{ suggestion.label }}
          </button>
          <div v-if="canShowNoResults" class="suggestion suggestion-meta">Адрес не найден, уточните запрос</div>
        </div>
      </div>
      <div v-if="deliveryZoneError" class="error-message">
        {{ deliveryZoneError }}
      </div>

      <div class="details-grid details-grid-three">
        <FloatingField v-model="deliveryHouse" label="Дом" placeholder="Дом" :control-class="['detail-input', 'mini-field']" />
        <FloatingField v-model="deliveryDetails.entrance" label="Подъезд" placeholder="Подъезд" :control-class="['detail-input', 'mini-field']" />
        <FloatingField v-model="deliveryDetails.floor" label="Этаж" placeholder="Этаж" :control-class="['detail-input', 'mini-field']" />
      </div>
      <div class="details-grid details-grid-two">
        <FloatingField v-model="deliveryDetails.apartment" label="Квартира" placeholder="Квартира" :control-class="['detail-input', 'mini-field']" />
        <FloatingField v-model="deliveryDetails.doorCode" label="Домофон" placeholder="Домофон" :control-class="['detail-input', 'mini-field']" />
      </div>

      <FloatingField
        v-model="deliveryDetails.comment"
        class="floating-textarea"
        as="textarea"
        label="Комментарий"
        placeholder="Комментарий курьеру"
        :rows="3"
        :control-class="['detail-textarea', 'mini-textarea']"
      />
      <button class="primary-btn" @click="confirmAddress">Сохранить адрес</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch } from "vue";
import { LocateFixed, MapPin, Minus, Plus, X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { addressesAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { devDebug, devError } from "@/shared/utils/logger.js";
import FloatingField from "@/shared/components/FloatingField.vue";

const router = useRouter();
const locationStore = useLocationStore();

const mapContainerRef = ref(null);
const addressFieldRef = ref(null);
const cityPolygons = ref([]);

const parseSavedAddress = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return { street: "", house: "" };
  }
  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return { street: raw, house: "" };
  }
  const maybeHouse = parts[parts.length - 1];
  if (/\d/.test(maybeHouse)) {
    return { street: parts.slice(0, -1).join(", "), house: maybeHouse };
  }
  return { street: raw, house: "" };
};

const savedAddress = parseSavedAddress(locationStore.deliveryAddress || "");
const deliveryStreet = ref(savedAddress.street);
const deliveryHouse = ref(savedAddress.house);
const mapAddressHint = ref(locationStore.deliveryAddress || "");
const addressSuggestions = ref([]);
const showSuggestions = ref(false);
const selectedLocation = ref(normalizeCoords(locationStore.deliveryCoords));

const deliveryDetails = reactive({
  apartment: locationStore.deliveryDetails?.apartment || "",
  entrance: locationStore.deliveryDetails?.entrance || "",
  floor: locationStore.deliveryDetails?.floor || "",
  doorCode: locationStore.deliveryDetails?.doorCode || "",
  comment: locationStore.deliveryDetails?.comment || "",
});

const lastAddress = ref(`${deliveryStreet.value}__${deliveryHouse.value}`);
const deliveryZoneError = ref("");

const GEO_PERMISSION_KEY = "geoPermission";
const SEARCH_MIN_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 120;
const REVERSE_DEBOUNCE_MS = 350;

let searchTimeout = null;
let reverseTimeout = null;
let leafletLoading = null;
let mapInstance = null;
let polygonsLayer = null;
let suggestionsController = null;
let reverseController = null;
let lastSearchId = 0;
let lastReverseId = 0;
let suppressReverseUntil = 0;
let isProgrammaticMove = false;

const searchCache = new Map();
const reverseCache = new Map();
const isAddressFocused = ref(false);
const preventBlurHide = ref(false);
const isSuggestionsLoading = ref(false);
const lastSearchedQuery = ref("");

const cityName = computed(() => locationStore.selectedCity?.name || "");
const showSuggestionsPanel = computed(() => {
  return Boolean(showSuggestions.value && (isSuggestionsLoading.value || addressSuggestions.value.length || canShowNoResults.value));
});
const canShowNoResults = computed(() => {
  const hasQuery = deliveryStreet.value.trim().length >= SEARCH_MIN_LENGTH;
  return Boolean(
    hasQuery && !isSuggestionsLoading.value && lastSearchedQuery.value === deliveryStreet.value.trim() && !addressSuggestions.value.length,
  );
});

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

function normalizeCoords(coords) {
  if (!coords) return null;
  const lat = Number(coords.lat);
  const lon = Number(coords.lon ?? coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, lng: lon };
}

async function ensureTariffs() {
  if (!locationStore.deliveryZone || !locationStore.deliveryCoords || !locationStore.selectedCity?.id) return;
  if (Array.isArray(locationStore.deliveryZone.tariffs) && locationStore.deliveryZone.tariffs.length > 0) return;
  try {
    const response = await addressesAPI.checkDeliveryZone(
      locationStore.deliveryCoords.lat,
      locationStore.deliveryCoords.lng,
      locationStore.selectedCity.id,
    );
    if (!response?.data?.available || !response?.data?.polygon) return;
    const zone = { ...response.data.polygon, tariffs: response.data.tariffs || [] };
    locationStore.setDeliveryZone(zone);
  } catch (error) {
    devError("Не удалось обновить тарифы доставки:", error);
  }
}

onMounted(async () => {
  locationStore.setDeliveryType("delivery");
  await loadCityPolygons();
  await initMap();
  const hasSavedCoords = Boolean(selectedLocation.value);
  if (!hasSavedCoords) {
    await requestInitialLocation();
  }

  const combinedAddress = buildCombinedAddress();
  if (combinedAddress && !selectedLocation.value) {
    const resolved = await geocodeAddress(combinedAddress);
    if (resolved) {
      selectedLocation.value = { lat: resolved.lat, lon: resolved.lon, lng: resolved.lon };
      setMapCenter(resolved.lat, resolved.lon, { animate: false, resolveAddress: false });
      mapAddressHint.value = resolved.label;
    }
  } else if (selectedLocation.value && !combinedAddress) {
    scheduleReverseFromCenter(selectedLocation.value.lat, selectedLocation.value.lon, true);
  }

  await ensureTariffs();
});

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (reverseTimeout) clearTimeout(reverseTimeout);
  if (suggestionsController) suggestionsController.abort();
  if (reverseController) reverseController.abort();

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  polygonsLayer = null;
});

function buildCombinedAddress() {
  const street = deliveryStreet.value.trim();
  const house = deliveryHouse.value.trim();
  if (street && house) {
    return cityName.value ? `${street}, ${house}, ${cityName.value}` : `${street}, ${house}`;
  }
  if (street) {
    return cityName.value ? `${street}, ${cityName.value}` : street;
  }
  return "";
}

function onAddressInput() {
  // Ручной ввод имеет приоритет: отменяем отложенный reverse, чтобы он не перезаписал поле.
  if (reverseTimeout) {
    clearTimeout(reverseTimeout);
    reverseTimeout = null;
  }
  if (reverseController) {
    reverseController.abort();
    reverseController = null;
  }
  lastReverseId += 1;

  deliveryZoneError.value = "";
  showSuggestions.value = true;
  selectedLocation.value = null;
  isSuggestionsLoading.value = false;

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  const query = deliveryStreet.value.trim();
  if (query.length < SEARCH_MIN_LENGTH) {
    addressSuggestions.value = [];
    lastSearchedQuery.value = "";
    return;
  }

  searchTimeout = setTimeout(() => {
    fetchAddressSuggestions(query);
  }, SEARCH_DEBOUNCE_MS);
}

function onAddressFocus() {
  isAddressFocused.value = true;
  showSuggestions.value = deliveryStreet.value.trim().length >= SEARCH_MIN_LENGTH;
  queueMapResize();
}

function onAddressBlur() {
  isAddressFocused.value = false;
  if (preventBlurHide.value) {
    preventBlurHide.value = false;
    return;
  }
  setTimeout(() => {
    if (!isAddressFocused.value) {
      showSuggestions.value = false;
    }
  }, 220);
  queueMapResize();
}

function onInputControlPointerDown() {
  preventBlurHide.value = true;
}

function queueMapResize() {
  setTimeout(() => {
    if (mapInstance) {
      mapInstance.invalidateSize({ debounceMoveend: true });
    }
  }, 120);
}

function getAddressInputElement() {
  return addressFieldRef.value?.$el?.querySelector?.("input");
}

function getStoredGeoPermission() {
  try {
    return localStorage.getItem(GEO_PERMISSION_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredGeoPermission(value) {
  try {
    if (value) {
      localStorage.setItem(GEO_PERMISSION_KEY, value);
    } else {
      localStorage.removeItem(GEO_PERMISSION_KEY);
    }
  } catch {
    // ignore
  }
}

async function requestInitialLocation() {
  const storedPermission = getStoredGeoPermission();
  if (storedPermission === "denied") {
    return;
  }

  if (!navigator.geolocation) return;
  try {
    const location = await locationStore.detectUserLocation();
    if (location) {
      setStoredGeoPermission("granted");
      setMapCenter(location.lat, location.lon, { animate: true, resolveAddress: !buildCombinedAddress() });
    }
  } catch (error) {
    if (error?.code === 1) {
      setStoredGeoPermission("denied");
    }
  }
}

function selectAddress(address) {
  hapticFeedback("light");
  deliveryStreet.value = address.label;
  deliveryZoneError.value = "";
  showSuggestions.value = false;
  addressSuggestions.value = [];
  selectedLocation.value = null;
  getAddressInputElement()?.blur();
}

function clearAddress() {
  onInputControlPointerDown();
  // После очистки игнорируем "долетевшие" reverse-ответы.
  if (reverseTimeout) {
    clearTimeout(reverseTimeout);
    reverseTimeout = null;
  }
  if (reverseController) {
    reverseController.abort();
    reverseController = null;
  }
  lastReverseId += 1;

  deliveryStreet.value = "";
  deliveryHouse.value = "";
  addressSuggestions.value = [];
  showSuggestions.value = false;
  isSuggestionsLoading.value = false;
  lastSearchedQuery.value = "";
  deliveryZoneError.value = "";
  selectedLocation.value = null;
  getAddressInputElement()?.focus({ preventScroll: true });
}

async function confirmAddress() {
  deliveryZoneError.value = "";
  const hasStreetAndHouse = Boolean(deliveryStreet.value.trim() && deliveryHouse.value.trim());
  const preferredAddress = hasStreetAndHouse ? buildCombinedAddress() : buildCombinedAddress() || mapAddressHint.value.trim();
  if (!preferredAddress) {
    hapticFeedback("error");
    return;
  }
  if (hasStreetAndHouse || !selectedLocation.value) {
    const resolved = await geocodeAddress(preferredAddress);
    if (!resolved) {
      hapticFeedback("error");
      showSuggestions.value = true;
      deliveryZoneError.value = "Не удалось определить координаты адреса";
      return;
    }
    mapAddressHint.value = resolved.label;
    selectedLocation.value = { lat: resolved.lat, lon: resolved.lon, lng: resolved.lon };
    setMapCenter(resolved.lat, resolved.lon, { animate: true, resolveAddress: false });
  }

  if (!locationStore.selectedCity?.id) {
    deliveryZoneError.value = "Сначала выберите город";
    hapticFeedback("error");
    return;
  }

  if (selectedLocation.value) {
    try {
      const lngValue = selectedLocation.value.lng ?? selectedLocation.value.lon;
      const response = await addressesAPI.checkDeliveryZone(selectedLocation.value.lat, lngValue, locationStore.selectedCity.id);

      if (!response.data?.available || !response.data?.polygon) {
        deliveryZoneError.value = response.data?.message || "Адрес не входит в зону доставки";
        locationStore.setDeliveryZone(null);
        hapticFeedback("error");
        return;
      }

      const zone = { ...response.data.polygon, tariffs: response.data.tariffs || [] };
      locationStore.setDeliveryZone(zone);
    } catch (error) {
      devError("Не удалось обновить зону доставки:", error);
      deliveryZoneError.value = "Не удалось проверить зону доставки";
      hapticFeedback("error");
      return;
    }
  }
  const addressToSave = hasStreetAndHouse ? `${deliveryStreet.value.trim()}, ${deliveryHouse.value.trim()}` : preferredAddress.trim();
  locationStore.setDeliveryAddress(addressToSave);
  locationStore.setDeliveryDetails({ ...deliveryDetails });
  locationStore.setDeliveryCoords({
    lat: selectedLocation.value.lat,
    lng: selectedLocation.value.lng ?? selectedLocation.value.lon,
    lon: selectedLocation.value.lng ?? selectedLocation.value.lon,
  });

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

  const initial = selectedLocation.value || cityCenter.value || { lat: 55.7522, lon: 37.6156 };
  mapInstance = L.map(mapContainerRef.value, {
    zoomControl: false,
    attributionControl: false,
    inertia: true,
  }).setView([initial.lat, initial.lon ?? initial.lng], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstance);
  polygonsLayer = L.layerGroup().addTo(mapInstance);
  renderCityPolygons();
  mapInstance.on("movestart", () => {
    if (!isAddressFocused.value) {
      showSuggestions.value = false;
    }
  });
  mapInstance.on("moveend", () => {
    if (isProgrammaticMove) {
      isProgrammaticMove = false;
      if (Date.now() < suppressReverseUntil) return;
    }
    if (Date.now() < suppressReverseUntil) return;
    const center = mapInstance.getCenter();
    selectedLocation.value = { lat: center.lat, lon: center.lng, lng: center.lng };
    scheduleReverseFromCenter(center.lat, center.lng, false);
  });

  if (selectedLocation.value) {
    setMapCenter(selectedLocation.value.lat, selectedLocation.value.lon ?? selectedLocation.value.lng, {
      animate: false,
      resolveAddress: false,
    });
  } else {
    selectedLocation.value = { lat: initial.lat, lon: initial.lon ?? initial.lng, lng: initial.lon ?? initial.lng };
    scheduleReverseFromCenter(initial.lat, initial.lon ?? initial.lng, true);
  }
}

async function loadCityPolygons() {
  if (!locationStore.selectedCity?.id) {
    cityPolygons.value = [];
    return;
  }
  try {
    const response = await addressesAPI.getCityPolygons(locationStore.selectedCity.id);
    cityPolygons.value = Array.isArray(response?.data?.polygons) ? response.data.polygons : [];
    renderCityPolygons();
  } catch (error) {
    cityPolygons.value = [];
    devError("Не удалось загрузить полигоны города:", error);
  }
}

function renderCityPolygons() {
  if (!mapInstance || !polygonsLayer || !window.L) return;
  const L = window.L;
  polygonsLayer.clearLayers();
  const selectedZoneId = Number(locationStore.deliveryZone?.id);

  cityPolygons.value.forEach((polygon) => {
    const rings = getGeometryRings(polygon?.polygon);
    if (!rings.length) return;

    const isSelected = Number(polygon?.id) === selectedZoneId;
    rings.forEach((ring) => {
      const points = ring
        .map((coord) => [Number(coord?.[0]), Number(coord?.[1])])
        .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
      if (points.length < 3) return;

      const shape = L.polygon(points, {
        color: isSelected ? "#f59e0b" : "#10b981",
        fillColor: isSelected ? "#f59e0b" : "#10b981",
        fillOpacity: isSelected ? 0.28 : 0.12,
        weight: isSelected ? 3 : 2,
      });
      shape.addTo(polygonsLayer);

      if (polygon?.name) {
        shape.bindTooltip(polygon.name, { direction: "center", sticky: true });
      }
    });
  });
}

function getGeometryRings(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") {
    const outerRing = geometry.coordinates[0];
    return Array.isArray(outerRing) ? [outerRing] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => polygon?.[0]).filter((ring) => Array.isArray(ring));
  }
  return [];
}

function setMapCenter(lat, lon, options = {}) {
  if (!mapInstance) return;
  const nextLat = Number(lat);
  const nextLon = Number(lon);
  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLon)) return;

  const { animate = true, resolveAddress = false } = options;
  isProgrammaticMove = true;
  suppressReverseUntil = Date.now() + 700;
  mapInstance.setView([nextLat, nextLon], mapInstance.getZoom(), { animate });
  selectedLocation.value = { lat: nextLat, lon: nextLon, lng: nextLon };

  if (resolveAddress) {
    scheduleReverseFromCenter(nextLat, nextLon, true);
  }
}

function scheduleReverseFromCenter(lat, lon, immediate = false) {
  if (isAddressFocused.value) return;
  if (reverseTimeout) {
    clearTimeout(reverseTimeout);
  }

  const requestId = ++lastReverseId;
  const run = async () => {
    const suggestion = await reverseGeocode(lat, lon);
    if (requestId !== lastReverseId || !suggestion?.label) return;
    mapAddressHint.value = suggestion.label;
    const parts = String(suggestion.label || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length >= 2 && /\d/.test(parts[parts.length - 1])) {
      deliveryHouse.value = parts[parts.length - 1];
      deliveryStreet.value = parts.slice(0, -1).join(", ");
    } else {
      deliveryStreet.value = suggestion.label;
      deliveryHouse.value = "";
    }

    // Привязываем центр карты к точке найденного адреса (например, к ближайшему дому),
    // чтобы центр-маркер и выбранный адрес всегда совпадали.
    const dLat = Math.abs(Number(suggestion.lat) - Number(lat));
    const dLon = Math.abs(Number(suggestion.lon) - Number(lon));
    if (dLat > 0.00002 || dLon > 0.00002) {
      setMapCenter(suggestion.lat, suggestion.lon, { animate: true, resolveAddress: false });
    }
  };

  if (immediate) {
    run();
    return;
  }

  reverseTimeout = setTimeout(run, REVERSE_DEBOUNCE_MS);
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

    setStoredGeoPermission("granted");
    setMapCenter(location.lat, location.lon, { animate: true, resolveAddress: true });
  } catch (error) {
    if (error?.code === 1) {
      setStoredGeoPermission("denied");
    }
    devError("Не удалось определить местоположение пользователя:", error);
  }
}

async function fetchAddressSuggestions(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    addressSuggestions.value = [];
    isSuggestionsLoading.value = false;
    lastSearchedQuery.value = "";
    return;
  }

  if (searchCache.has(normalized)) {
    addressSuggestions.value = searchCache.get(normalized) || [];
    isSuggestionsLoading.value = false;
    lastSearchedQuery.value = query.trim();
    showSuggestions.value = true;
    return;
  }

  const searchId = ++lastSearchId;
  isSuggestionsLoading.value = true;
  lastSearchedQuery.value = query.trim();
  if (suggestionsController) {
    suggestionsController.abort();
  }
  suggestionsController = new AbortController();

  try {
    const start = performance.now();
    if (!locationStore.selectedCity?.id) {
      addressSuggestions.value = [];
      isSuggestionsLoading.value = false;
      return;
    }
    const response = await addressesAPI.searchStreetDirectory(locationStore.selectedCity.id, query, 10, {
      signal: suggestionsController.signal,
    });
    if (searchId !== lastSearchId) return;

    const suggestions = normalizeStreetDirectoryItems(response?.data);
    addressSuggestions.value = suggestions;
    showSuggestions.value = true;
    isSuggestionsLoading.value = false;
    searchCache.set(normalized, suggestions);

    const elapsed = Math.round(performance.now() - start);
    devDebug(`Address suggestions: ${elapsed}ms`, { query: normalized, count: suggestions.length });
  } catch (error) {
    if (error?.name !== "CanceledError" && searchId === lastSearchId) {
      addressSuggestions.value = [];
      showSuggestions.value = true;
      isSuggestionsLoading.value = false;
      devError("Не удалось найти адрес:", error);
      return;
    }
    if (searchId === lastSearchId) {
      isSuggestionsLoading.value = false;
    }
  }
}

async function geocodeAddress(query) {
  try {
    const response = await addressesAPI.searchAddress({
      query,
      city: cityName.value || undefined,
      limit: 1,
      latitude: cityCenter.value?.lat,
      longitude: cityCenter.value?.lon,
      radius: 0.7,
    });

    const suggestions = normalizeGeocodeItems(response?.data);
    return suggestions[0] || null;
  } catch (error) {
    devError("Не удалось геокодировать адрес:", error);
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  const key = `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
  if (reverseCache.has(key)) {
    return reverseCache.get(key);
  }

  if (reverseController) {
    reverseController.abort();
  }
  reverseController = new AbortController();

  try {
    const start = performance.now();
    const response = await addressesAPI.reverseGeocode(lat, lon, { signal: reverseController.signal });
    const suggestion = normalizeReverseResult(response?.data);
    reverseCache.set(key, suggestion);

    const elapsed = Math.round(performance.now() - start);
    devDebug(`Reverse geocode: ${elapsed}ms`, { key, hasSuggestion: Boolean(suggestion?.label) });

    return suggestion;
  } catch (error) {
    if (error?.name !== "CanceledError") {
      devError("Не удалось выполнить обратное геокодирование:", error);
    }
    return null;
  }
}

function normalizeGeocodeItems(payload) {
  if (!payload) return [];

  if (Array.isArray(payload?.items)) {
    return payload.items.map(normalizeSuggestion).filter(Boolean);
  }

  if (payload?.lat !== undefined && (payload?.lon !== undefined || payload?.lng !== undefined)) {
    const single = normalizeSuggestion(payload);
    return single ? [single] : [];
  }

  return [];
}

function normalizeStreetDirectoryItems(payload) {
  if (!payload || !Array.isArray(payload?.items)) return [];
  return payload.items
    .map((item) => {
      const label = String(item?.name || item?.label || "").trim();
      if (!label) return null;
      return {
        id: String(item?.id || "").trim() || label.toLowerCase(),
        classifierId: String(item?.classifier_id || item?.classifierId || "").trim() || null,
        label,
        source: String(item?.source || payload?.source || "nominatim"),
      };
    })
    .filter(Boolean);
}

function normalizeReverseResult(payload) {
  if (!payload) return null;
  const normalized = normalizeSuggestion(payload);
  return normalized || null;
}

function normalizeSuggestion(item) {
  const lat = Number(item?.lat);
  const lon = Number(item?.lon ?? item?.lng);
  const label = String(item?.label || item?.formatted_address || "").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !label) {
    return null;
  }

  return { label, lat, lon };
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

watch([deliveryStreet, deliveryHouse], ([street, house]) => {
  const signature = `${street}__${house}`;
  if (signature !== lastAddress.value) {
    deliveryDetails.apartment = "";
    deliveryDetails.entrance = "";
    deliveryDetails.floor = "";
    deliveryDetails.doorCode = "";
    deliveryDetails.comment = "";
    lastAddress.value = signature;
  }
});

watch(
  () => locationStore.deliveryZone?.id,
  () => {
    renderCityPolygons();
  },
);

watch(
  () => locationStore.selectedCity?.id,
  async () => {
    searchCache.clear();
    addressSuggestions.value = [];
    lastSearchedQuery.value = "";
    await loadCityPolygons();
  },
);
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
  z-index: 18;
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
  pointer-events: none;
}

.map-info {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 16px;
  padding: 10px 14px;
  box-shadow: var(--shadow-md);
  max-width: 75%;
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
  pointer-events: auto;
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
  margin-top: -32px;
  background: var(--color-background);
  border-radius: var(--border-radius-xl);
  padding: 12px;
  z-index: 20;
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
  min-height: 46px;
  padding: 12px 48px 12px 14px;
  line-height: 1.35;
}

.address-input:focus {
  line-height: 1.35;
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
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
}

.suggestion:hover {
  background: var(--color-border);
}

.suggestion-meta {
  cursor: default;
  color: var(--color-text-secondary);
}

.error-message {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: var(--border-radius-md);
  background: #ffebee;
  color: #c62828;
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-semibold);
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
  gap: 8px;
  margin-bottom: 10px;
}

.details-grid-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.details-grid-two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-input {
  margin: 0;
}

.detail-textarea {
  margin-bottom: 10px;
  resize: none;
  min-height: 92px;
}

.floating-textarea {
  margin-bottom: 10px;
}

.floating-textarea .detail-textarea {
  margin-bottom: 0;
}

.primary-btn:hover {
  background: var(--color-primary-hover);
}

.primary-btn:active {
  transform: scale(0.98);
}
</style>
