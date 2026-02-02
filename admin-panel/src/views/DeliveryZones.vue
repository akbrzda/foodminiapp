<template>
  <div class="relative h-full min-h-[calc(100vh-80px)] bg-background">
    <div id="map" class="absolute inset-0 z-0"></div>
    <div
      class="absolute left-4 top-4 z-10 w-[320px] max-w-[calc(100%-2rem)] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur"
    >
      <div class="p-4 space-y-4">
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-sm font-medium transition"
            :class="leftTab === 'zones' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
            @click="leftTab = 'zones'"
          >
            Зоны доставки
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-sm font-medium transition"
            :class="
              leftTab === 'addresses' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            "
            @click="leftTab = 'addresses'"
          >
            Адреса
          </button>
        </div>
        <div v-if="leftTab === 'zones'" class="space-y-4">
          <PageHeader title="Зоны доставки" description="Фильтры и управление" />
          <div class="space-y-3">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
              <FieldContent>
                <Select v-model="cityId" @update:modelValue="onCityChange">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все города" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все города</SelectItem>
                    <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                      {{ city.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field v-if="cityId">
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Филиал</FieldLabel>
              <FieldContent>
                <Select v-model="branchId" @update:modelValue="onBranchChange">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все филиалы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все филиалы</SelectItem>
                    <SelectItem v-for="branch in branches" :key="branch.id" :value="branch.id">
                      {{ branch.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
              <FieldContent>
                <Select v-model="statusFilter" @update:modelValue="onFilterChange">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все полигоны" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все полигоны</SelectItem>
                    <SelectItem value="active">Активные</SelectItem>
                    <SelectItem value="inactive">Неактивные</SelectItem>
                    <SelectItem value="blocked">Заблокированные</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="pt-3 border-t border-border">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Легенда</p>
            <div class="space-y-1.5">
              <div class="flex items-center gap-2 text-xs">
                <div class="h-3 w-3 rounded-sm border border-[#FFD200] bg-[#FFD200]/30"></div>
                <span class="text-foreground">Активные</span>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <div class="h-3 w-3 rounded-sm border border-gray-400 bg-gray-400/30"></div>
                <span class="text-foreground">Неактивные</span>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <div class="h-3 w-3 rounded-sm border border-red-500 bg-red-500/30"></div>
                <span class="text-foreground">Заблокированные</span>
              </div>
            </div>
          </div>
          <div v-if="branchId" class="pt-3 border-t border-border">
            <Button v-if="polygons.length < 3" class="w-full" size="sm" @click="startDrawing">
              <Plus :size="16" />
              Добавить полигон
            </Button>
            <p v-else class="text-center text-xs text-muted-foreground">Максимум 3 полигона на филиал</p>
          </div>
          <div v-if="filteredPolygons.length > 0" class="pt-2 text-xs text-muted-foreground text-center">
            {{ filteredPolygons.length }} {{ getPluralForm(filteredPolygons.length) }}
          </div>
        </div>
        <div v-else class="space-y-2 text-sm text-muted-foreground">
          <p>Раздел адресов появится в следующем обновлении.</p>
        </div>
      </div>
    </div>
    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitPolygon">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" placeholder="Центральная зона" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время доставки (мин)</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.delivery_time" type="number" min="0" required />
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Мин. сумма заказа (₽)</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.min_order_amount" type="number" min="0" step="10" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Стоимость доставки (₽)</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.delivery_cost" type="number" min="0" step="10" />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldGroup>
          <Button class="w-full" type="submit">
            <Save :size="16" />
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog v-if="showBlockModalWindow" :open="showBlockModalWindow" @update:open="(value) => (value ? null : closeBlockModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {{ blockingPolygon?.id === "bulk" ? `Блокировка полигонов (${blockingPolygon.ids.length})` : "Блокировка полигона" }}
          </DialogTitle>
          <DialogDescription>
            {{ blockingPolygon?.id === "bulk" ? "Укажите параметры для массовой блокировки" : "Укажите параметры блокировки" }}
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitBlock">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип блокировки</FieldLabel>
              <FieldContent>
                <Select v-model="blockForm.blockType">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Постоянная</SelectItem>
                    <SelectItem value="temporary">Временная</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field v-if="blockForm.blockType === 'temporary'">
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Период</FieldLabel>
              <FieldContent>
                <div class="rounded-md border border-border bg-card">
                  <CalendarView v-model="blockCalendarRange" :number-of-months="2" locale="ru-RU" multiple />
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ blockRangeHelperLabel }}</span>
                  <button type="button" class="text-primary hover:underline" @click="clearBlockRange">Очистить</button>
                </div>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина блокировки</FieldLabel>
              <FieldContent>
                <Input v-model="blockForm.block_reason" placeholder="Укажите причину" />
              </FieldContent>
            </Field>
          </FieldGroup>
          <div class="flex gap-2">
            <Button class="flex-1" type="submit" variant="default">
              <Lock :size="16" />
              Заблокировать
            </Button>
            <Button type="button" variant="outline" @click="closeBlockModal"> Отмена </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <PolygonSidebar
      :is-open="showSidebar"
      :polygon="selectedPolygon"
      :city-branches="branches"
      @close="closeSidebar"
      @save="savePolygonFromSidebar"
      @block="showBlockModalFromSidebar"
      @unblock="unblockPolygonFromSidebar"
      @delete="deletePolygonFromSidebar"
      @transfer="transferPolygon"
      @redraw="startRedrawPolygon"
    />
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Lock, Plus, Save } from "lucide-vue-next";
import { parseDate as parseCalendarDate } from "@internationalized/date";
import api from "../api/client.js";
import PolygonSidebar from "../components/PolygonSidebar.vue";
import { useReferenceStore } from "../stores/reference.js";
import { useRoute, useRouter } from "vue-router";
import Button from "../components/ui/button/Button.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog/index.js";
import { Field, FieldContent, FieldGroup, FieldLabel } from "../components/ui/field";
import Input from "../components/ui/input/Input.vue";
import { Calendar as CalendarView } from "../components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import PageHeader from "../components/PageHeader.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { useTheme } from "../composables/useTheme.js";
import { createMarkerIcon, getMapColor, getTileLayer } from "../utils/leaflet.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

const patchLeafletTouchEvents = () => {
  if (!L?.DomEvent || L.DomEvent.__touchleavePatched) return;
  const sanitizeTypes = (types) => {
    if (typeof types !== "string") return types;
    return types
      .split(/\s+/)
      .filter((type) => type && type !== "touchleave")
      .join(" ");
  };
  const originalOn = L.DomEvent.on;
  const originalOff = L.DomEvent.off;
  L.DomEvent.on = function (obj, types, fn, context) {
    const safeTypes = sanitizeTypes(types);
    if (!safeTypes) return this;
    return originalOn.call(this, obj, safeTypes, fn, context);
  };
  L.DomEvent.off = function (obj, types, fn, context) {
    const safeTypes = sanitizeTypes(types);
    if (!safeTypes) return this;
    return originalOff.call(this, obj, safeTypes, fn, context);
  };
  L.DomEvent.__touchleavePatched = true;
};

// Убираем предупреждения Leaflet о неверном событии touchleave.
patchLeafletTouchEvents();
if (L?.GeometryUtil?.readableArea && !L.GeometryUtil.__patched) {
  L.GeometryUtil.readableArea = () => "";
  L.GeometryUtil.__patched = true;
}
const referenceStore = useReferenceStore();
const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();
const { resolvedTheme } = useTheme();
const cityId = ref("");
const branchId = ref("");
const branches = ref([]);
const polygons = ref([]);
const allPolygons = ref([]);
const showModal = ref(false);
const showBlockModalWindow = ref(false);
const editing = ref(null);
const blockingPolygon = ref(null);
const leftTab = ref("zones");
const form = ref({
  name: "",
  delivery_time: 30,
  min_order_amount: 0,
  delivery_cost: 0,
});
const blockForm = ref({
  blockType: "permanent",
  blocked_from: "",
  blocked_until: "",
  block_reason: "",
});
const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};
const blockCalendarRange = computed({
  get() {
    const values = [];
    if (blockForm.value.blocked_from) values.push(parseCalendarDate(blockForm.value.blocked_from));
    if (blockForm.value.blocked_until) values.push(parseCalendarDate(blockForm.value.blocked_until));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    blockForm.value.blocked_from = normalized[0]?.toString() || "";
    blockForm.value.blocked_until = normalized[1]?.toString() || "";
  },
});
const blockRangeHelperLabel = computed(() => {
  if (blockForm.value.blocked_from && blockForm.value.blocked_until) return "Диапазон выбран";
  if (blockForm.value.blocked_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});
const clearBlockRange = () => {
  blockForm.value.blocked_from = "";
  blockForm.value.blocked_until = "";
};
const statusFilter = ref("all");
const selectedPolygons = ref([]);
const showSidebar = ref(false);
const selectedPolygon = ref(null);
const editingPolygonId = ref(null);
let map = null;
let drawnItems = null;
let tileLayer = null;
let drawControl = null;
let currentLayer = null;
let editHandler = null;
const polygonLayers = new Map();
let branchesRequestId = 0;
let drawControlVisible = true;
const modalTitle = computed(() => (editing.value ? "Редактировать полигон" : "Новый полигон"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры полигона" : "Добавьте зону доставки"));
const filteredPolygons = computed(() => {
  const polygonsList = branchId.value
    ? polygons.value
    : cityId.value
      ? allPolygons.value.filter((polygon) => polygon.city_id === parseInt(cityId.value))
      : allPolygons.value;
  if (statusFilter.value === "all") {
    return polygonsList;
  } else if (statusFilter.value === "active") {
    return polygonsList.filter((p) => p.is_active && !isPolygonBlocked(p));
  } else if (statusFilter.value === "inactive") {
    return polygonsList.filter((p) => !p.is_active);
  } else if (statusFilter.value === "blocked") {
    return polygonsList.filter((p) => isPolygonBlocked(p));
  }
  return polygonsList;
});
const loadBranches = async () => {
  if (!cityId.value) {
    branches.value = [];
    return;
  }
  const requestId = ++branchesRequestId;
  try {
    const response = await api.get(`/api/cities/${cityId.value}/branches`);
    if (requestId === branchesRequestId) {
      branches.value = response.data.branches || [];
    }
  } catch (error) {
    console.error("Ошибка загрузки филиалов:", error);
    if (requestId === branchesRequestId) {
      branches.value = [];
    }
  }
};
const loadPolygons = async () => {
  if (!branchId.value) {
    polygons.value = [];
    return;
  }
  try {
    const response = await api.get(`/api/polygons/admin/branch/${branchId.value}`);
    const branchName = branches.value.find((branch) => branch.id === parseInt(branchId.value))?.name || "";
    polygons.value = (response.data.polygons || []).map((polygon) => ({
      ...polygon,
      branch_name: polygon.branch_name || branchName,
    }));
  } catch (error) {
    console.error("Ошибка загрузки полигонов:", error);
  }
};
const loadAllPolygons = async () => {
  try {
    const response = await api.get("/api/polygons/admin/all");
    allPolygons.value = response.data.polygons || [];
  } catch (error) {
    console.error("Ошибка загрузки всех полигонов:", error);
    allPolygons.value = [];
  }
};
const onCityChange = () => {
  branchId.value = "";
  polygons.value = [];
  loadBranches();
  loadAllPolygons();
  if (map) {
    map.remove();
    map = null;
  }
  drawnItems = null;
  currentLayer = null;
  nextTick(() => {
    initMap();
  });
};
const onBranchChange = async () => {
  polygons.value = [];
  await loadPolygons();
  await nextTick();
  initMap();
};
const initMap = () => {
  if (map) {
    map.remove();
  }
  drawControlVisible = true;
  if (L?.GeometryUtil?.readableArea) {
    L.GeometryUtil.readableArea = () => "";
  }
  const container = document.getElementById("map");
  if (!container) return;
  let center = [55.751244, 37.618423];
  const selectedBranch = branches.value.find((b) => b.id === parseInt(branchId.value));
  if (selectedBranch?.latitude && selectedBranch?.longitude) {
    center = [selectedBranch.latitude, selectedBranch.longitude];
  } else if (cityId.value) {
    const selectedCity = referenceStore.cities.find((c) => c.id === parseInt(cityId.value));
    if (selectedCity?.latitude && selectedCity?.longitude) {
      center = [selectedCity.latitude, selectedCity.longitude];
    }
  }
  map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
  }).setView(center, 13);
  tileLayer = getTileLayer(resolvedTheme.value, { maxZoom: 20 }).addTo(map);
  if (selectedBranch) {
    const branchIcon = createMarkerIcon("pin", "primary", 18);
    L.marker(center, { icon: branchIcon })
      .addTo(map)
      .bindPopup(`<strong>${selectedBranch.name}</strong><br>${selectedBranch.address || ""}`, { autoPan: false });
  }
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  if (branchId.value) {
    drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        remove: false,
      },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false,
          shapeOptions: {
            color: getMapColor(resolvedTheme.value, "accent"),
            fillColor: getMapColor(resolvedTheme.value, "accentFill"),
            fillOpacity: 1,
            weight: 3,
            opacity: 0.9,
          },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
    });
    if (drawControlVisible) {
      map.addControl(drawControl);
    }
    map.on(L.Draw.Event.CREATED, (event) => {
      const layer = event.layer;
      if (currentLayer) {
        drawnItems.removeLayer(currentLayer);
      }
      currentLayer = layer;
      drawnItems.addLayer(layer);
      showModal.value = true;
      editing.value = null;
    });
  }
  renderPolygonsOnMap();
  if (branchId.value) {
    editHandler = new L.EditToolbar.Edit(map, {
      featureGroup: drawnItems,
      selectedPathOptions: {
        color: getMapColor(resolvedTheme.value, "warning"),
        fillColor: getMapColor(resolvedTheme.value, "warning"),
        fillOpacity: 0.2,
      },
    });
  } else {
    editHandler = null;
  }
};
const renderPolygonsOnMap = () => {
  if (!map || !drawnItems) return;
  drawnItems.clearLayers();
  polygonLayers.clear();
  const visiblePolygons = branchId.value
    ? polygons.value
    : cityId.value
      ? allPolygons.value.filter((polygon) => polygon.city_id === parseInt(cityId.value))
      : allPolygons.value;
  const accent = getMapColor(resolvedTheme.value, "accent");
  const accentFill = getMapColor(resolvedTheme.value, "accentFill");
  const danger = getMapColor(resolvedTheme.value, "danger");
  const muted = resolvedTheme.value === "dark" ? "#94a3b8" : "#9ca3af";
  visiblePolygons.forEach((polygon) => {
    if (!polygon.polygon) return;
    let color, fillOpacity;
    if (isPolygonBlocked(polygon)) {
      color = danger;
      fillOpacity = 0.3;
    } else if (!polygon.is_active) {
      color = muted;
      fillOpacity = 0.2;
    } else {
      color = accentFill;
      fillOpacity = 1;
    }
    const style = {
      color: accent,
      fillColor: color,
      fillOpacity: fillOpacity,
      weight: 3,
      opacity: 0.9,
    };
    const rawCoords = polygon.polygon?.coordinates?.[0];
    if (!rawCoords?.length) return;
    const coords = rawCoords.map((coord) => [coord[0], coord[1]]);
    const layer = L.polygon(coords, style);
    layer.polygonId = polygon.id;
    layer.on("click", () => {
      openPolygonSidebar(polygon);
    });
    let statusBadge = "";
    if (isPolygonBlocked(polygon)) {
      statusBadge =
        '<span style="display: inline-block; background: rgba(239,68,68,0.12); color: #ef4444; padding: 2px 6px; border-radius: 999px; font-size: 11px; margin-top: 4px;">Заблокирован</span>';
    } else if (!polygon.is_active) {
      statusBadge =
        '<span style="display: inline-block; background: rgba(148,163,184,0.18); color: #94a3b8; padding: 2px 6px; border-radius: 999px; font-size: 11px; margin-top: 4px;">Неактивен</span>';
    }
    const popupContent = `
      <div class="space-y-1.5 font-sans">
        <div class="text-sm font-semibold text-foreground">${polygon.name || `Полигон #${polygon.id}`}</div>
        <div class="text-xs text-muted-foreground">${polygon.branch_name || ""}</div>
        <div class="grid gap-1 text-xs text-muted-foreground">
          <div>Время доставки: ${polygon.delivery_time || 30} мин</div>
            <div style="background: inherit;">Мин. заказ: ${polygon.min_order_amount || 0} ₽</div>
          <div>Доставка: ${polygon.delivery_cost || 0} ₽</div>
        </div>
        ${statusBadge}
      </div>
    `;
    layer.bindPopup(popupContent, { autoPan: false });
    drawnItems.addLayer(layer);
    polygonLayers.set(polygon.id, layer);
  });
};
const startDrawing = () => {
  if (!branchId.value) return;
  router.push({
    name: "delivery-zone-editor",
    params: { branchId: branchId.value, polygonId: "new" },
    query: { cityId: cityId.value },
  });
};
const editPolygon = (polygon) => {
  router.push({
    name: "delivery-zone-editor",
    params: { branchId: branchId.value, polygonId: polygon.id },
    query: { cityId: cityId.value },
  });
};
const deletePolygon = async (polygon) => {
  if (!confirm("Удалить полигон?")) return;
  try {
    await api.delete(`/api/polygons/admin/${polygon.id}`);
    await loadPolygons();
  } catch (error) {
    console.error("Ошибка удаления полигона:", error);
    showErrorNotification("Не удалось удалить полигон");
  }
};
const isPolygonBlocked = (polygon) => {
  if (!polygon.is_blocked) return false;
  if (!polygon.blocked_from || !polygon.blocked_until) return true;
  const now = new Date();
  const from = new Date(polygon.blocked_from);
  const until = new Date(polygon.blocked_until);
  return now >= from && now <= until;
};
const formatDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  const date = new Date(dateTimeStr);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const toStartOfDay = (value) => {
  if (!value) return "";
  if (value.includes("T")) return value;
  return `${value}T00:00`;
};
const toEndOfDay = (value) => {
  if (!value) return "";
  if (value.includes("T")) return value;
  return `${value}T23:59`;
};
const showBlockModal = (polygon) => {
  blockingPolygon.value = polygon;
  blockForm.value = {
    blockType: "permanent",
    blocked_from: "",
    blocked_until: "",
    block_reason: "",
  };
  showBlockModalWindow.value = true;
};
const closeBlockModal = () => {
  showBlockModalWindow.value = false;
  blockingPolygon.value = null;
  blockForm.value = {
    blockType: "permanent",
    blocked_from: "",
    blocked_until: "",
    block_reason: "",
  };
};
const submitBlock = async () => {
  if (!blockingPolygon.value) return;
  try {
    const payload = {
      block_reason: blockForm.value.block_reason || null,
    };
    if (blockForm.value.blockType === "temporary") {
      if (!blockForm.value.blocked_from || !blockForm.value.blocked_until) {
        showWarningNotification("Укажите период блокировки");
        return;
      }
      payload.blocked_from = toStartOfDay(blockForm.value.blocked_from);
      payload.blocked_until = toEndOfDay(blockForm.value.blocked_until);
    }
    if (blockingPolygon.value.id === "bulk") {
      await api.post("/api/polygons/admin/bulk-block", {
        polygon_ids: blockingPolygon.value.ids,
        ...payload,
      });
      selectedPolygons.value = [];
    } else {
      await api.post(`/api/polygons/admin/${blockingPolygon.value.id}/block`, payload);
    }
    await loadPolygons();
    await loadAllPolygons();
    closeBlockModal();
  } catch (error) {
    console.error("Ошибка блокировки полигона:", error);
    showErrorNotification("Не удалось заблокировать полигон");
  }
};
const unblockPolygon = async (polygon) => {
  if (!confirm("Разблокировать полигон?")) return;
  try {
    await api.post(`/api/polygons/admin/${polygon.id}/unblock`);
    await loadPolygons();
    await loadAllPolygons();
  } catch (error) {
    console.error("Ошибка разблокировки полигона:", error);
    showErrorNotification("Не удалось разблокировать полигон");
  }
};
const onFilterChange = () => {
  nextTick(() => {
    if (map && drawnItems) {
      renderPolygonsOnMap();
    }
  });
};
const togglePolygonSelection = (polygonId) => {
  const index = selectedPolygons.value.indexOf(polygonId);
  if (index === -1) {
    selectedPolygons.value.push(polygonId);
  } else {
    selectedPolygons.value.splice(index, 1);
  }
};
const bulkBlock = () => {
  if (selectedPolygons.value.length === 0) return;
  const firstPolygon = filteredPolygons.value.find((p) => p.id === selectedPolygons.value[0]);
  if (firstPolygon) {
    blockingPolygon.value = { id: "bulk", ids: selectedPolygons.value };
    blockForm.value = {
      blockType: "permanent",
      blocked_from: "",
      blocked_until: "",
      block_reason: "",
    };
    showBlockModalWindow.value = true;
  }
};
const bulkUnblock = async () => {
  if (selectedPolygons.value.length === 0) return;
  if (!confirm(`Разблокировать ${selectedPolygons.value.length} ${getPluralForm(selectedPolygons.value.length)}?`)) return;
  try {
    await api.post("/api/polygons/admin/bulk-unblock", {
      polygon_ids: selectedPolygons.value,
    });
    selectedPolygons.value = [];
    await loadPolygons();
    await loadAllPolygons();
  } catch (error) {
    console.error("Ошибка массовой разблокировки:", error);
    showErrorNotification("Не удалось разблокировать полигоны");
  }
};
const getPluralForm = (count) => {
  const cases = [2, 0, 1, 1, 1, 2];
  const titles = ["полигон", "полигона", "полигонов"];
  return titles[count % 100 > 4 && count % 100 < 20 ? 2 : cases[Math.min(count % 10, 5)]];
};
const openPolygonSidebar = (polygon) => {
  const branchName = branches.value.find((branch) => branch.id === polygon.branch_id)?.name || "";
  const enrichedPolygon = {
    ...polygon,
    branch_name: polygon.branch_name || branchName,
  };
  if (editingPolygonId.value && editingPolygonId.value !== polygon.id) {
    stopPolygonEditing();
  }
  selectedPolygon.value = enrichedPolygon;
  showSidebar.value = true;
};
const closeSidebar = () => {
  stopPolygonEditing();
  showSidebar.value = false;
  setTimeout(() => {
    selectedPolygon.value = null;
  }, 300);
};
const savePolygonFromSidebar = async (data) => {
  try {
    const payload = {
      delivery_cost: data.delivery_cost,
      delivery_time: data.delivery_time,
      min_order_amount: data.min_order_amount,
      is_active: data.is_active ? 1 : 0,
    };
    if (editingPolygonId.value === data.id && currentLayer) {
      payload.polygon = currentLayer.toGeoJSON().geometry.coordinates[0];
    }
    await api.put(`/api/polygons/admin/${data.id}`, payload);
    await loadPolygons();
    await loadAllPolygons();
    showSuccessNotification("Полигон сохранен");
    stopPolygonEditing();
    closeSidebar();
  } catch (error) {
    console.error("Ошибка сохранения полигона:", error);
    showErrorNotification("Не удалось сохранить изменения");
  }
};
const showBlockModalFromSidebar = (polygon) => {
  closeSidebar();
  showBlockModal(polygon);
};
const unblockPolygonFromSidebar = async (polygon) => {
  closeSidebar();
  await unblockPolygon(polygon);
};
const deletePolygonFromSidebar = async (polygon) => {
  closeSidebar();
  await deletePolygon(polygon);
};
const transferPolygon = async (data) => {
  try {
    await api.post(`/api/polygons/admin/${data.polygonId}/transfer`, {
      new_branch_id: data.newBranchId,
    });
    await loadPolygons();
    await loadAllPolygons();
    closeSidebar();
  } catch (error) {
    console.error("Ошибка переноса полигона:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось перенести полигон");
  }
};
const startRedrawPolygon = (polygon) => {
  if (!polygon?.id) return;
  const layer = polygonLayers.get(polygon.id);
  if (!layer) return;
  stopPolygonEditing();
  currentLayer = layer;
  editingPolygonId.value = polygon.id;
  if (drawControl && map && drawControlVisible) {
    map.removeControl(drawControl);
    drawControlVisible = false;
  }
  if (layer.bringToFront) {
    layer.bringToFront();
  }
  if (layer.editing?.enable) {
    layer.editing.enable();
  }
};
const stopPolygonEditing = () => {
  if (currentLayer?.editing?.disable) {
    currentLayer.editing.disable();
  }
  if (drawControl && map && !drawControlVisible) {
    map.addControl(drawControl);
    drawControlVisible = true;
  }
  editingPolygonId.value = null;
  currentLayer = null;
};
const closeModal = () => {
  showModal.value = false;
  editing.value = null;
  if (editHandler?.disable) {
    editHandler.disable();
  }
  if (currentLayer?.editing?.disable) {
    currentLayer.editing.disable();
  }
  renderPolygonsOnMap();
  form.value = {
    name: "",
    delivery_time: 30,
    min_order_amount: 0,
    delivery_cost: 0,
  };
};
const submitPolygon = async () => {
  try {
    const payload = {
      branch_id: parseInt(branchId.value),
      name: form.value.name,
      delivery_time: form.value.delivery_time,
      min_order_amount: form.value.min_order_amount,
      delivery_cost: form.value.delivery_cost,
      polygon: currentLayer ? currentLayer.toGeoJSON().geometry.coordinates[0] : editing.value?.polygon?.coordinates?.[0] || [],
    };
    if (editing.value) {
      await api.put(`/api/polygons/admin/${editing.value.id}`, payload);
    } else {
      await api.post("/api/polygons/admin", payload);
    }
    await loadPolygons();
    showSuccessNotification(editing.value ? "Полигон обновлен" : "Полигон создан");
    closeModal();
  } catch (error) {
    console.error("Ошибка сохранения полигона:", error);
    showErrorNotification("Ошибка сохранения полигона");
  }
};
watch(
  () => showModal.value,
  (open) => {
    if (!open && currentLayer && !editing.value && drawnItems) {
      drawnItems.removeLayer(currentLayer);
      currentLayer = null;
    }
  },
);
watch(
  () => [allPolygons.value, polygons.value, cityId.value, branchId.value],
  () => {
    if (map && drawnItems) {
      renderPolygonsOnMap();
    }
  },
  { deep: true },
);
watch(
  () => resolvedTheme.value,
  () => {
    if (!map) return;
    if (tileLayer) {
      tileLayer.remove();
    }
    tileLayer = getTileLayer(resolvedTheme.value, { maxZoom: 20 }).addTo(map);
    if (drawnItems) {
      renderPolygonsOnMap();
    }
  },
);
onMounted(() => {
  referenceStore.loadCities();
  loadAllPolygons();
  const initialCity = route.query.cityId;
  const initialBranch = route.query.branchId;
  if (initialCity) {
    cityId.value = String(initialCity);
    loadBranches().then(() => {
      if (initialBranch) {
        branchId.value = String(initialBranch);
        loadPolygons().then(() => nextTick(() => initMap()));
      }
    });
  }
  nextTick(() => {
    initMap();
  });
});
onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
  tileLayer = null;
});
</script>
<style>
</style>
