<template>
  <div class="relative h-full min-h-[calc(100vh-80px)] bg-background">
    <div id="editor-map" class="absolute inset-0 z-0"></div>
    <div class="absolute left-4 top-4 z-10 w-[260px] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <div class="p-4 space-y-3">
        <PageHeader :title="pageTitle" description="Редактирование полигона">
          <template #actions>
            <Button variant="outline" class="w-full" @click="goBack">Назад</Button>
          </template>
        </PageHeader>
      </div>
    </div>
    <div
      class="absolute right-4 top-4 bottom-4 z-20 w-[360px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur flex flex-col"
    >
      <CardHeader class="border-b border-border px-4 py-4 space-y-3">
        <CardTitle>Параметры полигона</CardTitle>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition"
            :class="activeTab === 'general' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
            @click="activeTab = 'general'"
          >
            Общая информация
          </button>
          <button
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition"
            :class="activeTab === 'delivery' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
            @click="activeTab = 'delivery'"
          >
            Доставка
          </button>
        </div>
      </CardHeader>
      <CardContent class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <template v-if="activeTab === 'general'">
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
          </FieldGroup>
          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" @click="startDrawing">Перерисовать</Button>
            <Button variant="outline" @click="resetPolygon">Сбросить изменения</Button>
          </div>
        </template>
        <template v-else>
          <div v-if="polygonId === 'new'" class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Сначала сохраните полигон, чтобы настроить тарифы доставки.
          </div>
          <template v-else>
            <div class="space-y-2">
              <p class="text-sm font-medium text-foreground">Стоимость доставки</p>
              <div v-if="tariffsLoading" class="text-xs text-muted-foreground">Загрузка тарифов...</div>
              <div v-else-if="tariffs.length === 0" class="text-sm text-muted-foreground">Тарифы не настроены.</div>
              <div v-else class="flex flex-wrap items-center gap-2">
                <div
                  v-for="(tariff, index) in visibleTariffs"
                  :key="tariff.id || index"
                  class="rounded-full border px-3 py-1 text-xs font-semibold"
                  :class="tariff.delivery_cost === 0 ? 'border-emerald-400 text-emerald-500' : 'border-border text-muted-foreground'"
                >
                  <span v-if="tariff.ellipsis">• • •</span>
                  <span v-else>{{ tariff.delivery_cost }} ₽</span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button variant="secondary" @click="openTariffEditor">
                <Edit :size="16" />
                {{ tariffs.length ? "Редактировать тарифы" : "Добавить ступень" }}
              </Button>
              <Button v-if="tariffs.length === 0 && availableTariffSources.length" variant="outline" @click="openTariffCopy">
                <Copy :size="16" />
                Скопировать тарифы
              </Button>
            </div>
          </template>
        </template>
        <Button class="w-full" :disabled="!currentLayer" @click="savePolygon">
          <Save :size="16" />
          Сохранить
        </Button>
      </CardContent>
    </div>
  </div>
  <DeliveryTariffEditorDialog
    :open="tariffEditorOpen"
    :tariffs="tariffs"
    @close="tariffEditorOpen = false"
    @save="saveTariffs"
  />
  <DeliveryTariffCopyDialog
    :open="tariffCopyOpen"
    :sources="availableTariffSources"
    :preview-tariffs="tariffCopyPreview"
    :selected-source-id="tariffCopySource"
    @close="closeTariffCopy"
    @select="selectTariffCopySource"
    @confirm="confirmTariffCopy"
  />
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Copy, Edit, Save } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { getMapColor, getTileLayer } from "@/shared/utils/leaflet.js";
import Button from "@/shared/components/ui/button/Button.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import DeliveryTariffEditorDialog from "@/modules/delivery/components/DeliveryTariffEditorDialog.vue";
import DeliveryTariffCopyDialog from "@/modules/delivery/components/DeliveryTariffCopyDialog.vue";
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
const route = useRoute();
const router = useRouter();
const referenceStore = useReferenceStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const branchId = computed(() => parseInt(route.params.branchId, 10));
const polygonId = computed(() => route.params.polygonId);
const cityId = computed(() => parseInt(route.query.cityId, 10));
const form = ref({
  name: "",
  delivery_time: 30,
});
const branchPolygons = ref([]);
const pageTitle = computed(() => (polygonId.value === "new" ? "Новый полигон" : "Редактировать полигон"));
const activeTab = ref("general");
const tariffs = ref([]);
const tariffsLoading = ref(false);
const tariffEditorOpen = ref(false);
const tariffCopyOpen = ref(false);
const tariffCopySource = ref("");
const tariffCopyPreview = ref([]);
const availableTariffSources = computed(() => {
  if (!branchPolygons.value.length || polygonId.value === "new") return [];
  const currentId = parseInt(polygonId.value, 10);
  return branchPolygons.value.filter((polygon) => polygon.id !== currentId && Number(polygon.tariffs_count || 0) > 0);
});
const visibleTariffs = computed(() => {
  if (!tariffs.value || tariffs.value.length <= 5) return tariffs.value || [];
  return [...tariffs.value.slice(0, 3), { ellipsis: true }, tariffs.value[tariffs.value.length - 1]];
});
let map = null;
let drawnItems = null;
let drawControl = null;
let currentLayer = null;
let originalPolygon = null;
let backgroundLayer = null;
let tileLayer = null;
const goBack = () => {
  router.push({
    name: "delivery-zones",
    query: {
      cityId: cityId.value || undefined,
      branchId: branchId.value || undefined,
    },
  });
};
const initMap = () => {
  const container = document.getElementById("editor-map");
  if (!container) return;
  if (map) {
    map.remove();
  }
  if (L?.GeometryUtil?.readableArea) {
    L.GeometryUtil.readableArea = () => "";
  }
  const branches = cityId.value ? referenceStore.branchesByCity[cityId.value] || [] : [];
  const selectedBranch = branches.find((b) => b.id === branchId.value);
  const center = selectedBranch?.latitude && selectedBranch?.longitude ? [selectedBranch.latitude, selectedBranch.longitude] : [55.751244, 37.618423];
  map = L.map(container, { zoomControl: false, attributionControl: false }).setView(center, 13);
  tileLayer = getTileLayer({ maxZoom: 20 }).addTo(map);
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  backgroundLayer = new L.FeatureGroup();
  map.addLayer(backgroundLayer);
  drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems, remove: false },
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: false,
        shapeOptions: {
          color: getMapColor("accent"),
          fillColor: getMapColor("accentFill"),
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
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED, (event) => {
    if (currentLayer) {
      drawnItems.removeLayer(currentLayer);
    }
    currentLayer = event.layer;
    drawnItems.addLayer(currentLayer);
  });
};
const renderPolygon = (polygon) => {
  if (!map || !drawnItems || !polygon?.polygon?.coordinates?.[0]) return;
  drawnItems.clearLayers();
  const rawCoords = polygon.polygon.coordinates[0];
  const coords = rawCoords.map((coord) => [coord[0], coord[1]]);
  currentLayer = L.polygon(coords, {
    color: getMapColor("accent"),
    fillColor: getMapColor("accentFill"),
    fillOpacity: 1,
    weight: 3,
    opacity: 0.9,
  });
  drawnItems.addLayer(currentLayer);
  map.fitBounds(currentLayer.getBounds(), { padding: [24, 24] });
};
const renderBackgroundPolygons = (excludeId = null) => {
  if (!map || !backgroundLayer) return;
  backgroundLayer.clearLayers();
  const muted = "#cbd5e1";
  const style = {
    color: muted,
    fillColor: muted,
    fillOpacity: 0.08,
    weight: 2,
    opacity: 0.6,
  };
  branchPolygons.value.forEach((polygon) => {
    if (excludeId && polygon.id === excludeId) return;
    const rawCoords = polygon.polygon?.coordinates?.[0];
    if (!rawCoords?.length) return;
    const coords = rawCoords.map((coord) => [coord[0], coord[1]]);
    const layer = L.polygon(coords, style);
    backgroundLayer.addLayer(layer);
  });
};
const loadPolygon = async () => {
  if (!branchId.value) return;
  const response = await api.get(`/api/polygons/admin/branch/${branchId.value}`);
  const polygons = response.data.polygons || [];
  branchPolygons.value = polygons;
  renderBackgroundPolygons(polygonId.value === "new" ? null : parseInt(polygonId.value, 10));
  if (polygonId.value === "new") {
    return;
  }
  const polygon = polygons.find((item) => item.id === parseInt(polygonId.value, 10));
  if (!polygon) return;
  originalPolygon = polygon;
  form.value = {
    name: polygon.name || "",
    delivery_time: polygon.delivery_time || 30,
  };
  renderPolygon(polygon);
  await loadTariffs();
};
const loadTariffs = async () => {
  if (polygonId.value === "new") return;
  tariffsLoading.value = true;
  try {
    const response = await api.get(`/api/polygons/admin/${polygonId.value}/tariffs`);
    tariffs.value = response.data?.tariffs || [];
  } catch (error) {
    devError("Ошибка загрузки тарифов:", error);
    showErrorNotification("Не удалось загрузить тарифы");
  } finally {
    tariffsLoading.value = false;
  }
};
const openTariffEditor = () => {
  tariffEditorOpen.value = true;
};
const saveTariffs = async (payload) => {
  try {
    const response = await api.put(`/api/polygons/admin/${polygonId.value}/tariffs`, { tariffs: payload });
    tariffs.value = response.data?.tariffs || [];
    tariffEditorOpen.value = false;
    showSuccessNotification("Тарифы сохранены");
  } catch (error) {
    devError("Ошибка сохранения тарифов:", error);
    const message = error?.response?.data?.errors?.[0] || "Ошибка сохранения тарифов";
    showErrorNotification(message);
  }
};
const openTariffCopy = () => {
  tariffCopyOpen.value = true;
  tariffCopySource.value = "";
  tariffCopyPreview.value = [];
};
const closeTariffCopy = () => {
  tariffCopyOpen.value = false;
  tariffCopySource.value = "";
  tariffCopyPreview.value = [];
};
const selectTariffCopySource = async (value) => {
  tariffCopySource.value = value;
  tariffCopyPreview.value = [];
  if (!value) return;
  try {
    const response = await api.get(`/api/polygons/admin/${value}/tariffs`);
    tariffCopyPreview.value = response.data?.tariffs || [];
  } catch (error) {
    devError("Ошибка предпросмотра тарифов:", error);
    showErrorNotification("Не удалось загрузить тарифы для копирования");
  }
};
const confirmTariffCopy = async (value) => {
  if (!value) return;
  try {
    const response = await api.post(`/api/polygons/admin/${polygonId.value}/tariffs/copy`, { source_polygon_id: value });
    tariffs.value = response.data?.tariffs || [];
    closeTariffCopy();
    showSuccessNotification("Тарифы скопированы");
  } catch (error) {
    devError("Ошибка копирования тарифов:", error);
    const message = error?.response?.data?.error || "Не удалось скопировать тарифы";
    showErrorNotification(message);
  }
};
const startDrawing = () => {
  if (!map || !drawControl) return;
  new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
};
const resetPolygon = () => {
  if (polygonId.value === "new") {
    if (currentLayer) {
      drawnItems.removeLayer(currentLayer);
      currentLayer = null;
    }
    return;
  }
  renderPolygon(originalPolygon);
  renderBackgroundPolygons(originalPolygon?.id || null);
};
const savePolygon = async () => {
  if (!currentLayer) return;
  const payload = {
    branch_id: branchId.value,
    name: form.value.name,
    delivery_time: form.value.delivery_time,
    polygon: currentLayer.toGeoJSON().geometry.coordinates[0],
  };
  try {
    if (polygonId.value === "new") {
      await api.post("/api/polygons/admin", payload);
      showSuccessNotification("Полигон создан");
    } else {
      await api.put(`/api/polygons/admin/${polygonId.value}`, payload);
      showSuccessNotification("Полигон обновлен");
    }
    goBack();
  } catch (error) {
    devError("Ошибка сохранения полигона:", error);
    showErrorNotification("Ошибка сохранения полигона");
  }
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    if (cityId.value) {
      await referenceStore.loadBranches(cityId.value);
    }
    initMap();
    await loadPolygon();
  } catch (error) {
    devError("Ошибка загрузки полигона:", error);
    showErrorNotification("Ошибка загрузки полигона");
  }
});
onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
  tileLayer = null;
});
</script>
<style scoped>
:deep(#editor-map .leaflet-top.leaflet-left) {
  left: auto;
  right: 400px;
  top: 16px;
}
@media (max-width: 1024px) {
  :deep(#editor-map .leaflet-top.leaflet-left) {
    right: 16px;
    top: 76px;
  }
}
</style>
