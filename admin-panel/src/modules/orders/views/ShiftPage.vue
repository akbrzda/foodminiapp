<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <!-- Шапка страницы -->
    <ShiftHeader
      v-model:theme="themeValue"
      v-model:selected-branch-id="selectedBranchId"
      :branch-options="branchOptions"
      :shift-meta="shiftMeta"
      :active-orders-count="activeOrders.length"
      :delivering-count="deliveringCount"
      :total-orders-count="orders.length"
      @open-admin-panel="openAdminPanel"
    />

    <div class="border-b border-border bg-background/90 px-3 py-1.5 backdrop-blur lg:hidden">
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          :class="mobilePane === 'orders' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'"
          @click="mobilePane = 'orders'"
        >
          Заказы
        </button>
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          :class="mobilePane === 'map' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'"
          @click="mobilePane = 'map'"
        >
          Карта
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <!-- Список заказов -->
      <OrdersList
        ref="ordersListRef"
        v-show="mobilePane === 'orders' || !isMobileViewport"
        v-model:active-tab="activeTab"
        v-model:order-type-filter="orderTypeFilter"
        v-model:search-query="searchQuery"
        :debounced-search="debouncedSearch"
        :visible-orders="visibleOrders"
        :expanded-order-id="expandedOrderId"
        :recent-order-ids="recentOrderIds"
        :tabs="tabs"
        :can-manage-orders="canManageOrders"
        @clear-search="clearSearch"
        @toggle-order="toggleOrder"
        @change-status="changeStatus"
        @open-cancel-dialog="openCancelDialog"
        @set-order-ref="setOrderRef"
      />

      <!-- Карта -->
      <OrderMap
        v-show="mobilePane === 'map' || !isMobileViewport"
        ref="orderMapRef"
        :polygons-visible="polygonsVisible"
        @zoom-in="zoomInMap"
        @zoom-out="zoomOutMap"
        @toggle-polygons="togglePolygons"
        @center-on-branch="centerOnBranch"
      />
    </div>

    <!-- Диалог выбора филиала -->
    <BranchSelectionDialog
      :open="branchDialogOpen"
      v-model:selected-branch-id="selectedBranchId"
      :branch-options="branchOptions"
      @confirm="closeBranchDialog"
    />

    <!-- Модалка отмены заказа -->
    <OrderStatusModal
      v-model:open="cancelDialog.open"
      :order="cancelDialog.order"
      :loading="cancelDialog.loading"
      @confirm="confirmCancel"
      @close="cancelDialog.open = false"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { devError } from "@/shared/utils/logger";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useTheme } from "@/shared/composables/useTheme.js";
import { useQueryTab } from "@/shared/composables/useQueryTab.js";
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";
import { buildPolygonBalloonContent } from "@/shared/utils/polygonBalloon.js";
import ShiftHeader from "@/modules/orders/components/ShiftHeader.vue";
import OrdersList from "@/modules/orders/components/OrdersList.vue";
import OrderMap from "@/modules/orders/components/OrderMap.vue";
import BranchSelectionDialog from "@/modules/orders/components/BranchSelectionDialog.vue";
import OrderStatusModal from "@/modules/orders/components/OrderStatusModal.vue";

const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const authStore = useAuthStore();
const { showErrorNotification, showNewOrderNotification, showSuccessNotification } = useNotifications();
const { theme, setTheme } = useTheme();

// Состояние темы
const themeValue = computed({
  get: () => theme.value,
  set: (value) => setTheme(value),
});

// Refs компонентов
const ordersListRef = ref(null);
const orderMapRef = ref(null);

// Состояние заказов
const orders = ref([]);
const recentOrderIds = ref(new Set());
const activeTab = useQueryTab({
  defaultValue: "active",
  allowedValues: ["active", "completed", "search"],
});
const orderTypeFilter = ref("all");
const searchQuery = ref("");
const debouncedSearch = ref("");
const expandedOrderId = ref(null);
const selectedBranchId = ref("");
const shiftMeta = ref(null);
const mobilePane = ref("orders");
const isMobileViewport = ref(false);
const branchDialogOpen = ref(false);
const storedBranchId = ref("");
const cancelDialog = ref({ open: false, order: null, loading: false });
let searchTimer = null;
let shiftTimer = null;
let wsReloadTimer = null;
let viewportResizeHandler = null;
const LOCAL_STATUS_ECHO_TTL_MS = 7000;
const localStatusUpdates = new Map();

// Состояние карты
const orderRefs = new Map();
let yandexMaps = null;
let mapInstance = null;
let polygonsLayer = null;
let branchMarker = null;
let staticBranchMarker = null;
let deliveryMarker = null;
let routeLine = null;
const polygonsVisible = ref(localStorage.getItem("shift_polygons_visible") !== "false");
const mapAccentColor = "#ffd200";
const mapAccentFill = "rgba(255, 210, 0, 0.26)";

const createShiftMarkerSvg = (minutes = 15) =>
  `
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
  <text x="24" y="31" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="18" font-weight="700">Я</text>
</svg>`.trim();

const createShiftMarkerOptions = (minutes = 15) => {
  const svg = createShiftMarkerSvg(minutes);
  const href = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    iconLayout: "default#image",
    iconImageHref: href,
    iconImageSize: [48, 73],
    iconImageOffset: [-24, -73],
  };
};

// Табы для списка заказов
const tabs = computed(() => [
  { value: "active", label: "Активные", badge: activeOrders.value.length },
  { value: "completed", label: "Завершенные", badge: deliveringCount.value },
  { value: "search", label: "Поиск", badge: null },
]);
const canManageOrders = computed(() => authStore.hasPermission("orders.manage"));

// Опции филиалов
const branchOptions = computed(() => {
  return referenceStore.branches.map((branch) => {
    const city = referenceStore.cities.find((item) => item.id === branch.city_id);
    return {
      ...branch,
      label: `${branch.name}${city ? `, ${city.name}` : ""}`,
    };
  });
});

const branchesReady = computed(() => {
  if (referenceStore.cities.length === 0) return false;
  return referenceStore.cities.every((city) => Array.isArray(referenceStore.branchesByCity?.[city.id]));
});

const resolveBranchName = (polygon) => {
  const directName = polygon?.branch_name?.trim?.();
  if (directName) return directName;
  const polygonBranchId = polygon?.branch_id;
  if (polygonBranchId != null) {
    const byId = referenceStore.branches.find((branch) => String(branch.id) === String(polygonBranchId));
    if (byId?.name) return byId.name;
  }
  const selectedBranch = branchOptions.value.find((branch) => String(branch.id) === String(selectedBranchId.value));
  return selectedBranch?.name || "Филиал не указан";
};

// Фильтрация заказов
const filteredOrders = computed(() => {
  let list = [...orders.value];
  if (orderTypeFilter.value !== "all") {
    list = list.filter((order) => order.order_type === orderTypeFilter.value);
  }
  return list;
});

const activeOrders = computed(() => filteredOrders.value.filter((order) => ["pending", "confirmed", "preparing", "ready"].includes(order.status)));

const completedOrders = computed(() => filteredOrders.value.filter((order) => ["delivering", "completed", "cancelled"].includes(order.status)));

const deliveringCount = computed(() => completedOrders.value.filter((order) => order.status === "delivering").length);

const searchOrders = computed(() => {
  const query = debouncedSearch.value.trim().toLowerCase();
  if (!query) return filteredOrders.value;
  return filteredOrders.value.filter((order) => {
    const numberMatch = order.order_number?.toString().startsWith(query);
    const phoneMatch = order.user_phone?.toString().includes(query);
    const addressMatch = order.delivery_street?.toLowerCase().includes(query) || order.delivery_house?.toLowerCase().includes(query);
    return numberMatch || phoneMatch || addressMatch;
  });
});

const visibleOrders = computed(() => {
  if (activeTab.value === "active") return activeOrders.value;
  if (activeTab.value === "completed") return completedOrders.value;
  return searchOrders.value;
});

// Функции управления филиалами
const readStoredBranch = () => {
  storedBranchId.value = localStorage.getItem("shift_selected_branch_id") || "";
};

const restoreBranchSelection = () => {
  if (!branchesReady.value || selectedBranchId.value) return;
  if (storedBranchId.value) {
    const exists = branchOptions.value.some((branch) => String(branch.id) === String(storedBranchId.value));
    if (exists) {
      selectedBranchId.value = String(storedBranchId.value);
      return;
    }
  }
  if (branchOptions.value.length === 1) {
    selectedBranchId.value = String(branchOptions.value[0].id);
    return;
  }
  if (branchOptions.value.length > 0) {
    branchDialogOpen.value = true;
  }
};

const closeBranchDialog = () => {
  if (selectedBranchId.value) {
    branchDialogOpen.value = false;
  }
};

const updateViewportState = () => {
  if (typeof window === "undefined") return;
  isMobileViewport.value = window.matchMedia("(max-width: 1023px)").matches;
};

const openAdminPanel = () => {
  window.open("/dashboard", "_blank");
};

// Функции поиска
const clearSearch = () => {
  searchQuery.value = "";
  debouncedSearch.value = "";
  focusSearchInput();
};

const focusSearchInput = () => {
  nextTick(() => {
    const el = ordersListRef.value?.searchInputRef?.$el || ordersListRef.value?.searchInputRef;
    el?.focus?.();
  });
};

const setOrderRef = (orderId, element) => {
  if (!element) {
    orderRefs.delete(orderId);
    return;
  }
  orderRefs.set(orderId, element);
};

const makeOrderStatusKey = (orderId, status) => `${String(orderId)}:${String(status || "")}`;

const rememberLocalStatusUpdate = (orderId, status) => {
  const key = makeOrderStatusKey(orderId, status);
  const expiresAt = Date.now() + LOCAL_STATUS_ECHO_TTL_MS;
  localStatusUpdates.set(key, expiresAt);
};

const isLocalStatusEcho = (orderId, status) => {
  const key = makeOrderStatusKey(orderId, status);
  const expiresAt = localStatusUpdates.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    localStatusUpdates.delete(key);
    return false;
  }
  localStatusUpdates.delete(key);
  return true;
};

const cleanupLocalStatusEchoes = () => {
  const now = Date.now();
  for (const [key, expiresAt] of localStatusUpdates.entries()) {
    if (expiresAt < now) {
      localStatusUpdates.delete(key);
    }
  }
};

// Функции управления заказами
const parseOrderDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const hasTimezone = value.includes("Z") || value.includes("T") || /[+-]\d{2}:?\d{2}$/.test(value);
    if (!hasTimezone) {
      const normalized = value.replace(" ", "T");
      const parsed = new Date(`${normalized}Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toggleOrder = (order) => {
  if (expandedOrderId.value === order.id) {
    expandedOrderId.value = null;
    clearOrderMap();
    return;
  }
  ensureOrderDetails(order).then(() => {
    expandedOrderId.value = order.id;
    showOrderOnMap(order);
    if (isMobileViewport.value && order.order_type === "delivery") {
      mobilePane.value = "map";
    }
  });
};

const ensureOrderDetails = async (order) => {
  if (order.items?.length) return;
  try {
    const response = await api.get(`/api/orders/admin/${order.id}`);
    const details = response.data.order;
    orders.value = orders.value.map((item) => (item.id === order.id ? { ...item, ...details } : item));
  } catch (error) {
    devError("Ошибка загрузки деталей заказа:", error);
  }
};

const changeStatus = async (order) => {
  if (!canManageOrders.value) return;
  const flowDelivery = {
    pending: { status: "confirmed", label: "Принять заказ" },
    confirmed: { status: "preparing", label: "Отправить в готовку" },
    preparing: { status: "ready", label: "Готов к выдаче" },
    ready: { status: "delivering", label: "Передать курьеру" },
    delivering: { status: "completed", label: "Заказ доставлен" },
  };
  const flowPickup = {
    pending: { status: "confirmed", label: "Принять заказ" },
    confirmed: { status: "preparing", label: "Отправить в готовку" },
    preparing: { status: "ready", label: "Готов к выдаче" },
    ready: { status: "completed", label: "Выдать заказ" },
  };
  const flow = order.order_type === "pickup" ? flowPickup : flowDelivery;
  const next = flow[order.status] || null;

  if (!next) return;
  try {
    const response = await api.put(`/api/orders/admin/${order.id}/status`, { status: next.status });
    const updated = response.data?.order;
    if (updated?.id) {
      rememberLocalStatusUpdate(updated.id, updated.status);
      updateOrderStatus(updated.id, updated.status);
    } else {
      rememberLocalStatusUpdate(order.id, next.status);
      updateOrderStatus(order.id, next.status);
    }
    showSuccessNotification(`Статус заказа #${order.order_number} обновлен`);
  } catch (error) {
    const statusCode = error?.response?.status;
    const updatedOrder = error?.response?.data?.order;
    if (statusCode === 409 && updatedOrder?.id) {
      updateOrderStatus(updatedOrder.id, updatedOrder.status);
      showSuccessNotification(`Статус заказа #${order.order_number} уже изменен`);
      return;
    }
    devError("Ошибка смены статуса:", error);
    showErrorNotification("Не удалось обновить статус заказа");
  }
};

const openCancelDialog = (order) => {
  if (!canManageOrders.value) return;
  cancelDialog.value = { open: true, order, loading: false };
};

const confirmCancel = async () => {
  if (!canManageOrders.value) return;
  if (!cancelDialog.value.order) return;
  cancelDialog.value.loading = true;
  try {
    await api.put(`/api/orders/admin/${cancelDialog.value.order.id}/cancel`);
    rememberLocalStatusUpdate(cancelDialog.value.order.id, "cancelled");
    updateOrderStatus(cancelDialog.value.order.id, "cancelled");
    showSuccessNotification(`Заказ #${cancelDialog.value.order.order_number} отменен`);
    cancelDialog.value.open = false;
  } catch (error) {
    devError("Ошибка отмены заказа:", error);
    showErrorNotification("Не удалось отменить заказ");
  } finally {
    cancelDialog.value.loading = false;
  }
};

const updateOrderStatus = (orderId, newStatus) => {
  orders.value = orders.value.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order));
  expandedOrderId.value = null;
  clearOrderMap();
};

const loadOrders = async () => {
  if (!selectedBranchId.value) return;
  try {
    const response = await api.get("/api/orders/admin/shift", {
      params: { branch_id: selectedBranchId.value },
    });
    orders.value = response.data.orders || [];
    ordersStore.trackOrders(orders.value);
    expandedOrderId.value = null;
    clearOrderMap();
    shiftMeta.value = response.data.shift || null;
    scheduleShiftReload();
  } catch (error) {
    devError("Ошибка загрузки заказов смены:", error);
    showErrorNotification("Не удалось загрузить заказы смены");
  }
};

const scheduleShiftReload = () => {
  if (shiftTimer) {
    clearTimeout(shiftTimer);
  }
  if (!shiftMeta.value?.end_at) return;
  const endTime = new Date(shiftMeta.value.end_at).getTime();
  const delay = Math.max(0, endTime - Date.now() + 1000);
  shiftTimer = setTimeout(() => loadOrders(), delay);
};

// Функции управления картой
const ensureYandexMaps = async () => {
  if (yandexMaps) return yandexMaps;
  yandexMaps = await loadYandexMaps();
  return yandexMaps;
};

const calcBounds = (points) => {
  if (!Array.isArray(points) || !points.length) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLat) || !Number.isFinite(maxLng)) {
    return null;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
};

const isValidLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const calcCenter = (coords = []) => {
  if (!coords.length) return null;
  const sum = coords.reduce((acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
};

const distanceSq = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
};

const getReferenceCenter = () => {
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  const branchLat = Number(branch?.latitude);
  const branchLng = Number(branch?.longitude);
  if (Number.isFinite(branchLat) && Number.isFinite(branchLng)) {
    return { lat: branchLat, lng: branchLng };
  }
  const city = referenceStore.cities.find((item) => item.id === branch?.city_id);
  const cityLat = Number(city?.latitude);
  const cityLng = Number(city?.longitude);
  if (Number.isFinite(cityLat) && Number.isFinite(cityLng)) {
    return { lat: cityLat, lng: cityLng };
  }
  if (mapInstance) {
    const center = mapInstance.getCenter();
    return { lat: Number(center?.[0]), lng: Number(center?.[1]) };
  }
  return null;
};

const toYandexPolygonCoords = (coords = [], referenceCenter = null) => {
  const points = coords.filter((coord) => Array.isArray(coord) && coord.length >= 2);
  const geoJsonOrder = points.map((coord) => [Number(coord[1]), Number(coord[0])]).filter(([lat, lng]) => isValidLatLng(lat, lng));
  const legacyOrder = points.map((coord) => [Number(coord[0]), Number(coord[1])]).filter(([lat, lng]) => isValidLatLng(lat, lng));

  if (!legacyOrder.length) return geoJsonOrder;
  if (!geoJsonOrder.length) return legacyOrder;
  if (!referenceCenter) return geoJsonOrder;

  const geoJsonCenter = calcCenter(geoJsonOrder);
  const legacyCenter = calcCenter(legacyOrder);
  return distanceSq(geoJsonCenter, referenceCenter) <= distanceSq(legacyCenter, referenceCenter) ? geoJsonOrder : legacyOrder;
};

const togglePolygons = () => {
  polygonsVisible.value = !polygonsVisible.value;
  localStorage.setItem("shift_polygons_visible", polygonsVisible.value ? "true" : "false");
  updatePolygonsVisibility();
};

const updatePolygonsVisibility = () => {
  if (!mapInstance || !polygonsLayer) return;
  if (polygonsVisible.value) {
    mapInstance.geoObjects.add(polygonsLayer);
  } else {
    mapInstance.geoObjects.remove(polygonsLayer);
  }
};

const initMap = async () => {
  const ymaps = await ensureYandexMaps();
  const mapContainer = orderMapRef.value?.mapContainerRef?.value || orderMapRef.value?.mapContainerRef;
  if (!mapContainer) return;
  if (mapInstance) {
    mapInstance.destroy();
    mapInstance = null;
  }
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  const center = branch?.latitude && branch?.longitude ? [branch.latitude, branch.longitude] : [55.751244, 37.618423];
  mapInstance = new ymaps.Map(
    mapContainer,
    {
      center,
      zoom: 16,
      controls: [],
    },
    {
      suppressMapOpenBlock: true,
    },
  );
  // Дополнительно отключаем все стандартные контролы/блоки Яндекс на уровне инстанса карты.
  mapInstance.options.set("suppressMapOpenBlock", true);
  [
    "routeButtonControl",
    "searchControl",
    "trafficControl",
    "typeSelector",
    "fullscreenControl",
    "zoomControl",
    "geolocationControl",
    "rulerControl",
  ].forEach((controlName) => {
    try {
      mapInstance.controls.remove(controlName);
    } catch (_error) {
      // Контрол может отсутствовать в конкретной сборке API.
    }
  });
  renderBranchMarker();
};

const centerOnBranch = () => {
  if (!mapInstance) return;
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  const city = referenceStore.cities.find((item) => item.id === branch?.city_id);
  const lat = branch?.latitude || city?.latitude;
  const lng = branch?.longitude || city?.longitude;
  if (!lat || !lng) return;
  if (isMobileViewport.value) {
    mobilePane.value = "map";
  }
  mapInstance.setCenter([lat, lng], 16, { duration: 180 });
};
const zoomInMap = () => {
  if (!mapInstance) return;
  mapInstance.setZoom(mapInstance.getZoom() + 1, { duration: 120 });
};
const zoomOutMap = () => {
  if (!mapInstance) return;
  mapInstance.setZoom(mapInstance.getZoom() - 1, { duration: 120 });
};

const renderBranchMarker = () => {
  if (!mapInstance || !yandexMaps) return;
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  if (!branch?.latitude || !branch?.longitude) return;
  if (staticBranchMarker) {
    mapInstance.geoObjects.remove(staticBranchMarker);
  }
  staticBranchMarker = new yandexMaps.Placemark([Number(branch.latitude), Number(branch.longitude)], {}, createShiftMarkerOptions(15));
  mapInstance.geoObjects.add(staticBranchMarker);
};

const loadPolygons = async () => {
  if (!selectedBranchId.value || !mapInstance || !yandexMaps) return;
  try {
    const response = await api.get(`/api/polygons/branch/${selectedBranchId.value}`);
    const polygons = response.data.polygons || [];
    if (polygonsLayer) {
      mapInstance.geoObjects.remove(polygonsLayer);
      polygonsLayer = null;
    }
    polygonsLayer = new yandexMaps.GeoObjectCollection();
    polygons.forEach((polygon) => {
      const ring = polygon?.polygon?.coordinates?.[0];
      if (!Array.isArray(ring) || ring.length < 3) return;
      const latLngRing = toYandexPolygonCoords(ring, getReferenceCenter());
      if (latLngRing.length < 3) return;
      const name = polygon.name || `Полигон #${polygon.id || ""}`;
      const branchName = resolveBranchName(polygon);
      const deliveryTime = polygon.delivery_time || 30;
      const isBlocked = Boolean(polygon.is_blocked);
      const isInactive = polygon.is_active === 0 || polygon.is_active === false;
      const popupContent = buildPolygonBalloonContent(
        {
          ...polygon,
          name,
          branch_name: branchName,
          delivery_time: deliveryTime,
        },
        {
          fallbackName: "Полигон",
          fallbackBranchName: "Филиал не указан",
          useTariffBasedLabels: true,
          isBlocked,
          isInactive,
        },
      );
      const polygonObject = new yandexMaps.Polygon(
        [latLngRing],
        {
          balloonContentBody: popupContent,
        },
        {
          fillColor: mapAccentFill,
          strokeColor: mapAccentColor,
          strokeWidth: 2,
          fillOpacity: 0.35,
          opacity: 0.85,
          interactivityModel: "default#geoObject",
        },
      );
      polygonsLayer.add(polygonObject);
    });
    updatePolygonsVisibility();
  } catch (error) {
    devError("Ошибка загрузки полигонов:", error);
  }
};

// Функции отображения заказов на карте
const clearOrderMap = () => {
  if (branchMarker) {
    mapInstance?.geoObjects?.remove(branchMarker);
    branchMarker = null;
  }
  if (deliveryMarker) {
    mapInstance?.geoObjects?.remove(deliveryMarker);
    deliveryMarker = null;
  }
  if (routeLine) {
    mapInstance?.geoObjects?.remove(routeLine);
    routeLine = null;
  }
};

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalizeDeliveryCoords = (order) => {
  const rawLat = Number(order.delivery_latitude);
  const rawLng = Number(order.delivery_longitude);
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
    return null;
  }
  const swapped = { lat: rawLng, lng: rawLat };
  if (Math.abs(rawLat) > 90 || Math.abs(rawLng) > 180) {
    return swapped;
  }
  const branchLat = Number(order.branch_latitude);
  const branchLng = Number(order.branch_longitude);
  if (Number.isFinite(branchLat) && Number.isFinite(branchLng)) {
    const directDistance = calculateDistanceKm(rawLat, rawLng, branchLat, branchLng);
    const swappedDistance = calculateDistanceKm(swapped.lat, swapped.lng, branchLat, branchLng);
    if (directDistance > 1000 && swappedDistance < directDistance) {
      return swapped;
    }
  }
  return { lat: rawLat, lng: rawLng };
};

const showOrderOnMap = (order) => {
  if (!mapInstance || !yandexMaps) return;
  if (order.order_type !== "delivery") {
    clearOrderMap();
    return;
  }
  if (order.branch_latitude == null || order.branch_longitude == null || order.delivery_latitude == null || order.delivery_longitude == null) {
    clearOrderMap();
    return;
  }
  const branchLat = Number(order.branch_latitude);
  const branchLng = Number(order.branch_longitude);
  const normalizedDelivery = normalizeDeliveryCoords(order);
  if (!normalizedDelivery || !Number.isFinite(branchLat) || !Number.isFinite(branchLng)) {
    clearOrderMap();
    return;
  }
  const deliveryLat = normalizedDelivery.lat;
  const deliveryLng = normalizedDelivery.lng;
  clearOrderMap();
  branchMarker = new yandexMaps.Placemark([branchLat, branchLng], {}, createShiftMarkerOptions(15));
  deliveryMarker = new yandexMaps.Placemark([deliveryLat, deliveryLng], {}, createShiftMarkerOptions(15));
  routeLine = new yandexMaps.Polyline(
    [
      [branchLat, branchLng],
      [deliveryLat, deliveryLng],
    ],
    {},
    {
      strokeColor: mapAccentColor,
      strokeWidth: 3,
      strokeStyle: "shortdash",
      opacity: 0.9,
    },
  );
  mapInstance.geoObjects.add(branchMarker);
  mapInstance.geoObjects.add(deliveryMarker);
  mapInstance.geoObjects.add(routeLine);
  const bounds = calcBounds([
    [branchLat, branchLng],
    [deliveryLat, deliveryLng],
  ]);
  if (bounds) {
    mapInstance.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
  }
  const scrollToOrder = () => {
    const element = orderRefs.get(order.id);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  branchMarker.events.add("click", scrollToOrder);
  deliveryMarker.events.add("click", scrollToOrder);
};

// Обработка событий WebSocket
const playNewOrderSound = () => {
  if (document.visibilityState !== "visible") return;
  const audio = new Audio("/sounds/new-order.mp3");
  audio.volume = 0.6;
  audio.play().catch((error) => {
    console.warn("Не удалось воспроизвести звук нового заказа", error);
  });
};

const scheduleWsOrdersReload = () => {
  if (!selectedBranchId.value) return;
  if (wsReloadTimer) {
    clearTimeout(wsReloadTimer);
  }
  wsReloadTimer = setTimeout(async () => {
    wsReloadTimer = null;
    await loadOrders();
  }, 400);
};

const handleOrderEvent = (payload) => {
  cleanupLocalStatusEchoes();
  if (!payload) return;
  if (payload.type === "new-order") {
    const order = payload.data;
    if (!order || order.branch_id?.toString() !== selectedBranchId.value?.toString()) return;
    if (orders.value.some((existing) => existing.id === order.id)) return;
    order.items = order.items || [];
    if (shiftMeta.value?.start_at && shiftMeta.value?.end_at) {
      const createdAtDate = parseOrderDate(order.created_at);
      if (!createdAtDate) {
        return;
      }
      const createdAt = createdAtDate.getTime();
      const startAt = new Date(shiftMeta.value.start_at).getTime();
      const endAt = new Date(shiftMeta.value.end_at).getTime();
      if (createdAt < startAt || createdAt >= endAt) return;
    }
    orders.value = [order, ...orders.value];
    const nextRecent = new Set(recentOrderIds.value);
    nextRecent.add(order.id);
    recentOrderIds.value = nextRecent;
    setTimeout(() => {
      const updated = new Set(recentOrderIds.value);
      updated.delete(order.id);
      recentOrderIds.value = updated;
    }, 15000);
    showNewOrderNotification(order);
    playNewOrderSound();
    scheduleWsOrdersReload();
  }
  if (payload.type === "order-status-updated") {
    const { orderId, newStatus, branchId } = payload.data || {};
    const orderIdKey = orderId != null ? String(orderId) : "";
    if (!orderIdKey) return;
    if (branchId && branchId.toString() !== selectedBranchId.value?.toString()) return;
    const exists = orders.value.some((order) => String(order.id) === orderIdKey);
    if (!exists) return;
    orders.value = orders.value.map((order) => (String(order.id) === orderIdKey ? { ...order, status: newStatus } : order));
    if (!isLocalStatusEcho(orderIdKey, newStatus)) {
      showSuccessNotification(`Статус заказа #${orderIdKey} обновлен`);
    }
    if (String(expandedOrderId.value || "") === orderIdKey) {
      expandedOrderId.value = null;
      clearOrderMap();
    }
    scheduleWsOrdersReload();
  }
};

// Watchers
watch(searchQuery, () => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    debouncedSearch.value = searchQuery.value;
  }, 300);
});

watch(activeTab, (value) => {
  if (value === "search") {
    focusSearchInput();
  }
});

watch(
  selectedBranchId,
  async (next, prev) => {
    if (prev) {
      ordersStore.leaveRoom(`branch-${prev}-orders`);
    }
    if (next) {
      localStorage.setItem("shift_selected_branch_id", String(next));
      await loadOrders();
      await initMap();
      if (isMobileViewport.value) {
        mobilePane.value = "orders";
      }
      renderBranchMarker();
      await loadPolygons();
      ordersStore.joinRoom(`branch-${next}-orders`);
      branchDialogOpen.value = false;
    } else {
      localStorage.removeItem("shift_selected_branch_id");
      orders.value = [];
      clearOrderMap();
      branchDialogOpen.value = true;
    }
  },
  { immediate: false },
);

watch(
  () => ordersStore.lastEvent,
  (payload) => {
    handleOrderEvent(payload);
  },
);
watch(
  () => mobilePane.value,
  (pane) => {
    if (pane !== "map") return;
    nextTick(() => {
      mapInstance?.container?.fitToViewport?.();
    });
  },
);
watch(
  () => isMobileViewport.value,
  (isMobile) => {
    if (!isMobile) {
      mobilePane.value = "orders";
    }
    nextTick(() => {
      mapInstance?.container?.fitToViewport?.();
    });
  },
);

// Lifecycle хуки
onMounted(async () => {
  updateViewportState();
  viewportResizeHandler = () => updateViewportState();
  window.addEventListener("resize", viewportResizeHandler);
  readStoredBranch();
  await referenceStore.fetchCitiesAndBranches();
  restoreBranchSelection();
  ordersStore.connectWebSocket();
});

watch(
  () => branchOptions.value.length,
  () => {
    restoreBranchSelection();
  },
);

watch(
  () => branchesReady.value,
  () => {
    restoreBranchSelection();
  },
);

onBeforeUnmount(() => {
  localStatusUpdates.clear();
  if (viewportResizeHandler) {
    window.removeEventListener("resize", viewportResizeHandler);
    viewportResizeHandler = null;
  }
  if (shiftTimer) {
    clearTimeout(shiftTimer);
  }
  if (wsReloadTimer) {
    clearTimeout(wsReloadTimer);
    wsReloadTimer = null;
  }
  if (selectedBranchId.value) {
    ordersStore.leaveRoom(`branch-${selectedBranchId.value}-orders`);
  }
  if (mapInstance) {
    mapInstance.destroy();
    mapInstance = null;
  }
  yandexMaps = null;
});
</script>
