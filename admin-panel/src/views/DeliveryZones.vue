<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Зоны доставки</CardTitle>
        <CardDescription>Управление полигонами доставки на карте</CardDescription>
      </CardHeader>
    </Card>

    <div class="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div class="space-y-4">
        <Card>
          <CardContent class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="cityId" @change="onCityChange">
              <option value="">Выберите город</option>
              <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                {{ city.name }}
              </option>
            </Select>
          </CardContent>
        </Card>

        <Card v-if="cityId">
          <CardContent class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиал</label>
            <Select v-model="branchId" @change="onBranchChange">
              <option value="">Выберите филиал</option>
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.name }}
              </option>
            </Select>
          </CardContent>
        </Card>

        <Card v-if="branchId">
          <CardHeader class="flex items-center justify-between">
            <CardTitle>Полигоны</CardTitle>
            <Badge variant="secondary">{{ polygons.length }}/3</Badge>
          </CardHeader>
          <CardContent class="space-y-2">
            <div
              v-for="polygon in polygons"
              :key="polygon.id"
              class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-2"
            >
              <p class="text-sm font-medium text-foreground">{{ polygon.name || `Полигон #${polygon.id}` }}</p>
              <div class="flex gap-1">
                <Button variant="ghost" size="icon" @click="editPolygon(polygon)">
                  <Pencil :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="deletePolygon(polygon)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </div>

            <Button v-if="polygons.length < 3" class="w-full" @click="startDrawing">
              <Plus :size="16" />
              Добавить полигон
            </Button>
            <p v-else class="text-center text-xs text-muted-foreground">Максимум 3 полигона на филиал</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent class="p-3">
          <div v-if="!branchId" class="mb-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {{ cityId ? "Показаны полигоны выбранного города. Выберите филиал для редактирования." : "Показаны все полигоны. Выберите город или филиал для редактирования." }}
          </div>
          <div id="map" class="min-h-[520px] w-full rounded-lg lg:min-h-[70vh]"></div>
        </CardContent>
      </Card>
    </div>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitPolygon">
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
        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import { useReferenceStore } from "../stores/reference.js";
import { useRoute, useRouter } from "vue-router";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import { useNotifications } from "../composables/useNotifications.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

if (L?.GeometryUtil?.readableArea && !L.GeometryUtil.__patched) {
  L.GeometryUtil.readableArea = () => "";
  L.GeometryUtil.__patched = true;
}

const referenceStore = useReferenceStore();
const route = useRoute();
const router = useRouter();
const { showErrorNotification } = useNotifications();
const cityId = ref("");
const branchId = ref("");
const branches = ref([]);
const polygons = ref([]);
const allPolygons = ref([]);
const showModal = ref(false);
const editing = ref(null);
const form = ref({
  name: "",
  delivery_time: 30,
  min_order_amount: 0,
  delivery_cost: 0,
});

let map = null;
let drawnItems = null;
let drawControl = null;
let currentLayer = null;
let editHandler = null;
const polygonLayers = new Map();
let branchesRequestId = 0;

const modalTitle = computed(() => (editing.value ? "Редактировать полигон" : "Новый полигон"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры полигона" : "Добавьте зону доставки"));

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
    polygons.value = response.data.polygons || [];
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
    zoomControl: true,
    attributionControl: false,
  }).setView(center, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
  }).addTo(map);

  // Добавляем маркер филиала
  if (selectedBranch) {
    const branchIcon = L.divIcon({
      className: "custom-branch-marker",
      html: `<div style="background-color: #FFD200; border: 3px solid #fff; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size: 18px;">🏪</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
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
        color: "#f97316",
        fillColor: "#f97316",
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

  // Цветовая палитра для разных полигонов
  const colors = ["#FFD200", "#9333EA", "#06B6D4"];

  const visiblePolygons = branchId.value
    ? polygons.value
    : cityId.value
      ? allPolygons.value.filter((polygon) => polygon.city_id === parseInt(cityId.value))
      : allPolygons.value;

  visiblePolygons.forEach((polygon, index) => {
    if (!polygon.polygon) return;
    const color = colors[index % colors.length];
    const style = {
      color: color,
      fillColor: color,
      fillOpacity: 0.25,
      weight: 3,
      opacity: 0.9,
    };

    const rawCoords = polygon.polygon?.coordinates?.[0];
    if (!rawCoords?.length) return;
    const coords = rawCoords.map((coord) => [coord[0], coord[1]]);

    const layer = L.polygon(coords, style);
    layer.polygonId = polygon.id;

    const popupContent = `
      <div style="font-family: system-ui, -apple-system, sans-serif;">
        <strong style="font-size: 14px;">${polygon.name || `Полигон #${polygon.id}`}</strong><br>
        <span style="font-size: 12px; color: #666;">⏱️ ${polygon.delivery_time || 30} мин</span><br>
        <span style="font-size: 12px; color: #666;">💰 Мин. заказ: ${polygon.min_order_amount || 0}₽</span><br>
        <span style="font-size: 12px; color: #666;">🚚 Доставка: ${polygon.delivery_cost || 0}₽</span>
      </div>
    `;
    layer.bindPopup(popupContent, { autoPan: false });

    drawnItems.addLayer(layer);
    if (branchId.value) {
      polygonLayers.set(polygon.id, layer);
    }
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
});
</script>
