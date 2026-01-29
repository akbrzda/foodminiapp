<template>
  <div class="min-h-screen min-w-[1280px] bg-[#F5F5F5]">
    <header class="sticky top-0 z-30 border-b border-[#E0E0E0] bg-white/90 backdrop-blur">
      <div class="flex h-[72px] items-center justify-between gap-6 px-6">
        <div class="flex items-center gap-4">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFD200] text-sm font-semibold text-black">PD</div>
          <div class="min-w-0">
            <div class="text-base font-semibold text-black">Текущая смена</div>
            <div class="text-xs text-[#666666]">Оперативное управление заказами</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="min-w-[260px]">
            <Select v-model="selectedBranchId">
              <option value="">Выберите филиал</option>
              <option v-for="branch in branchOptions" :key="branch.id" :value="branch.id">
                {{ branch.label }}
              </option>
            </Select>
          </div>
          <Button variant="outline" @click="openAdminPanel">
            <ExternalLink :size="16" />
            Админ‑панель
          </Button>
        </div>
      </div>
    </header>

    <div class="flex h-[calc(100vh-72px)]">
      <section class="flex w-[40%] min-w-[480px] flex-col border-r border-[#E0E0E0] bg-[#F5F5F5] p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 border-b border-transparent">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              class="relative px-3 py-2 text-sm font-semibold transition-colors"
              :class="tabButtonClass(tab.value)"
              @click="activeTab = tab.value"
            >
              <span>{{ tab.label }}</span>
              <span
                v-if="tab.badge !== null"
                class="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="tabBadgeClass(tab.value)"
              >
                {{ tab.badge }}
              </span>
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="gap-2">
                {{ orderTypeFilterLabel }}
                <ChevronDown :size="14" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup v-model="orderTypeFilter">
                <DropdownMenuRadioItem value="all">Все</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="delivery">Доставка</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pickup">Самовывоз</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div v-if="activeTab === 'search'" class="mt-3">
          <label class="text-[11px] font-semibold uppercase tracking-wide text-[#666666]">Поиск</label>
          <div class="relative mt-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" :size="16" />
            <Input
              ref="searchInputRef"
              v-model="searchQuery"
              class="pl-9 pr-9"
              placeholder="Поиск по номеру, телефону или адресу"
              @keydown.esc.prevent="clearSearch"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#666666] hover:bg-black/5"
              @click="clearSearch"
            >
              <X :size="14" />
            </button>
          </div>
        </div>

        <div class="mt-4 flex-1 overflow-y-auto pr-1">
          <div v-if="visibleOrders.length === 0" class="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-[#666666]">
            <component :is="emptyStateIcon" :size="28" />
            <div class="max-w-[240px]">
              <div class="font-semibold text-[#666666]">{{ emptyStateTitle }}</div>
              <div v-if="emptyStateSubtitle" class="text-xs text-[#999999]">{{ emptyStateSubtitle }}</div>
            </div>
          </div>

          <div v-else class="space-y-3 pb-6">
            <article
              v-for="order in visibleOrders"
              :key="order.id"
              :ref="(el) => setOrderRef(order.id, el)"
              class="rounded-xl border bg-white p-4 transition-all"
              :class="orderCardClass(order)"
              @click="toggleOrder(order)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-sm font-semibold text-black">
                    <span>#{{ order.order_number }}</span>
                    <span class="flex items-center gap-1 text-xs font-medium text-[#666666]">
                      <Clock :size="14" />
                      {{ formatOrderTime(order) }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-[#666666]">
                    <MapPin v-if="order.order_type === 'delivery'" :size="14" />
                    <Store v-else :size="14" />
                    <span>{{ getOrderLocation(order) }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-[#666666]">
                    <Phone :size="14" />
                    <span>{{ formatPhone(order.user_phone) || "—" }}</span>
                  </div>
                  <div v-if="order.delivery_comment || order.comment" class="flex items-center gap-2 text-sm text-[#666666]">
                    <MessageSquare :size="14" />
                    <span>{{ order.delivery_comment || order.comment }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-[#666666]">
                    <CreditCard :size="14" />
                    <span>{{ getPaymentSummary(order) }}</span>
                  </div>
                </div>
                <Badge class="text-xs font-semibold" :class="getStatusBadge(order).class" :style="getStatusBadge(order).style">
                  {{ getStatusBadge(order).label }}
                </Badge>
              </div>

              <Transition name="fade-slide">
                <div v-if="expandedOrderId === order.id" class="mt-4 space-y-4">
                  <div class="rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] p-3">
                    <div v-for="(item, index) in order.items || []" :key="item.id" class="py-2">
                      <div class="flex items-center justify-between text-sm font-semibold text-black">
                        <span>{{ item.item_name }}</span>
                        <span>{{ formatCurrency(item.subtotal) }}</span>
                      </div>
                      <div v-if="item.modifiers?.length" class="text-xs text-[#666666]">
                        {{ item.modifiers.map((modifier) => modifier.modifier_name).join(", ") }}
                      </div>
                      <div v-if="index < (order.items?.length || 0) - 1" class="mt-2 h-px bg-[#E0E0E0]"></div>
                    </div>
                  </div>

                  <div v-if="Number(order.delivery_cost) > 0" class="text-sm text-[#666666]">Доставка: {{ formatCurrency(order.delivery_cost) }}</div>

                  <div class="text-sm font-semibold text-black">Итого: {{ formatCurrency(order.total) }}</div>

                  <div class="space-y-2">
                    <Button v-if="getNextStatus(order)" class="w-full" @click.stop="changeStatus(order)">
                      {{ getNextStatus(order).label }}
                    </Button>
                    <Button v-if="canCancel(order)" variant="destructive" class="w-full" @click.stop="openCancelDialog(order)">
                      Отменить заказ
                    </Button>
                  </div>
                </div>
              </Transition>
            </article>
          </div>
        </div>
      </section>

      <section class="relative flex-1 bg-white">
        <div ref="mapContainer" class="absolute inset-0 z-0"></div>
        <div class="absolute right-4 top-4 z-20 flex flex-col gap-2 pointer-events-auto">
          <Button size="icon" variant="outline" @click="togglePolygons">
            <Eye v-if="polygonsVisible" :size="16" />
            <EyeOff v-else :size="16" />
          </Button>
          <Button size="icon" variant="outline" @click="centerOnBranch">
            <LocateFixed :size="16" />
          </Button>
        </div>
      </section>
    </div>

    <Dialog :open="branchDialogOpen">
      <DialogContent class="shift-branch-dialog">
        <DialogHeader>
          <DialogTitle>Выберите филиал</DialogTitle>
          <DialogDescription>Для работы со сменой нужно указать активный филиал.</DialogDescription>
        </DialogHeader>
        <div class="mt-4">
          <Select v-model="selectedBranchId">
            <option value="">Выберите филиал</option>
            <option v-for="branch in branchOptions" :key="branch.id" :value="branch.id">
              {{ branch.label }}
            </option>
          </Select>
        </div>
        <DialogFooter class="mt-6">
          <Button :disabled="!selectedBranchId" @click="closeBranchDialog">Продолжить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="cancelDialog.open">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить заказ #{{ cancelDialog.order?.order_number }}</DialogTitle>
          <DialogDescription>Заказ будет перемещён в завершённые и получит статус отмены.</DialogDescription>
        </DialogHeader>
        <DialogFooter class="mt-6 gap-2">
          <Button variant="outline" @click="cancelDialog.open = false">Отмена</Button>
          <Button variant="destructive" :disabled="cancelDialog.loading" @click="confirmCancel"> Подтвердить </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  LocateFixed,
  MapPin,
  MessageSquare,
  PackageOpen,
  Phone,
  Search,
  Store,
  X,
} from "lucide-vue-next";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { useOrdersStore } from "../stores/orders.js";
import { useNotifications } from "../composables/useNotifications.js";
import { formatCurrency, formatPhone } from "../utils/format.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu/index.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog/index.js";

const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showErrorNotification, showNewOrderNotification, showSuccessNotification } = useNotifications();

const orders = ref([]);
const recentOrderIds = ref(new Set());
const activeTab = ref("active");
const orderTypeFilter = ref("all");
const searchQuery = ref("");
const debouncedSearch = ref("");
const expandedOrderId = ref(null);
const selectedBranchId = ref("");
const shiftMeta = ref(null);
const searchInputRef = ref(null);
const branchDialogOpen = ref(false);
const cancelDialog = ref({ open: false, order: null, loading: false });
let searchTimer = null;

const mapContainer = ref(null);
let mapInstance = null;
let polygonsLayer = null;
let branchMarker = null;
let staticBranchMarker = null;
let deliveryMarker = null;
let routeLine = null;
let shiftTimer = null;
const orderRefs = new Map();

const polygonsVisible = ref(localStorage.getItem("shift_polygons_visible") !== "false");

const tabs = computed(() => [
  { value: "active", label: "Активные", badge: activeOrders.value.length },
  { value: "completed", label: "Завершенные", badge: deliveringCount.value },
  { value: "search", label: "Поиск", badge: null },
]);

const orderTypeFilterLabel = computed(() => {
  if (orderTypeFilter.value === "delivery") return "Доставка";
  if (orderTypeFilter.value === "pickup") return "Самовывоз";
  return "Все";
});

const branchOptions = computed(() => {
  return referenceStore.branches.map((branch) => {
    const city = referenceStore.cities.find((item) => item.id === branch.city_id);
    return {
      ...branch,
      label: `${branch.name}${city ? `, ${city.name}` : ""}`,
    };
  });
});

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
    const addressMatch = getOrderLocation(order).toLowerCase().includes(query);
    return numberMatch || phoneMatch || addressMatch;
  });
});

const visibleOrders = computed(() => {
  if (activeTab.value === "active") return activeOrders.value;
  if (activeTab.value === "completed") return completedOrders.value;
  return searchOrders.value;
});

const emptyStateIcon = computed(() => {
  if (activeTab.value === "search" && !debouncedSearch.value) return Search;
  return PackageOpen;
});

const emptyStateTitle = computed(() => {
  if (activeTab.value === "search" && debouncedSearch.value) {
    return "Ничего не найдено";
  }
  return "Нет заказов";
});

const emptyStateSubtitle = computed(() => {
  if (activeTab.value === "search" && debouncedSearch.value) {
    return "Попробуйте изменить запрос";
  }
  return "";
});

const tabButtonClass = (value) => {
  return value === activeTab.value ? "border-b-2 border-[#FFD200] text-black" : "text-[#666666] hover:text-black";
};

const tabBadgeClass = (value) => {
  return value === activeTab.value ? "bg-[#FFD200] text-black" : "bg-[#E0E0E0] text-[#666666]";
};

const clearSearch = () => {
  searchQuery.value = "";
  debouncedSearch.value = "";
  focusSearchInput();
};

const focusSearchInput = () => {
  nextTick(() => {
    const el = searchInputRef.value?.$el || searchInputRef.value;
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

const openAdminPanel = () => {
  window.open("/dashboard", "_blank");
};

const closeBranchDialog = () => {
  if (selectedBranchId.value) {
    branchDialogOpen.value = false;
  }
};

const getOrderLocation = (order) => {
  if (order.order_type === "pickup") {
    return order.branch_name || "Самовывоз";
  }
  const parts = [
    order.delivery_street,
    order.delivery_house,
    order.delivery_entrance ? `подъезд ${order.delivery_entrance}` : null,
    order.delivery_floor ? `этаж ${order.delivery_floor}` : null,
    order.delivery_apartment ? `кв. ${order.delivery_apartment}` : null,
    order.delivery_intercom ? `домофон ${order.delivery_intercom}` : null,
  ].filter(Boolean);
  return parts.join(", ") || "Адрес доставки";
};

const getPaymentSummary = (order) => {
  const method = order.payment_method === "cash" ? "наличными" : "картой";
  const itemsCount = order.items?.length || 0;
  const changeFrom = order.payment_method === "cash" && order.change_from ? `, сдача с ${formatCurrency(order.change_from)}` : "";
  return `К оплате: ${formatCurrency(order.total)} ${method} (${itemsCount}шт)${changeFrom}`;
};

const getStatusBadge = (order) => {
  const labels = {
    pending: "Новый",
    confirmed: "Принят",
    preparing: "Готовится",
    ready: order.order_type === "pickup" ? "Готов к выдаче" : "Готов",
    delivering: "В пути",
    completed: order.order_type === "pickup" ? "Выдан" : "Доставлен",
    cancelled: "Отменен",
  };
  const colors = {
    pending: { backgroundColor: "#3B82F6", color: "#FFFFFF" },
    confirmed: { backgroundColor: "#10B981", color: "#FFFFFF" },
    preparing: { backgroundColor: "#F59E0B", color: "#FFFFFF" },
    ready: { backgroundColor: "#8B5CF6", color: "#FFFFFF" },
    delivering: { backgroundColor: "#FFD200", color: "#000000" },
    completed: { backgroundColor: "#6B7280", color: "#FFFFFF" },
    cancelled: { backgroundColor: "#EF4444", color: "#FFFFFF" },
  };
  return {
    label: labels[order.status] || order.status,
    class: "",
    style: colors[order.status] || { backgroundColor: "#E0E0E0", color: "#666666" },
  };
};

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

const orderCardClass = (order) => {
  const isExpanded = expandedOrderId.value === order.id;
  const desiredDate = parseOrderDate(order.desired_time);
  const isOverdue = Boolean(desiredDate) && desiredDate < new Date() && !["completed", "cancelled"].includes(order.status);
  const isRecent = recentOrderIds.value.has(order.id);
  if (isExpanded) {
    return ["border-[#FFD200] shadow-lg"];
  }
  if (isOverdue) {
    return ["border-2 border-[#FF0000] shadow-sm"];
  }
  if (isRecent) {
    return ["border-[#E0E0E0] shadow-sm", "bg-[#FFFBE6]"];
  }
  return ["border-[#E0E0E0] shadow-sm"];
};

const formatOrderTime = (order) => {
  const format = (value) => {
    const parsed = parseOrderDate(value);
    return parsed ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(parsed) : "—";
  };
  const start = format(order.created_at);
  const endValue = order.deadline_time || order.desired_time;
  const end = endValue ? format(endValue) : null;
  return end ? `${start} до ${end}` : start;
};

const getNextStatus = (order) => {
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
  return flow[order.status] || null;
};

const canCancel = (order) => order.status !== "cancelled";

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
    console.error("Ошибка загрузки деталей заказа:", error);
  }
};

const changeStatus = async (order) => {
  const next = getNextStatus(order);
  if (!next) return;
  try {
    await api.put(`/api/orders/admin/${order.id}/status`, { status: next.status });
    updateOrderStatus(order.id, next.status);
    showSuccessNotification(`Статус заказа #${order.order_number} обновлен`);
  } catch (error) {
    console.error("Ошибка смены статуса:", error);
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
    console.error("Ошибка отмены заказа:", error);
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
    console.error("Ошибка загрузки заказов смены:", error);
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
  if (!mapContainer.value) return;
  if (mapInstance) {
    mapInstance.remove();
  }
  const branch = branchOptions.value.find((item) => item.id === Number(selectedBranchId.value));
  const center = branch?.latitude && branch?.longitude ? [branch.latitude, branch.longitude] : [55.751244, 37.618423];
  mapInstance = L.map(mapContainer.value, { zoomControl: true, attributionControl: false }).setView(center, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(mapInstance);
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
  const branchIcon = L.divIcon({
    className: "shift-branch-marker",
    html: `<div style=\"background-color: #FF0000; border: 3px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.25);\">
      <span style=\"font-size: 14px; color: #fff;\">🏪</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
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
    polygonsLayer = L.geoJSON(polygons.map((polygon) => normalizePolygon(polygon.polygon)).filter(Boolean), {
      style: {
        color: "#3B82F6",
        weight: 2,
        opacity: 0.8,
        fillColor: "#3B82F6",
        fillOpacity: 0.2,
      },
    });
    updatePolygonsVisibility();
  } catch (error) {
    console.error("Ошибка загрузки полигонов:", error);
  }
};

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
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
  const branchIcon = L.divIcon({
    className: "shift-branch-marker",
    html: `<div style=\"background-color: #FF0000; border: 3px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.25);\">
      <span style=\"font-size: 14px; color: #fff;\">🏪</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const deliveryIcon = L.divIcon({
    className: "shift-delivery-marker",
    html: `<div style=\"background-color: #3B82F6; border: 3px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.25);\">
      <span style=\"font-size: 14px; color: #fff;\">📍</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  branchMarker = L.marker([branchLat, branchLng], { icon: branchIcon }).addTo(mapInstance);
  deliveryMarker = L.marker([deliveryLat, deliveryLng], { icon: deliveryIcon }).addTo(mapInstance);
  routeLine = L.polyline(
    [
      [branchLat, branchLng],
      [deliveryLat, deliveryLng],
    ],
    { color: "#3B82F6", weight: 3, dashArray: "10, 5" },
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

onMounted(async () => {
  await referenceStore.fetchCitiesAndBranches();
  const storedBranch = localStorage.getItem("shift_selected_branch_id");
  if (storedBranch && branchOptions.value.some((branch) => branch.id === Number(storedBranch))) {
    selectedBranchId.value = storedBranch;
  } else {
    branchDialogOpen.value = true;
  }
  ordersStore.connectWebSocket();
});

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
});
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease-out;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
:deep(.shift-branch-dialog > button) {
  display: none;
}
</style>
