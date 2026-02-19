<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="pageTitle" :description="pageSubtitle">
          <template #actions>
            <BackButton @click="goBack" />
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submitBranch">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
              <FieldContent>
                <Select v-model="cityId" :disabled="isEditing">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите город" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                      {{ city.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название филиала</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" placeholder="Пиццерия на Ленина" :required="!form.iiko_terminal_group_id" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиал iiko (непривязанный)</FieldLabel>
              <FieldContent>
                <Select v-model="form.iiko_terminal_group_id" :disabled="iikoLoading">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Локальный филиал (без iiko)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Локальный филиал (без iiko)</SelectItem>
                    <SelectItem v-for="item in iikoBranches" :key="item.id" :value="item.id">
                      {{ item.name }}<span v-if="item.organization_name"> ({{ item.organization_name }})</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p class="text-xs text-muted-foreground">
                  После сохранения филиала с привязкой iiko адрес, контакт и график подтянутся автоматически.
                </p>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Адрес</FieldLabel>
              <FieldContent>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <Input v-model="form.address" class="flex-1" placeholder="ул. Ленина, д. 10" />
                  <Button type="button" variant="secondary" :disabled="!form.address" @click="geocodeAddress">
                    <MapPinned :size="16" />
                    Найти на карте
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">Введите адрес и нажмите "Найти на карте"</p>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div class="rounded-xl border border-border bg-background p-2">
            <div id="branch-map" class="h-64 w-full rounded-lg"></div>
            <p class="mt-2 text-xs text-muted-foreground">Кликните на карте для уточнения позиции</p>
            <div v-if="form.latitude && form.longitude" class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin :size="14" />
              {{ Number(form.latitude).toFixed(6) }}, {{ Number(form.longitude).toFixed(6) }}
            </div>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Телефон</FieldLabel>
              <FieldContent>
                <Input v-model="form.phone" placeholder="+7 (900) 909-22-22" @input="handlePhoneInput" />
                <p v-if="phoneError" class="text-xs text-red-500">{{ phoneError }}</p>
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время приготовления (мин)</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.prep_time" type="number" min="0" placeholder="20" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время сборки (мин)</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.assembly_time" type="number" min="0" placeholder="10" />
                </FieldContent>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
              <FieldContent>
                <Select v-model="form.is_active">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Активен</SelectItem>
                    <SelectItem :value="false">Неактивен</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div class="rounded-xl border border-border bg-muted/30 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-foreground">График работы</div>
                <div class="text-xs text-muted-foreground">Добавьте дни недели и время</div>
              </div>
              <Button type="button" variant="outline" size="sm" @click="addWorkingDay">
                <Plus :size="16" />
                Добавить день
              </Button>
            </div>
            <div class="mt-3 space-y-2">
              <div v-if="form.working_hours.length === 0" class="text-xs text-muted-foreground">График не задан</div>
              <div v-for="(schedule, index) in form.working_hours" :key="index" class="flex flex-wrap items-center gap-2">
                <Select v-model="schedule.day" class="w-40">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="День" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="day in days" :key="day.value" :value="day.value" :disabled="isDayTaken(day.value, index)">
                      {{ day.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input v-model="schedule.open" type="time" class="w-32" />
                <Input v-model="schedule.close" type="time" class="w-32" />
                <Button type="button" variant="ghost" size="icon" @click="removeWorkingDay(index)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </div>
          </div>

          <Button class="w-full" type="submit" :disabled="saving">
            <Save :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, nextTick, onMounted, onUnmounted, ref, watch, shallowRef } from "vue";
import { MapPin, MapPinned, Plus, Save, Trash2 } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "@/shared/api/client.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BackButton from "@/shared/components/BackButton.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { createMarkerIcon, getTileLayer } from "@/shared/utils/leaflet.js";
import { formatPhoneInput, isValidPhone, normalizeBoolean, normalizePhone } from "@/shared/utils/format.js";

const route = useRoute();
const router = useRouter();
const referenceStore = useReferenceStore();
const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();

const branchId = computed(() => (route.params.id ? Number(route.params.id) : null));
const isEditing = computed(() => Number.isFinite(branchId.value));
const pageTitle = computed(() => (isEditing.value ? "Редактировать филиал" : "Новый филиал"));
const pageSubtitle = computed(() => (isEditing.value ? "Изменение данных филиала" : "Создание филиала"));

const saving = ref(false);
const iikoLoading = ref(false);
const iikoBranches = ref([]);
const currentBranchName = ref("");
const iikoOrganizationByTerminalGroupId = ref({});
const phoneError = ref("");
const cityId = ref(route.query.cityId ? Number(route.query.cityId) : null);
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
  iiko_terminal_group_id: "",
  iiko_organization_id: "",
});

const branchMap = shallowRef(null);
const branchMarker = shallowRef(null);
const branchTileLayer = shallowRef(null);

const days = [
  { value: "monday", label: "Понедельник" },
  { value: "tuesday", label: "Вторник" },
  { value: "wednesday", label: "Среда" },
  { value: "thursday", label: "Четверг" },
  { value: "friday", label: "Пятница" },
  { value: "saturday", label: "Суббота" },
  { value: "sunday", label: "Воскресенье" },
];
const dayOrder = days.reduce((acc, day, index) => {
  acc[day.value] = index;
  return acc;
}, {});

const goBack = () => {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  router.push({ name: "branches" });
};

const isDayTaken = (day, index) => form.value.working_hours.some((schedule, idx) => idx !== index && schedule.day === day);

const getNextAvailableDay = () => {
  const used = new Set(form.value.working_hours.map((schedule) => schedule.day));
  const next = days.find((day) => !used.has(day.value));
  return next?.value || "";
};

const addWorkingDay = () => {
  const nextDay = getNextAvailableDay();
  if (!nextDay) {
    showWarningNotification("Все дни недели уже добавлены");
    return;
  }
  form.value.working_hours.push({
    day: nextDay,
    open: "09:00",
    close: "21:00",
  });
  sortWorkingHours();
};

const removeWorkingDay = (index) => {
  form.value.working_hours.splice(index, 1);
};

const sortWorkingHours = () => {
  form.value.working_hours.sort((a, b) => {
    const orderA = dayOrder[a.day] ?? Number.MAX_SAFE_INTEGER;
    const orderB = dayOrder[b.day] ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
};

const initBranchMap = () => {
  if (branchMap.value) {
    branchMap.value.remove();
  }
  let center = [55.751244, 37.618423];
  if (form.value.latitude && form.value.longitude) {
    center = [form.value.latitude, form.value.longitude];
  } else if (cityId.value) {
    const selectedCity = referenceStore.cities.find((city) => city.id === Number(cityId.value));
    if (selectedCity?.latitude && selectedCity?.longitude) {
      center = [selectedCity.latitude, selectedCity.longitude];
    }
  }
  const container = document.getElementById("branch-map");
  if (!container) return;
  branchMap.value = L.map(container, {
    attributionControl: false,
    zoomControl: true,
  }).setView(center, 13);
  branchTileLayer.value = getTileLayer({ maxZoom: 20 }).addTo(branchMap.value);
  if (form.value.latitude && form.value.longitude) {
    const branchIcon = createMarkerIcon("pin", "primary", 18);
    branchMarker.value = L.marker([form.value.latitude, form.value.longitude], {
      draggable: true,
      icon: branchIcon,
    }).addTo(branchMap.value);
    branchMarker.value.on("dragend", () => {
      const pos = branchMarker.value.getLatLng();
      form.value.latitude = pos.lat;
      form.value.longitude = pos.lng;
    });
  }
  branchMap.value.on("click", (event) => {
    form.value.latitude = event.latlng.lat;
    form.value.longitude = event.latlng.lng;
    const branchIcon = createMarkerIcon("pin", "primary", 18);
    if (branchMarker.value) {
      branchMarker.value.setLatLng(event.latlng);
    } else {
      branchMarker.value = L.marker(event.latlng, {
        draggable: true,
        icon: branchIcon,
      }).addTo(branchMap.value);
      branchMarker.value.on("dragend", () => {
        const pos = branchMarker.value.getLatLng();
        form.value.latitude = pos.lat;
        form.value.longitude = pos.lng;
      });
    }
  });
};

const geocodeAddress = async () => {
  if (!form.value.address || !cityId.value) return;
  const selectedCity = referenceStore.cities.find((city) => city.id === parseInt(cityId.value, 10));
  const cityName = selectedCity?.name || "";
  const addressWithCity = cityName ? `${form.value.address}, ${cityName}` : form.value.address;
  try {
    const response = await api.post("/api/polygons/geocode", {
      address: addressWithCity,
    });
    if (response.data.lat && response.data.lng) {
      form.value.latitude = response.data.lat;
      form.value.longitude = response.data.lng;
      if (branchMap.value) {
        branchMap.value.setView([response.data.lat, response.data.lng], 15);
        if (branchMarker.value) {
          branchMarker.value.setLatLng([response.data.lat, response.data.lng]);
        } else {
          branchMarker.value = L.marker([response.data.lat, response.data.lng], {
            draggable: true,
            icon: createMarkerIcon("pin", "primary", 18),
          }).addTo(branchMap.value);
          branchMarker.value.on("dragend", () => {
            const pos = branchMarker.value.getLatLng();
            form.value.latitude = pos.lat;
            form.value.longitude = pos.lng;
          });
        }
      }
    }
  } catch (error) {
    devError("Ошибка геокодирования:", error);
    showErrorNotification("Не удалось найти адрес на карте");
  }
};

const loadBranch = async () => {
  if (!isEditing.value) {
    await nextTick();
    initBranchMap();
    return;
  }
  if (!cityId.value) {
    showErrorNotification("Не указан город филиала");
    goBack();
    return;
  }
  try {
    const response = await api.get(`/api/cities/admin/${cityId.value}/branches`);
    const branch = (response.data.branches || []).find((item) => item.id === branchId.value);
    if (!branch) {
      showErrorNotification("Филиал не найден");
      goBack();
      return;
    }
    currentBranchName.value = String(branch.name || "").trim();
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
      phone: branch.phone ? formatPhoneInput(branch.phone) : "",
      working_hours: workingHours,
      prep_time: Number(branch.prep_time || 0),
      assembly_time: Number(branch.assembly_time || 0),
      is_active: normalizeBoolean(branch.is_active, true),
      iiko_terminal_group_id: String(branch.iiko_terminal_group_id || ""),
      iiko_organization_id: String(branch.iiko_organization_id || ""),
    };
    sortWorkingHours();
    await nextTick();
    initBranchMap();
  } catch (error) {
    devError("Ошибка загрузки филиала:", error);
    showErrorNotification("Ошибка загрузки филиала");
    goBack();
  }
};

const loadIikoBranches = async () => {
  iikoLoading.value = true;
  try {
    const response = await api.get("/api/cities/admin/iiko/unmapped-branches");
    const list = Array.isArray(response.data?.branches) ? response.data.branches : [];
    iikoBranches.value = list;
    iikoOrganizationByTerminalGroupId.value = list.reduce((acc, item) => {
      acc[String(item.id)] = String(item.organization_id || "");
      return acc;
    }, {});
  } catch (error) {
    iikoBranches.value = [];
  } finally {
    iikoLoading.value = false;
  }
};

const submitBranch = async () => {
  if (!cityId.value) {
    showErrorNotification("Выберите город");
    return;
  }
  saving.value = true;
  try {
    phoneError.value = "";
    const phoneDigits = String(form.value.phone || "").replace(/\D/g, "");
    if (phoneDigits.length > 1 && !isValidPhone(form.value.phone)) {
      phoneError.value = "Некорректный номер телефона";
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
      phone: phoneDigits.length > 1 ? normalizePhone(form.value.phone) : "",
      working_hours: Object.keys(workingHours).length > 0 ? workingHours : null,
      prep_time: form.value.prep_time || 0,
      assembly_time: form.value.assembly_time || 0,
      is_active: form.value.is_active,
      iiko_terminal_group_id: form.value.iiko_terminal_group_id ? String(form.value.iiko_terminal_group_id) : "",
      iiko_organization_id: form.value.iiko_organization_id ? String(form.value.iiko_organization_id) : "",
    };
    if (isEditing.value) {
      await api.put(`/api/cities/admin/${cityId.value}/branches/${branchId.value}`, payload);
    } else {
      await api.post(`/api/cities/admin/${cityId.value}/branches`, payload);
    }
    showSuccessNotification(isEditing.value ? "Филиал обновлен" : "Филиал создан");
    goBack();
  } catch (error) {
    devError("Ошибка сохранения филиала:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка сохранения филиала");
  } finally {
    saving.value = false;
  }
};
const handlePhoneInput = (event) => {
  form.value.phone = formatPhoneInput(event.target?.value || form.value.phone);
  if (phoneError.value) {
    phoneError.value = "";
  }
};

watch(
  () => cityId.value,
  async (value) => {
    if (!value) return;
    router.replace({ query: { ...route.query, cityId: String(value) } });
    await nextTick();
    initBranchMap();
  },
);

watch(
  () => form.value.iiko_terminal_group_id,
  (value) => {
    const key = String(value || "");
    if (!key) {
      form.value.iiko_organization_id = "";
      return;
    }
    form.value.iiko_organization_id = iikoOrganizationByTerminalGroupId.value[key] || form.value.iiko_organization_id || "";
  },
);

watch(
  () => form.value.working_hours.map((schedule) => schedule.day || "").join("|"),
  () => {
    sortWorkingHours();
  },
);

onMounted(async () => {
  await referenceStore.loadCities();
  await loadIikoBranches();
  if (!cityId.value) {
    if (isEditing.value) {
      showErrorNotification("Не указан город филиала");
      goBack();
      return;
    }
    if (referenceStore.cities.length) {
      cityId.value = referenceStore.cities[0].id;
    }
  }
  await loadBranch();

  if (form.value.iiko_terminal_group_id) {
    const exists = iikoBranches.value.some((item) => String(item.id) === String(form.value.iiko_terminal_group_id));
    if (!exists) {
      iikoBranches.value.unshift({
        id: String(form.value.iiko_terminal_group_id),
        name: currentBranchName.value || "Текущий филиал",
        organization_name: "",
      });
    }
  }
});

onUnmounted(() => {
  if (branchMap.value) {
    branchMap.value.remove();
    branchMap.value = null;
    branchMarker.value = null;
    branchTileLayer.value = null;
  }
});
</script>
