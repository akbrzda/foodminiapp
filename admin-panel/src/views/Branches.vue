<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Филиалы</CardTitle>
        <CardDescription>Управление филиалами и временем приготовления</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 md:grid-cols-[1fr_auto]">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="cityId" @change="loadBranches">
              <option value="">Выберите город</option>
              <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                {{ city.name }}
              </option>
            </Select>
          </div>
          <div class="flex items-end">
            <Button class="w-full md:w-auto" :disabled="!cityId" @click="openModal()">
              <Plus :size="16" />
              Добавить филиал
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card v-if="cityId">
      <CardHeader>
        <CardTitle>Список филиалов</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Филиал</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Время</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="branch in branches" :key="branch.id">
              <TableCell>
                <div class="font-medium text-foreground">{{ branch.name }}</div>
                <div class="text-xs text-muted-foreground">{{ branch.address || "—" }}</div>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone :size="14" />
                  {{ branch.phone || "—" }}
                </div>
                <div v-if="branch.latitude && branch.longitude" class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin :size="14" />
                  {{ branch.latitude }}, {{ branch.longitude }}
                </div>
              </TableCell>
              <TableCell>
                <div class="text-xs text-muted-foreground">Приготовление: {{ formatTimeValue(branch.prep_time) }}</div>
                <div class="text-xs text-muted-foreground">Сборка: {{ formatTimeValue(branch.assembly_time) }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="branch.is_active ? 'success' : 'secondary'">{{ branch.is_active ? "Активен" : "Неактивен" }}</Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(branch)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteBranch(branch)">
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
      <form class="space-y-4" @submit.prevent="submitBranch">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название филиала</label>
          <Input v-model="form.name" placeholder="Пиццерия на Ленина" required />
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Адрес</label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <Input v-model="form.address" class="flex-1" placeholder="ул. Ленина, д. 10" />
            <Button type="button" variant="secondary" :disabled="!form.address" @click="geocodeAddress">
              <MapPinned :size="16" />
              Найти на карте
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">Введите адрес и нажмите "Найти на карте"</p>
        </div>

        <div class="rounded-xl border border-border bg-background p-2">
          <div id="branch-map" class="h-64 w-full rounded-lg"></div>
          <p class="mt-2 text-xs text-muted-foreground">Кликните на карте для уточнения позиции</p>
          <div v-if="form.latitude && form.longitude" class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin :size="14" />
            {{ Number(form.latitude).toFixed(6) }}, {{ Number(form.longitude).toFixed(6) }}
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Телефон</label>
          <Input v-model="form.phone" placeholder="+7 (999) 123-45-67" />
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время приготовления (мин)</label>
            <Input v-model.number="form.prep_time" type="number" min="0" placeholder="20" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время сборки для доставки (мин)</label>
            <Input v-model.number="form.assembly_time" type="number" min="0" placeholder="10" />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Часы работы</label>
          <div class="space-y-2">
            <div v-for="(schedule, index) in form.working_hours" :key="index" class="flex flex-wrap items-center gap-2">
              <Select v-model="schedule.day" class="w-36">
                <option v-for="day in days" :key="day.value" :value="day.value" :disabled="isDayTaken(day.value, index)">
                  {{ day.label }}
                </option>
              </Select>
              <Input v-model="schedule.open" type="time" class="w-28" placeholder="09:00" />
              <span class="text-xs text-muted-foreground">—</span>
              <Input v-model="schedule.close" type="time" class="w-28" placeholder="21:00" />
              <Button type="button" variant="ghost" size="icon" @click="removeWorkingDay(index)">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
            <Button type="button" variant="outline" @click="addWorkingDay">
              <Plus :size="16" />
              Добавить день
            </Button>
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
import { computed, onMounted, ref, watch, nextTick } from "vue";
import { MapPin, MapPinned, Pencil, Phone, Plus, Save, Trash2 } from "lucide-vue-next";
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
import { useNotifications } from "../composables/useNotifications.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();
const cityId = ref("");
const branches = ref([]);
const showModal = ref(false);
const editing = ref(null);
const form = ref({
  name: "",
  address: "",
  latitude: null,
  longitude: null,
  phone: "",
  working_hours: [],
  prep_time: 0,
  assembly_time: 0,
  is_active: true,
});

let branchMap = null;
let branchMarker = null;

const modalTitle = computed(() => (editing.value ? "Редактировать филиал" : "Новый филиал"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры филиала" : "Добавьте новый филиал"));

let branchesRequestId = 0;

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

const openModal = (branch = null) => {
  editing.value = branch;
  if (branch) {
    const workingHours = [];
    if (branch.working_hours && typeof branch.working_hours === "object") {
      for (const [day, hours] of Object.entries(branch.working_hours)) {
        if (typeof hours === "string" && hours.includes("-")) {
          const [open, close] = hours.split("-");
          workingHours.push({ day, open, close });
        }
      }
    }

    form.value = {
      name: branch.name,
      address: branch.address || "",
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      phone: branch.phone || "",
      working_hours: workingHours,
      prep_time: Number(branch.prep_time || 0),
      assembly_time: Number(branch.assembly_time || 0),
      is_active: branch.is_active,
    };
  } else {
    form.value = {
      name: "",
      address: "",
      latitude: null,
      longitude: null,
      phone: "",
      working_hours: [],
      prep_time: 0,
      assembly_time: 0,
      is_active: true,
    };
  }
  showModal.value = true;

  nextTick(() => {
    initBranchMap();
  });
};

const initBranchMap = () => {
  if (branchMap) {
    branchMap.remove();
  }

  let center = [55.751244, 37.618423];

  if (form.value.latitude && form.value.longitude) {
    center = [form.value.latitude, form.value.longitude];
  } else if (cityId.value) {
    const selectedCity = referenceStore.cities.find((c) => c.id === parseInt(cityId.value));
    if (selectedCity?.latitude && selectedCity?.longitude) {
      center = [selectedCity.latitude, selectedCity.longitude];
    }
  }

  const container = document.getElementById("branch-map");
  if (!container) return;

  branchMap = L.map(container, {
    attributionControl: false,
    zoomControl: true,
  }).setView(center, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
  }).addTo(branchMap);

  if (form.value.latitude && form.value.longitude) {
    const branchIcon = L.divIcon({
      className: "custom-branch-marker",
      html: `<div style="background-color: #FFD200; border: 3px solid #fff; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size: 18px;">🏪</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    branchMarker = L.marker([form.value.latitude, form.value.longitude], {
      draggable: true,
      icon: branchIcon,
    }).addTo(branchMap);

    branchMarker.on("dragend", () => {
      const pos = branchMarker.getLatLng();
      form.value.latitude = pos.lat;
      form.value.longitude = pos.lng;
    });
  }

  branchMap.on("click", (e) => {
    form.value.latitude = e.latlng.lat;
    form.value.longitude = e.latlng.lng;

    const branchIcon = L.divIcon({
      className: "custom-branch-marker",
      html: `<div style="background-color: #FFD200; border: 3px solid #fff; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size: 18px;">🏪</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (branchMarker) {
      branchMarker.setLatLng(e.latlng);
    } else {
      branchMarker = L.marker(e.latlng, {
        draggable: true,
        icon: branchIcon,
      }).addTo(branchMap);

      branchMarker.on("dragend", () => {
        const pos = branchMarker.getLatLng();
        form.value.latitude = pos.lat;
        form.value.longitude = pos.lng;
      });
    }
  });
};

const geocodeAddress = async () => {
  if (!form.value.address) return;

  const selectedCity = referenceStore.cities.find((c) => c.id === parseInt(cityId.value));
  const cityName = selectedCity?.name || "";
  const addressWithCity = cityName ? `${form.value.address}, ${cityName}` : form.value.address;

  try {
    const response = await api.post("/api/polygons/geocode", {
      address: addressWithCity,
    });

    if (response.data.lat && response.data.lng) {
      form.value.latitude = response.data.lat;
      form.value.longitude = response.data.lng;

      if (branchMap) {
        branchMap.setView([response.data.lat, response.data.lng], 15);

        if (branchMarker) {
          branchMarker.setLatLng([response.data.lat, response.data.lng]);
        } else {
          branchMarker = L.marker([response.data.lat, response.data.lng], {
            draggable: true,
          }).addTo(branchMap);

          branchMarker.on("dragend", () => {
            const pos = branchMarker.getLatLng();
            form.value.latitude = pos.lat;
            form.value.longitude = pos.lng;
          });
        }
      }
    }
  } catch (error) {
    console.error("Ошибка геокодирования:", error);
    showErrorNotification("Не удалось найти адрес на карте");
  }
};

const addWorkingDay = () => {
  const nextDay = getNextAvailableDay();
  if (!nextDay) {
    showErrorNotification("Все дни недели уже добавлены");
    return;
  }
  form.value.working_hours.push({
    day: nextDay,
    open: "09:00",
    close: "21:00",
  });
};

const removeWorkingDay = (index) => {
  form.value.working_hours.splice(index, 1);
};

const closeModal = () => {
  showModal.value = false;
  editing.value = null;
  if (branchMap) {
    branchMap.remove();
    branchMap = null;
    branchMarker = null;
  }
};

const formatTimeValue = (value) => {
  const time = Number(value || 0);
  if (!time) return "—";
  return `${time} мин`;
};

const submitBranch = async () => {
  try {
    if (!areWorkingDaysUnique()) {
      showErrorNotification("Дни недели в графике должны быть уникальными");
      return;
    }

    const workingHours = {};
    form.value.working_hours.forEach((schedule) => {
      if (schedule.day && schedule.open && schedule.close) {
        workingHours[schedule.day] = `${schedule.open}-${schedule.close}`;
      }
    });

    const payload = {
      name: form.value.name,
      address: form.value.address,
      latitude: form.value.latitude,
      longitude: form.value.longitude,
      phone: form.value.phone,
      working_hours: Object.keys(workingHours).length > 0 ? workingHours : null,
      prep_time: form.value.prep_time || 0,
      assembly_time: form.value.assembly_time || 0,
      is_active: form.value.is_active,
    };

    if (editing.value) {
      await api.put(`/api/cities/admin/${cityId.value}/branches/${editing.value.id}`, payload);
    } else {
      await api.post(`/api/cities/admin/${cityId.value}/branches`, payload);
    }

    await loadBranches();
    closeModal();
  } catch (error) {
    console.error("Ошибка сохранения филиала:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка сохранения филиала");
  }
};

const deleteBranch = async (branch) => {
  if (!confirm(`Удалить филиал "${branch.name}"?`)) return;
  try {
    await api.delete(`/api/cities/admin/${cityId.value}/branches/${branch.id}`);
    await loadBranches();
  } catch (error) {
    console.error("Ошибка удаления филиала:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка удаления филиала");
  }
};

onMounted(() => {
  referenceStore.loadCities();
});

const days = [
  { value: "monday", label: "Понедельник" },
  { value: "tuesday", label: "Вторник" },
  { value: "wednesday", label: "Среда" },
  { value: "thursday", label: "Четверг" },
  { value: "friday", label: "Пятница" },
  { value: "saturday", label: "Суббота" },
  { value: "sunday", label: "Воскресенье" },
];

const isDayTaken = (day, index) => form.value.working_hours.some((schedule, idx) => idx !== index && schedule.day === day);

const getNextAvailableDay = () => {
  const used = new Set(form.value.working_hours.map((schedule) => schedule.day));
  const next = days.find((day) => !used.has(day.value));
  return next?.value || "";
};

const areWorkingDaysUnique = () => {
  const used = new Set();
  for (const schedule of form.value.working_hours) {
    if (!schedule.day) continue;
    if (used.has(schedule.day)) return false;
    used.add(schedule.day);
  }
  return true;
};
</script>
