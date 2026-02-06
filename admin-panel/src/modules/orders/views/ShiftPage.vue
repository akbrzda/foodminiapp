<template>
  <div class="min-h-screen min-w-[1280px] bg-background text-foreground">
    <!-- Шапка страницы -->
    <ShiftHeader
      v-model:theme="themeValue"
      v-model:selected-branch-id="selectedBranchId"
      :branch-options="branchOptions"
      @open-admin-panel="openAdminPanel"
    />

    <div class="flex h-[calc(100vh-72px)]">
      <!-- Список заказов -->
      <OrdersList
        ref="ordersListRef"
        v-model:active-tab="activeTab"
        v-model:order-type-filter="orderTypeFilter"
        v-model:search-query="searchQuery"
        :debounced-search="debouncedSearch"
        :visible-orders="visibleOrders"
        :expanded-order-id="expandedOrderId"
        :recent-order-ids="recentOrderIds"
        :tabs="tabs"
        @clear-search="clearSearch"
        @toggle-order="toggleOrder"
        @change-status="changeStatus"
        @open-cancel-dialog="openCancelDialog"
        @set-order-ref="setOrderRef"
      />

      <!-- Карта -->
      <OrderMap ref="orderMapRef" :polygons-visible="polygonsVisible" @toggle-polygons="togglePolygons" @center-on-branch="centerOnBranch" />
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
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { devError } from "@/shared/utils/logger";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useTheme } from "@/shared/composables/useTheme.js";
import { createMarkerIcon, getMapColor, getTileLayer } from "@/shared/utils/leaflet.js";
import ShiftHeader from "@/modules/orders/components/ShiftHeader.vue";
import OrdersList from "@/modules/orders/components/OrdersList.vue";
import OrderMap from "@/modules/orders/components/OrderMap.vue";
import BranchSelectionDialog from "@/modules/orders/components/BranchSelectionDialog.vue";
import OrderStatusModal from "@/modules/orders/components/OrderStatusModal.vue";

const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showErrorNotification, showNewOrderNotification, showSuccessNotification } = useNotifications();
const { theme, setTheme, resolvedTheme } = useTheme();

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
const activeTab = ref("active");
const orderTypeFilter = ref("all");
const searchQuery = ref("");
const debouncedSearch = ref("");
const expandedOrderId = ref(null);
const selectedBranchId = ref("");
const shiftMeta = ref(null);
const branchDialogOpen = ref(false);
const storedBranchId = ref("");
const cancelDialog = ref({ open: false, order: null, loading: false });
let searchTimer = null;
let shiftTimer = null;

// Состояние карты
const orderRefs = new Map();
let mapInstance = null;
let polygonsLayer = null;
let branchMarker = null;
let staticBranchMarker = null;
let deliveryMarker = null;
let routeLine = null;
let tileLayer = null;
const polygonsVisible = ref(localStorage.getItem("shift_polygons_visible") !== "false");

// Вычисляемые свойства для карты
const mapAccentColor = computed(() => getMapColor(resolvedTheme.value, "accent"));
const mapAccentFill = computed(() => getMapColor(resolvedTheme.value, "accentFill"));

// Табы для списка заказов
const tabs = computed(() => [
  { value: "active", label: "Активные", badge: activeOrders.value.length },
  { value: "completed", label: "Завершенные", badge: deliveringCount.value },
  { value: "search", label: "Поиск", badge: null },
]);

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
      updateOrderStatus(updated.id, updated.status);
    } else {
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
  cancelDialog.value = { open: true, order, loading: false };
};

const confirmCancel = async () => {
  if (!cancelDialog.value.order) return;
  cancelDialog.value.loading = true;
  try {
    await api.put(`/api/orders/admin/${cancelDialog.value.order.id}/cancel`);
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
const togglePolygons = () => {
  polygonsVisible.value = !polygonsVisible.value;
  localStorage.setItem("shift_polygons_visible", polygonsVisible.value ? "true" : "false");
  updatePolygonsVisibility();
};

const updatePolygonsVisibility = () => {
  if (!mapInstance || !polygonsLayer) return;
  if (polygonsVisible.value) {
    polygonsLayer.addTo(mapInstance);
    const bounds = polygonsLayer.getBounds();
    if (bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [24, 24] });
    }
  } else {
    polygonsLayer.remove();
  }
};

const initMap = () => {
  const mapContainer = orderMapRef.value?.mapContainerRef;
  if (!mapContainer) return;
  if (mapInstance) {
    mapInstance.remove();
  }
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  const center = branch?.latitude && branch?.longitude ? [branch.latitude, branch.longitude] : [55.751244, 37.618423];
  mapInstance = L.map(mapContainer, { zoomControl: true, attributionControl: false }).setView(center, 12);
  tileLayer = getTileLayer(resolvedTheme.value, { maxZoom: 18 }).addTo(mapInstance);
  renderBranchMarker();
};

const centerOnBranch = () => {
  if (!mapInstance) return;
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  const city = referenceStore.cities.find((item) => item.id === branch?.city_id);
  const lat = branch?.latitude || city?.latitude;
  const lng = branch?.longitude || city?.longitude;
  if (!lat || !lng) return;
  mapInstance.setView([lat, lng], 12, { animate: true });
};

const renderBranchMarker = () => {
  if (!mapInstance) return;
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  if (!branch?.latitude || !branch?.longitude) return;
  if (staticBranchMarker) {
    staticBranchMarker.remove();
  }
  const branchIcon = createMarkerIcon("pin", "primary", 18);
  staticBranchMarker = L.marker([branch.latitude, branch.longitude], { icon: branchIcon }).addTo(mapInstance);
};

const loadPolygons = async () => {
  if (!selectedBranchId.value) return;
  try {
    const response = await api.get(`/api/polygons/branch/${selectedBranchId.value}`);
    const polygons = response.data.polygons || [];
    const normalizePolygon = (polygon) => {
      if (!polygon || !polygon.coordinates) return polygon;
      const swap = (coord) => (Array.isArray(coord) ? [coord[1], coord[0]] : coord);
      const normalizeCoords = (coords) => coords.map((ring) => ring.map((point) => swap(point)));
      return { ...polygon, coordinates: normalizeCoords(polygon.coordinates) };
    };
    if (polygonsLayer) {
      polygonsLayer.remove();
      polygonsLayer = null;
    }
    const features = polygons
      .map((polygon) => {
        const geometry = normalizePolygon(polygon.polygon);
        if (!geometry) return null;
        return {
          type: "Feature",
          geometry,
          properties: { ...polygon },
        };
      })
      .filter(Boolean);
    polygonsLayer = L.geoJSON(features, {
      style: {
        color: mapAccentColor.value,
        weight: 2,
        opacity: 0.8,
        fillColor: mapAccentFill.value,
        fillOpacity: 1,
      },
      onEachFeature: (feature, layer) => {
        const props = feature?.properties || {};
        const name = props.name || `Полигон #${props.id || ""}`;
        const branchName = props.branch_name || "";
        const deliveryTime = props.delivery_time || 30;
        const minOrder = 0;
        const tariffsCount = Number(props.tariffs_count || 0);
        const isBlocked = Boolean(props.is_blocked);
        const isInactive = props.is_active === 0 || props.is_active === false;
        let statusBadge = "";
        if (isBlocked) {
          statusBadge =
            '<span style="display:inline-block;background:rgba(239,68,68,0.12);color:#ef4444;padding:2px 6px;border-radius:999px;font-size:11px;margin-top:6px;">Заблокирован</span>';
        } else if (isInactive) {
          statusBadge =
            '<span style="display:inline-block;background:rgba(148,163,184,0.18);color:#94a3b8;padding:2px 6px;border-radius:999px;font-size:11px;margin-top:6px;">Неактивен</span>';
        }
        const popupContent = `
      <div class="space-y-1.5 font-sans">
        <div class="text-sm font-semibold text-foreground">${name}</div>
        <div class="text-xs text-muted-foreground">${branchName}</div>
        <div class="grid gap-1 text-xs text-muted-foreground">
          <div>Время доставки: ${deliveryTime} мин</div>
            <div style="background: inherit;">Мин. заказ: ${minOrder} ₽</div>
          <div>Тарифы: ${tariffsCount} шт.</div>
        </div>
        ${statusBadge}
      </div>
    `;
        layer.bindPopup(popupContent, { autoPan: false });
      },
    });
    updatePolygonsVisibility();
  } catch (error) {
    devError("Ошибка загрузки полигонов:", error);
  }
};

// Функции отображения заказов на карте
const clearOrderMap = () => {
  if (branchMarker) {
    branchMarker.remove();
    branchMarker = null;
  }
  if (deliveryMarker) {
    deliveryMarker.remove();
    deliveryMarker = null;
  }
  if (routeLine) {
    routeLine.remove();
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
  if (!mapInstance) return;
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
  const branchIcon = createMarkerIcon("pin", "primary", 18);
  const deliveryIcon = createMarkerIcon("circle", "blue", 16);
  branchMarker = L.marker([branchLat, branchLng], { icon: branchIcon }).addTo(mapInstance);
  deliveryMarker = L.marker([deliveryLat, deliveryLng], { icon: deliveryIcon }).addTo(mapInstance);
  routeLine = L.polyline(
    [
      [branchLat, branchLng],
      [deliveryLat, deliveryLng],
    ],
    { color: mapAccentColor.value, weight: 3, dashArray: "10, 5" },
  ).addTo(mapInstance);
  const bounds = L.latLngBounds([branchLat, branchLng], [deliveryLat, deliveryLng]);
  mapInstance.fitBounds(bounds, { padding: [50, 50] });
  const scrollToOrder = () => {
    const element = orderRefs.get(order.id);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  branchMarker.on("click", scrollToOrder);
  deliveryMarker.on("click", scrollToOrder);
};

// Обработка событий WebSocket
const playNewOrderSound = () => {
  if (document.visibilityState !== "visible") return;
  const audio = new Audio("/sounds/new-order.mp3");
  audio.volume = 0.6;
  audio.play().catch(() => null);
};

const handleOrderEvent = (payload) => {
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
  }
  if (payload.type === "order-status-updated") {
    const { orderId, newStatus, branchId } = payload.data || {};
    if (!orderId) return;
    if (branchId && branchId.toString() !== selectedBranchId.value?.toString()) return;
    const exists = orders.value.some((order) => order.id === orderId);
    if (!exists) return;
    orders.value = orders.value.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order));
    showSuccessNotification(`Статус заказа #${orderId} обновлен`);
    if (expandedOrderId.value === orderId) {
      expandedOrderId.value = null;
      clearOrderMap();
    }
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
      initMap();
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
  () => resolvedTheme.value,
  () => {
    if (!mapInstance) return;
    if (tileLayer) {
      tileLayer.remove();
    }
    tileLayer = getTileLayer(resolvedTheme.value, { maxZoom: 18 }).addTo(mapInstance);
    if (polygonsLayer) {
      polygonsLayer.setStyle({
        color: mapAccentColor.value,
        fillColor: mapAccentFill.value,
        fillOpacity: 1,
      });
    }
    if (routeLine) {
      routeLine.setStyle({ color: mapAccentColor.value });
    }
  },
);

// Lifecycle хуки
onMounted(async () => {
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
  if (shiftTimer) {
    clearTimeout(shiftTimer);
  }
  if (selectedBranchId.value) {
    ordersStore.leaveRoom(`branch-${selectedBranchId.value}-orders`);
  }
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  tileLayer = null;
});
</script>
