<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Города</CardTitle>
          <CardDescription>Управление городами доставки</CardDescription>
        </div>
        <Button @click="openModal()">
          <Plus :size="16" />
          Добавить город
        </Button>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Список городов</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Город</TableHead>
              <TableHead>Координаты</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="city in cities" :key="city.id">
              <TableCell>
                <div class="font-medium text-foreground">{{ city.name }}</div>
                <div class="text-xs text-muted-foreground">ID: {{ city.id }}</div>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin :size="14" />
                  {{ city.latitude && city.longitude ? `${city.latitude}, ${city.longitude}` : "—" }}
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="city.is_active ? 'success' : 'secondary'">{{ city.is_active ? "Активен" : "Неактивен" }}</Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(city)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteCity(city)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitCity">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название города</label>
          <Input v-model="form.name" placeholder="Москва" required />
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Поиск на карте</label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <Input v-model="searchQuery" class="flex-1" placeholder="Введите название города" />
            <Button type="button" variant="secondary" :disabled="!searchQuery" @click="geocodeCity">
              <Search :size="16" />
              Найти
            </Button>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-background p-2">
          <div id="city-map" class="h-64 w-full rounded-lg"></div>
          <p class="mt-2 text-xs text-muted-foreground">Кликните на карте для выбора центра города</p>
          <div v-if="form.latitude && form.longitude" class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin :size="14" />
            {{ Number(form.latitude).toFixed(6) }}, {{ Number(form.longitude).toFixed(6) }}
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
          <Select v-model="form.is_active">
            <option :value="true">Активен</option>
            <option :value="false">Неактивен</option>
          </Select>
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
import { computed, onMounted, ref, nextTick } from "vue";
import { MapPin, Pencil, Plus, Save, Search, Trash2 } from "lucide-vue-next";
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
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const referenceStore = useReferenceStore();
const cities = ref([]);
const showModal = ref(false);
const editing = ref(null);
const searchQuery = ref("");
const form = ref({
  name: "",
  latitude: null,
  longitude: null,
  is_active: true,
});

let cityMap = null;
let cityMarker = null;

const modalTitle = computed(() => (editing.value ? "Редактировать город" : "Новый город"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры города" : "Добавьте новый город доставки"));

const loadCities = async () => {
  try {
    const response = await api.get("/api/cities/admin/all");
    cities.value = response.data.cities || [];
  } catch (error) {
    console.error("Ошибка загрузки городов:", error);
  }
};

const openModal = (city = null) => {
  editing.value = city;
  if (city) {
    form.value = {
      name: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      is_active: city.is_active,
    };
    searchQuery.value = city.name;
  } else {
    form.value = {
      name: "",
      latitude: null,
      longitude: null,
      is_active: true,
    };
    searchQuery.value = "";
  }
  showModal.value = true;

  nextTick(() => {
    initCityMap();
  });
};

const initCityMap = () => {
  if (cityMap) {
    cityMap.remove();
  }

  const center = form.value.latitude && form.value.longitude ? [form.value.latitude, form.value.longitude] : [55.751244, 37.618423];

  const container = document.getElementById("city-map");
  if (!container) return;

  cityMap = L.map(container, {
    attributionControl: false,
    zoomControl: true,
  }).setView(center, form.value.latitude ? 11 : 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
  }).addTo(cityMap);

  if (form.value.latitude && form.value.longitude) {
    const cityIcon = L.divIcon({
      className: "custom-city-marker",
      html: `<div style="background-color: #9333EA; border: 3px solid #fff; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size: 20px;">🏙️</span>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    cityMarker = L.marker([form.value.latitude, form.value.longitude], {
      draggable: true,
      icon: cityIcon,
    }).addTo(cityMap);

    cityMarker.on("dragend", () => {
      const pos = cityMarker.getLatLng();
      form.value.latitude = pos.lat;
      form.value.longitude = pos.lng;
    });
  }

  cityMap.on("click", (e) => {
    form.value.latitude = e.latlng.lat;
    form.value.longitude = e.latlng.lng;

    const cityIcon = L.divIcon({
      className: "custom-city-marker",
      html: `<div style="background-color: #9333EA; border: 3px solid #fff; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size: 20px;">🏙️</span>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    if (cityMarker) {
      cityMarker.setLatLng(e.latlng);
    } else {
      cityMarker = L.marker(e.latlng, {
        draggable: true,
        icon: cityIcon,
      }).addTo(cityMap);

      cityMarker.on("dragend", () => {
        const pos = cityMarker.getLatLng();
        form.value.latitude = pos.lat;
        form.value.longitude = pos.lng;
      });
    }
  });
};

const geocodeCity = async () => {
  if (!searchQuery.value) return;

  try {
    const response = await api.post("/api/polygons/geocode", {
      address: searchQuery.value,
    });

    if (response.data.lat && response.data.lng) {
      form.value.latitude = response.data.lat;
      form.value.longitude = response.data.lng;

      if (cityMap) {
        cityMap.setView([response.data.lat, response.data.lng], 11);

        if (cityMarker) {
          cityMarker.setLatLng([response.data.lat, response.data.lng]);
        } else {
          cityMarker = L.marker([response.data.lat, response.data.lng], {
            draggable: true,
          }).addTo(cityMap);

          cityMarker.on("dragend", () => {
            const pos = cityMarker.getLatLng();
            form.value.latitude = pos.lat;
            form.value.longitude = pos.lng;
          });
        }
      }
    }
  } catch (error) {
    console.error("Ошибка геокодирования:", error);
    alert("Не удалось найти город на карте");
  }
};

const closeModal = () => {
  showModal.value = false;
  editing.value = null;
  searchQuery.value = "";
  if (cityMap) {
    cityMap.remove();
    cityMap = null;
    cityMarker = null;
  }
};

const submitCity = async () => {
  try {
    if (editing.value) {
      await api.put(`/api/cities/admin/${editing.value.id}`, form.value);
    } else {
      await api.post("/api/cities/admin", form.value);
    }
    await loadCities();
    await referenceStore.loadCities();
    closeModal();
  } catch (error) {
    console.error("Ошибка сохранения города:", error);
    alert(error.response?.data?.error || "Ошибка сохранения города");
  }
};

const deleteCity = async (city) => {
  if (!confirm(`Удалить город "${city.name}"?`)) return;
  try {
    await api.delete(`/api/cities/admin/${city.id}`);
    await loadCities();
    await referenceStore.loadCities();
  } catch (error) {
    console.error("Ошибка удаления города:", error);
    alert(error.response?.data?.error || "Ошибка удаления города");
  }
};

onMounted(() => {
  loadCities();
});
</script>
