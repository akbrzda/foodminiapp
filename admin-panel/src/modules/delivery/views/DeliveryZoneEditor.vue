<template>
  <div class="relative h-full min-h-[calc(100vh-80px)] bg-background">
    <div id="editor-map" class="absolute inset-0 z-0"></div>
    <div class="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
      <Button type="button" size="icon" variant="secondary" class="h-10 w-10 shadow-lg" @click="zoomInMap">
        <Plus :size="18" />
      </Button>
      <Button type="button" size="icon" variant="secondary" class="h-10 w-10 shadow-lg" @click="zoomOutMap">
        <Minus :size="18" />
      </Button>
    </div>
    <div class="absolute left-4 top-4 z-10 w-[260px] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <div class="p-4 space-y-3">
        <PageHeader :title="pageTitle" description="Редактирование полигона">
          <template #actions>
            <BackButton :button-class="'w-full'" @click="goBack" />
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
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Мин. заказ (₽)</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.min_order_amount" type="number" min="0" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Доставка (₽)</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.delivery_cost" type="number" min="0" />
              </FieldContent>
            </Field>
          </FieldGroup>
          <p class="text-xs text-muted-foreground">
            Эти значения применяются, если для зоны не настроены тарифные ступени.
          </p>
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
        <Button class="w-full" :disabled="!hasCurrentPolygon" @click="savePolygon">
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Copy, Edit, Minus, Plus, Save } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";
import Button from "@/shared/components/ui/button/Button.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import BackButton from "@/shared/components/BackButton.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import DeliveryTariffEditorDialog from "@/modules/delivery/components/DeliveryTariffEditorDialog.vue";
import DeliveryTariffCopyDialog from "@/modules/delivery/components/DeliveryTariffCopyDialog.vue";

const MAP_ACCENT = "#ffd200";
const MAP_ACCENT_FILL = "rgba(255, 210, 0, 0.26)";
const MAP_MUTED = "rgba(148, 163, 184, 0.24)";

const isValidLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const calcCenter = (coords = []) => {
  if (!coords.length) return null;
  const sum = coords.reduce(
    (acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
};
const distanceSq = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
};
const getReferenceCenter = () => {
  const cityBranches = cityId.value ? referenceStore.branchesByCity[cityId.value] || [] : [];
  const selectedBranch = cityBranches.find((branch) => branch.id === branchId.value);
  if (selectedBranch?.latitude && selectedBranch?.longitude) {
    return { lat: Number(selectedBranch.latitude), lng: Number(selectedBranch.longitude) };
  }
  if (map) {
    const center = map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }
  return null;
};
const toLeafletCoords = (coords = [], referenceCenter = null) => {
  const points = coords.filter((coord) => Array.isArray(coord) && coord.length >= 2);
  const fromGeoJson = points
    .map((coord) => [Number(coord[1]), Number(coord[0])])
    .filter(([lat, lng]) => isValidLatLng(lat, lng));
  const legacyLatLng = points
    .map((coord) => [Number(coord[0]), Number(coord[1])])
    .filter(([lat, lng]) => isValidLatLng(lat, lng));
  if (!legacyLatLng.length) return fromGeoJson;
  if (!fromGeoJson.length) return legacyLatLng;
  if (!referenceCenter) return fromGeoJson;
  const geoJsonCenter = calcCenter(fromGeoJson);
  const legacyCenter = calcCenter(legacyLatLng);
  return distanceSq(geoJsonCenter, referenceCenter) <= distanceSq(legacyCenter, referenceCenter) ? fromGeoJson : legacyLatLng;
};

const ringToStoredCoords = (coords = []) => {
  const normalized = coords
    .filter((coord) => Array.isArray(coord) && coord.length >= 2)
    .map((coord) => [Number(coord[1]), Number(coord[0])])
    .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
  if (normalized.length < 3) return [];
  const [firstLng, firstLat] = normalized[0];
  const [lastLng, lastLat] = normalized[normalized.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    normalized.push([firstLng, firstLat]);
  }
  return normalized;
};

const collectBounds = (coords = []) => {
  if (!Array.isArray(coords) || !coords.length) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  coords.forEach((point) => {
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  });
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLat) || !Number.isFinite(maxLng)) {
    return null;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
};

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
const hasCurrentPolygon = computed(() => {
  if (!currentLayer) return false;
  const ring = currentLayer.geometry?.getCoordinates?.()?.[0] || [];
  return ringToStoredCoords(ring).length >= 4;
});

let yandexMaps = null;
let map = null;
let currentLayer = null;
let originalPolygon = null;
const backgroundLayers = [];

const ensureYandexMaps = async () => {
  if (yandexMaps) return yandexMaps;
  yandexMaps = await loadYandexMaps();
  return yandexMaps;
};

const clearCurrentLayer = () => {
  if (!map || !currentLayer) return;
  map.geoObjects.remove(currentLayer);
  currentLayer = null;
};

const clearBackgroundLayers = () => {
  if (!map) return;
  while (backgroundLayers.length) {
    const layer = backgroundLayers.pop();
    map.geoObjects.remove(layer);
  }
};

const fitMapToCoords = (coords) => {
  if (!map) return;
  const bounds = collectBounds(coords);
  if (!bounds) return;
  map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 });
};

const goBack = () => {
  router.push({
    name: "delivery-zones",
    query: {
      cityId: cityId.value || undefined,
      branchId: branchId.value || undefined,
    },
  });
};
const zoomInMap = () => {
  if (!map) return;
  map.setZoom(map.getZoom() + 1, { duration: 120 });
};
const zoomOutMap = () => {
  if (!map) return;
  map.setZoom(map.getZoom() - 1, { duration: 120 });
};

const initMap = async () => {
  const ymaps = await ensureYandexMaps();
  const container = document.getElementById("editor-map");
  if (!container) return;
  if (map) {
    map.destroy();
    map = null;
  }
  const branches = cityId.value ? referenceStore.branchesByCity[cityId.value] || [] : [];
  const selectedBranch = branches.find((b) => b.id === branchId.value);
  const center = selectedBranch?.latitude && selectedBranch?.longitude ? [selectedBranch.latitude, selectedBranch.longitude] : [55.751244, 37.618423];
  map = new ymaps.Map(
    container,
    {
      center,
      zoom: 12,
      controls: [],
    },
    {
      suppressMapOpenBlock: true,
    },
  );
};

const renderPolygon = (polygon) => {
  if (!map || !yandexMaps || !polygon?.polygon?.coordinates?.[0]) return;
  clearCurrentLayer();
  const rawCoords = polygon.polygon.coordinates[0];
  const coords = toLeafletCoords(rawCoords, getReferenceCenter());
  if (!coords.length) return;
  currentLayer = new yandexMaps.Polygon(
    [coords],
    {},
    {
      strokeColor: MAP_ACCENT,
      strokeWidth: 3,
      fillColor: MAP_ACCENT_FILL,
      fillOpacity: 0.8,
      opacity: 0.9,
      editorMaxPoints: 2000,
    },
  );
  map.geoObjects.add(currentLayer);
  fitMapToCoords(coords);
};

const renderBackgroundPolygons = (excludeId = null) => {
  if (!map || !yandexMaps) return;
  clearBackgroundLayers();
  branchPolygons.value.forEach((polygon) => {
    if (excludeId && polygon.id === excludeId) return;
    const rawCoords = polygon.polygon?.coordinates?.[0];
    if (!rawCoords?.length) return;
    const coords = toLeafletCoords(rawCoords, getReferenceCenter());
    if (!coords.length) return;
    const layer = new yandexMaps.Polygon(
      [coords],
      {},
      {
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        fillColor: MAP_MUTED,
        fillOpacity: 0.2,
        opacity: 0.6,
        interactivityModel: "default#silent",
      },
    );
    backgroundLayers.push(layer);
    map.geoObjects.add(layer);
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
    min_order_amount: Number(polygon.min_order_amount || 0),
    delivery_cost: Number(polygon.delivery_cost || 0),
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
  if (!map || !yandexMaps) return;
  clearCurrentLayer();
  currentLayer = new yandexMaps.Polygon(
    [[]],
    {},
    {
      strokeColor: MAP_ACCENT,
      strokeWidth: 3,
      fillColor: MAP_ACCENT_FILL,
      fillOpacity: 0.8,
      opacity: 0.9,
      editorMaxPoints: 2000,
    },
  );
  map.geoObjects.add(currentLayer);
  currentLayer.editor.startDrawing();
};

const resetPolygon = () => {
  if (polygonId.value === "new") {
    clearCurrentLayer();
    return;
  }
  renderPolygon(originalPolygon);
  renderBackgroundPolygons(originalPolygon?.id || null);
};

const savePolygon = async () => {
  if (!currentLayer) return;
  const ring = currentLayer.geometry?.getCoordinates?.()?.[0] || [];
  const storedPolygon = ringToStoredCoords(ring);
  if (storedPolygon.length < 4) {
    showErrorNotification("Нарисуйте корректный полигон");
    return;
  }
  const payload = {
    branch_id: branchId.value,
    name: form.value.name,
    delivery_time: form.value.delivery_time,
    min_order_amount: Math.max(0, Number(form.value.min_order_amount) || 0),
    delivery_cost: Math.max(0, Number(form.value.delivery_cost) || 0),
    polygon: storedPolygon,
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
    await initMap();
    await loadPolygon();
  } catch (error) {
    devError("Ошибка загрузки полигона:", error);
    showErrorNotification("Ошибка загрузки полигона");
  }
});
onUnmounted(() => {
  if (map) {
    map.destroy();
    map = null;
  }
  yandexMaps = null;
});
</script>
<style scoped></style>
