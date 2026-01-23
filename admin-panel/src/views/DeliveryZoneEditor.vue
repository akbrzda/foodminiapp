<template>
  <div class="relative h-full min-h-[calc(100vh-80px)] bg-background">
    <div id="editor-map" class="absolute inset-0 z-0"></div>
    <div class="absolute left-4 top-4 z-10 w-[260px] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <div class="p-4 space-y-3">
        <div>
          <CardTitle class="text-base">{{ pageTitle }}</CardTitle>
          <CardDescription>Редактирование полигона</CardDescription>
        </div>
        <Button variant="outline" class="w-full" @click="goBack">Назад</Button>
      </div>
    </div>
    <div
      class="absolute right-4 top-4 bottom-4 z-20 w-[360px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur flex flex-col"
    >
      <CardHeader class="border-b border-border px-4 py-4">
        <CardTitle>Параметры полигона</CardTitle>
      </CardHeader>
      <CardContent class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="form.name" placeholder="Центральная зона" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время доставки (мин)</label>
          <Input v-model.number="form.delivery_time" type="number" min="0" required />
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Мин. сумма заказа (₽)</label>
            <Input v-model.number="form.min_order_amount" type="number" min="0" step="10" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Стоимость доставки (₽)</label>
            <Input v-model.number="form.delivery_cost" type="number" min="0" step="10" />
          </div>
        </div>
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Save } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { useNotifications } from "../composables/useNotifications.js";
import Button from "../components/ui/Button.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
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
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20 }).addTo(map);
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
          color: "#FFD200",
          fillColor: "#FFD200",
          fillOpacity: 0.25,
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
    color: "#FFD200",
    fillColor: "#FFD200",
    fillOpacity: 0.25,
    weight: 3,
    opacity: 0.9,
  });
  drawnItems.addLayer(currentLayer);
  map.fitBounds(currentLayer.getBounds(), { padding: [24, 24] });
};
const renderBackgroundPolygons = (excludeId = null) => {
  if (!map || !backgroundLayer) return;
  backgroundLayer.clearLayers();
  const style = {
    color: "#94a3b8",
    fillColor: "#94a3b8",
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
onMounted(async () => {
  await referenceStore.loadCities();
  if (cityId.value) {
    await referenceStore.loadBranches(cityId.value);
  }
  initMap();
  await loadPolygon();
});
onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
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
