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
      <CardHeader class="border-b border-border px-4 py-4">
        <CardTitle>Параметры полигона</CardTitle>
      </CardHeader>
      <CardContent class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" @click="startDrawing">Перерисовать</Button>
          <Button variant="outline" @click="resetPolygon">Сбросить изменения</Button>
        </div>
        <Button class="w-full" :disabled="!currentLayer" @click="savePolygon">
          <Save :size="16" />
          Сохранить
        </Button>
      </CardContent>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Save } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useTheme } from "@/shared/composables/useTheme.js";
import { getMapColor, getTileLayer } from "@/shared/utils/leaflet.js";
import Button from "@/shared/components/ui/button/Button.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
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
const { resolvedTheme } = useTheme();
const branchId = computed(() => parseInt(route.params.branchId, 10));
const polygonId = computed(() => route.params.polygonId);
const cityId = computed(() => parseInt(route.query.cityId, 10));
const form = ref({
  name: "",
  delivery_time: 30,
  min_order_amount: 0,
  delivery_cost: 0,
});
const branchPolygons = ref([]);
const pageTitle = computed(() => (polygonId.value === "new" ? "Новый полигон" : "Редактировать полигон"));
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
  tileLayer = getTileLayer(resolvedTheme.value, { maxZoom: 20 }).addTo(map);
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
    color: getMapColor(resolvedTheme.value, "accent"),
    fillColor: getMapColor(resolvedTheme.value, "accentFill"),
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
  const muted = resolvedTheme.value === "dark" ? "#94a3b8" : "#cbd5e1";
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
    min_order_amount: polygon.min_order_amount || 0,
    delivery_cost: polygon.delivery_cost || 0,
  };
  renderPolygon(polygon);
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
    min_order_amount: form.value.min_order_amount,
    delivery_cost: form.value.delivery_cost,
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
    console.error("Ошибка сохранения полигона:", error);
    showErrorNotification("Ошибка сохранения полигона");
  }
};
watch(
  () => resolvedTheme.value,
  () => {
    if (!map) return;
    if (tileLayer) {
      tileLayer.remove();
    }
    tileLayer = getTileLayer(resolvedTheme.value, { maxZoom: 20 }).addTo(map);
    if (originalPolygon) {
      renderPolygon(originalPolygon);
    }
    renderBackgroundPolygons(originalPolygon?.id || null);
  },
);
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    if (cityId.value) {
      await referenceStore.loadBranches(cityId.value);
    }
    initMap();
    await loadPolygon();
  } catch (error) {
    console.error("Ошибка загрузки полигона:", error);
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
