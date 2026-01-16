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
            <div v-for="polygon in polygons" :key="polygon.id" class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-2">
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
          <div v-if="!branchId" class="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground lg:min-h-[70vh]">
            Выберите город и филиал для отображения карты
          </div>
          <div v-else id="map" class="min-h-[520px] w-full rounded-lg lg:min-h-[70vh]"></div>
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
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

const referenceStore = useReferenceStore();
const cityId = ref("");
const branchId = ref("");
const branches = ref([]);
const polygons = ref([]);
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

const onCityChange = () => {
  branchId.value = "";
  polygons.value = [];
  loadBranches();
  if (map) {
    map.remove();
    map = null;
  }
  drawnItems = null;
  currentLayer = null;
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

  const container = document.getElementById("map");
  if (!container) return;

  const selectedBranch = branches.value.find((b) => b.id === parseInt(branchId.value));
  const center = selectedBranch?.latitude && selectedBranch?.longitude ? [selectedBranch.latitude, selectedBranch.longitude] : [55.751244, 37.618423];

  map = L.map("map", {
    zoomControl: true,
    attributionControl: false,
  }).setView(center, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);

  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  drawControl = new L.Control.Draw({
    edit: {
      featureGroup: drawnItems,
      remove: false,
    },
    draw: {
      polygon: true,
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

  renderPolygonsOnMap();
};

const renderPolygonsOnMap = () => {
  if (!map || !drawnItems) return;
  drawnItems.clearLayers();
  polygonLayers.clear();

  polygons.value.forEach((polygon) => {
    if (polygon.polygon && polygon.polygon.coordinates) {
      const coords = polygon.polygon.coordinates[0].map((coord) => [coord[1], coord[0]]);
      const layer = L.polygon(coords);
      layer.polygonId = polygon.id;
      drawnItems.addLayer(layer);
      polygonLayers.set(polygon.id, layer);
    }
  });
};

const startDrawing = () => {
  if (drawControl) {
    new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
  }
};

const editPolygon = (polygon) => {
  if (currentLayer?.editing?.disable) {
    currentLayer.editing.disable();
  }
  editing.value = polygon;
  form.value = {
    name: polygon.name || "",
    delivery_time: polygon.delivery_time || 30,
    min_order_amount: polygon.min_order_amount || 0,
    delivery_cost: polygon.delivery_cost || 0,
  };
  const layer = polygonLayers.get(polygon.id);
  if (layer) {
    currentLayer = layer;
    if (currentLayer.editing?.enable) {
      currentLayer.editing.enable();
    }
    map?.fitBounds(currentLayer.getBounds(), { padding: [24, 24] });
  }
  showModal.value = true;
};

const deletePolygon = async (polygon) => {
  if (!confirm("Удалить полигон?")) return;
  try {
    await api.delete(`/api/polygons/admin/${polygon.id}`);
    await loadPolygons();
  } catch (error) {
    console.error("Ошибка удаления полигона:", error);
    alert("Не удалось удалить полигон");
  }
};

const closeModal = () => {
  showModal.value = false;
  editing.value = null;
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
    alert("Ошибка сохранения полигона");
  }
};

watch(
  () => showModal.value,
  (open) => {
    if (!open && currentLayer && !editing.value && drawnItems) {
      drawnItems.removeLayer(currentLayer);
      currentLayer = null;
    }
  }
);

onMounted(() => {
  referenceStore.loadCities();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>
