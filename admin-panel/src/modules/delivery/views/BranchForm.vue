<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="pageTitle" :description="pageSubtitle">
          <template #actions>
            <div class="header-actions">
              <BackButton @click="goBack" />
            </div>
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
                  Привязка к iiko задает только связь. Локальные данные филиала (название, адрес, контакт и график) не перезаписываются автоматически.
                </p>
                <div class="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground md:grid-cols-2">
                  <div class="space-y-1">
                    <div class="font-semibold uppercase tracking-wide">Terminal/POS ID</div>
                    <div class="break-all text-foreground">{{ form.iiko_terminal_group_id || "Не привязан" }}</div>
                  </div>
                  <div class="space-y-1">
                    <div class="font-semibold uppercase tracking-wide">Organization ID</div>
                    <div class="break-all text-foreground">{{ form.iiko_organization_id || "Не привязан" }}</div>
                  </div>
                </div>
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

          <div class="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div class="space-y-3">
              <div class="text-sm font-semibold text-foreground">График работы</div>
              <div class="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  :variant="form.schedule_mode === 'common' ? 'default' : 'outline'"
                  class="justify-start"
                  @click="form.schedule_mode = 'common'"
                >
                  Общее время работы
                </Button>
                <Button
                  type="button"
                  :variant="form.schedule_mode === 'by_fulfillment' ? 'default' : 'outline'"
                  class="justify-start"
                  @click="form.schedule_mode = 'by_fulfillment'"
                >
                  Зависит от способа получения
                </Button>
              </div>
            </div>

            <div v-if="form.schedule_mode === 'common'" class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="text-xs text-muted-foreground">Один график для самовывоза и доставки</div>
                <Button type="button" variant="outline" size="sm" @click="addWorkingDay('common')">
                  <Plus :size="16" />
                  Добавить день
                </Button>
              </div>
              <div class="space-y-2">
                <div v-if="form.common_working_hours.length === 0" class="text-xs text-muted-foreground">График не задан</div>
                <div v-for="(schedule, index) in form.common_working_hours" :key="`common-${index}`" class="flex flex-wrap items-center gap-2">
                  <Select v-model="schedule.day" class="w-40">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="День" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="day in days" :key="day.value" :value="day.value" :disabled="isDayTaken('common', day.value, index)">
                        {{ day.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input v-model="schedule.open" type="time" class="w-32" />
                  <Input v-model="schedule.close" type="time" class="w-32" />
                  <Button type="button" variant="ghost" size="icon" @click="removeWorkingDay('common', index)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </div>
            </div>

            <div v-else class="grid gap-4 lg:grid-cols-2">
              <div class="space-y-3 rounded-lg border border-border bg-background p-3">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-medium text-foreground">Самовывоз</div>
                  <Button type="button" variant="outline" size="sm" @click="addWorkingDay('pickup')">
                    <Plus :size="16" />
                    Добавить день
                  </Button>
                </div>
                <div class="space-y-2">
                  <div v-if="form.pickup_working_hours.length === 0" class="text-xs text-muted-foreground">График не задан</div>
                  <div v-for="(schedule, index) in form.pickup_working_hours" :key="`pickup-${index}`" class="flex flex-wrap items-center gap-2">
                    <Select v-model="schedule.day" class="w-40">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="День" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="day in days" :key="day.value" :value="day.value" :disabled="isDayTaken('pickup', day.value, index)">
                          {{ day.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input v-model="schedule.open" type="time" class="w-28" />
                    <Input v-model="schedule.close" type="time" class="w-28" />
                    <Button type="button" variant="ghost" size="icon" @click="removeWorkingDay('pickup', index)">
                      <Trash2 :size="16" class="text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>

              <div class="space-y-3 rounded-lg border border-border bg-background p-3">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-medium text-foreground">Доставка</div>
                  <Button type="button" variant="outline" size="sm" @click="addWorkingDay('delivery')">
                    <Plus :size="16" />
                    Добавить день
                  </Button>
                </div>
                <div class="space-y-2">
                  <div v-if="form.delivery_working_hours.length === 0" class="text-xs text-muted-foreground">График не задан</div>
                  <div v-for="(schedule, index) in form.delivery_working_hours" :key="`delivery-${index}`" class="flex flex-wrap items-center gap-2">
                    <Select v-model="schedule.day" class="w-40">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="День" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="day in days" :key="day.value" :value="day.value" :disabled="isDayTaken('delivery', day.value, index)">
                          {{ day.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input v-model="schedule.open" type="time" class="w-28" />
                    <Input v-model="schedule.close" type="time" class="w-28" />
                    <Button type="button" variant="ghost" size="icon" @click="removeWorkingDay('delivery', index)">
                      <Trash2 :size="16" class="text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <Button type="submit" :disabled="saving">
              <Save :size="16" />
              {{ saving ? "Сохранение..." : "Сохранить" }}
            </Button>
          </div>
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
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";
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
  schedule_mode: "common",
  common_working_hours: [],
  pickup_working_hours: [],
  delivery_working_hours: [],
  prep_time: 0,
  assembly_time: 0,
  is_active: true,
  iiko_terminal_group_id: "",
  iiko_organization_id: "",
});

const branchMap = shallowRef(null);
const branchMarker = shallowRef(null);
const yandexMaps = shallowRef(null);

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

const getScheduleByType = (scheduleType) => {
  if (scheduleType === "pickup") return form.value.pickup_working_hours;
  if (scheduleType === "delivery") return form.value.delivery_working_hours;
  return form.value.common_working_hours;
};

const isDayTaken = (scheduleType, day, index) => getScheduleByType(scheduleType).some((schedule, idx) => idx !== index && schedule.day === day);

const getNextAvailableDay = (scheduleType) => {
  const used = new Set(getScheduleByType(scheduleType).map((schedule) => schedule.day));
  const next = days.find((day) => !used.has(day.value));
  return next?.value || "";
};

const addWorkingDay = (scheduleType) => {
  const target = getScheduleByType(scheduleType);
  const nextDay = getNextAvailableDay(scheduleType);
  if (!nextDay) {
    showWarningNotification("Все дни недели уже добавлены");
    return;
  }
  target.push({
    day: nextDay,
    open: "09:00",
    close: "21:00",
  });
  sortWorkingHours(scheduleType);
};

const removeWorkingDay = (scheduleType, index) => {
  const target = getScheduleByType(scheduleType);
  target.splice(index, 1);
};

const sortWorkingHours = (scheduleType) => {
  getScheduleByType(scheduleType).sort((a, b) => {
    const orderA = dayOrder[a.day] ?? Number.MAX_SAFE_INTEGER;
    const orderB = dayOrder[b.day] ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
};

const parseScheduleEntries = (scheduleObject = null) => {
  if (!scheduleObject || typeof scheduleObject !== "object") return [];
  const entries = [];
  for (const [day, hours] of Object.entries(scheduleObject)) {
    if (typeof hours !== "string" || !hours.includes("-")) continue;
    const [open, close] = hours.split("-");
    if (!open || !close) continue;
    entries.push({ day, open, close });
  }
  return entries;
};

const normalizeWorkingHoursData = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
};

const toScheduleMap = (scheduleEntries = []) => {
  const schedule = {};
  scheduleEntries.forEach((entry) => {
    if (entry.day && entry.open && entry.close) {
      schedule[entry.day] = `${entry.open}-${entry.close}`;
    }
  });
  return Object.keys(schedule).length > 0 ? schedule : null;
};

const syncBranchMarkerPosition = () => {
  const coords = branchMarker.value?.geometry?.getCoordinates?.();
  if (!Array.isArray(coords) || coords.length < 2) return;
  form.value.latitude = Number(coords[0]);
  form.value.longitude = Number(coords[1]);
};
const createAdminBranchMarkerSvg = () =>
  `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="73" viewBox="0 0 48 73">
  <line x1="24" y1="36" x2="24" y2="61" stroke="#111827" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24" cy="24" r="24" fill="#111827"/>
  <text x="24" y="31" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="18" font-weight="700">Я</text>
</svg>`.trim();
const createBranchMarkerOptions = () => {
  const svg = createAdminBranchMarkerSvg();
  const href = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    draggable: true,
    iconLayout: "default#image",
    iconImageHref: href,
    iconImageSize: [48, 73],
    iconImageOffset: [-24, -61],
  };
};

const initBranchMap = () => {
  if (branchMap.value) {
    branchMap.value.destroy();
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
  if (!container || !yandexMaps.value) return;
  branchMap.value = new yandexMaps.value.Map(
    container,
    {
      center,
      zoom: 16,
      controls: [],
    },
    {
      suppressMapOpenBlock: true,
    },
  );
  if (form.value.latitude && form.value.longitude) {
    branchMarker.value = new yandexMaps.value.Placemark([form.value.latitude, form.value.longitude], {}, createBranchMarkerOptions());
    branchMap.value.geoObjects.add(branchMarker.value);
    branchMarker.value.events.add("dragend", syncBranchMarkerPosition);
  }
  branchMap.value.events.add("click", (event) => {
    const coords = event.get("coords");
    const lat = Number(coords?.[0]);
    const lon = Number(coords?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    form.value.latitude = lat;
    form.value.longitude = lon;
    if (branchMarker.value) {
      branchMarker.value.geometry.setCoordinates([lat, lon]);
    } else {
      branchMarker.value = new yandexMaps.value.Placemark([lat, lon], {}, createBranchMarkerOptions());
      branchMap.value.geoObjects.add(branchMarker.value);
      branchMarker.value.events.add("dragend", syncBranchMarkerPosition);
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
        branchMap.value.setCenter([response.data.lat, response.data.lng], 15, { duration: 200 });
        if (branchMarker.value) {
          branchMarker.value.geometry.setCoordinates([response.data.lat, response.data.lng]);
        } else {
          branchMarker.value = new yandexMaps.value.Placemark([response.data.lat, response.data.lng], {}, createBranchMarkerOptions());
          branchMap.value.geoObjects.add(branchMarker.value);
          branchMarker.value.events.add("dragend", syncBranchMarkerPosition);
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
    const rawWorkingHours = normalizeWorkingHoursData(branch.working_hours);
    let scheduleMode = "common";
    let commonHours = [];
    let pickupHours = [];
    let deliveryHours = [];

    if (rawWorkingHours?.mode === "by_fulfillment") {
      scheduleMode = "by_fulfillment";
      pickupHours = parseScheduleEntries(rawWorkingHours.pickup);
      deliveryHours = parseScheduleEntries(rawWorkingHours.delivery);
      commonHours = parseScheduleEntries(rawWorkingHours.common);
    } else if (rawWorkingHours?.mode === "common") {
      scheduleMode = "common";
      commonHours = parseScheduleEntries(rawWorkingHours.common);
    } else {
      commonHours = parseScheduleEntries(rawWorkingHours);
    }

    form.value = {
      name: branch.name,
      address: branch.address || "",
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      phone: branch.phone ? formatPhoneInput(branch.phone) : "",
      schedule_mode: scheduleMode,
      common_working_hours: commonHours,
      pickup_working_hours: pickupHours,
      delivery_working_hours: deliveryHours,
      prep_time: Number(branch.prep_time || 0),
      assembly_time: Number(branch.assembly_time || 0),
      is_active: normalizeBoolean(branch.is_active, true),
      iiko_terminal_group_id: String(branch.iiko_terminal_group_id || ""),
      iiko_organization_id: String(branch.iiko_organization_id || ""),
    };
    sortWorkingHours("common");
    sortWorkingHours("pickup");
    sortWorkingHours("delivery");
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
    const iikoTerminalGroupId = String(form.value.iiko_terminal_group_id || "").trim();
    const iikoOrganizationId = String(form.value.iiko_organization_id || "").trim();
    const hasIikoTerminal = Boolean(iikoTerminalGroupId);
    const hasIikoOrganization = Boolean(iikoOrganizationId);
    if (hasIikoTerminal !== hasIikoOrganization) {
      showErrorNotification("Для привязки iiko заполните оба поля: Terminal/POS ID и Organization ID");
      return;
    }
    const commonSchedule = toScheduleMap(form.value.common_working_hours);
    const pickupSchedule = toScheduleMap(form.value.pickup_working_hours);
    const deliverySchedule = toScheduleMap(form.value.delivery_working_hours);
    let workingHoursPayload = null;

    if (form.value.schedule_mode === "by_fulfillment") {
      const hasPickup = Boolean(pickupSchedule);
      const hasDelivery = Boolean(deliverySchedule);
      const hasCommon = Boolean(commonSchedule);
      if (hasPickup || hasDelivery || hasCommon) {
        workingHoursPayload = {
          mode: "by_fulfillment",
          common: commonSchedule,
          pickup: pickupSchedule,
          delivery: deliverySchedule,
        };
      }
    } else if (commonSchedule) {
      workingHoursPayload = {
        mode: "common",
        common: commonSchedule,
      };
    }

    const payload = {
      name: form.value.name,
      address: form.value.address,
      latitude: form.value.latitude,
      longitude: form.value.longitude,
      phone: phoneDigits.length > 1 ? normalizePhone(form.value.phone) : "",
      working_hours: workingHoursPayload,
      prep_time: form.value.prep_time || 0,
      assembly_time: form.value.assembly_time || 0,
      is_active: form.value.is_active,
      iiko_terminal_group_id: iikoTerminalGroupId,
      iiko_organization_id: iikoOrganizationId,
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
  () => form.value.common_working_hours.map((schedule) => schedule.day || "").join("|"),
  () => {
    sortWorkingHours("common");
  },
);

watch(
  () => form.value.pickup_working_hours.map((schedule) => schedule.day || "").join("|"),
  () => {
    sortWorkingHours("pickup");
  },
);

watch(
  () => form.value.delivery_working_hours.map((schedule) => schedule.day || "").join("|"),
  () => {
    sortWorkingHours("delivery");
  },
);

onMounted(async () => {
  try {
    yandexMaps.value = await loadYandexMaps();
  } catch (error) {
    devError("Ошибка загрузки Яндекс Карт:", error);
    showErrorNotification("Не удалось загрузить Яндекс Карты");
  }
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
    branchMap.value.destroy();
    branchMap.value = null;
    branchMarker.value = null;
    yandexMaps.value = null;
  }
});
</script>
