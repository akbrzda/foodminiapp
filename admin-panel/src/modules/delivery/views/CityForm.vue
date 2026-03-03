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
        <form class="space-y-4" @submit.prevent="submitCity">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название города</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" placeholder="Москва" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Поиск на карте</FieldLabel>
              <FieldContent>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <Input v-model="searchQuery" class="flex-1" placeholder="Введите название города" />
                  <Button type="button" variant="secondary" :disabled="!searchQuery" @click="geocodeCity">
                    <Search :size="16" />
                    Найти
                  </Button>
                </div>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div class="rounded-xl border border-border bg-background p-2">
            <div id="city-map" class="h-64 w-full rounded-lg"></div>
            <p class="mt-2 text-xs text-muted-foreground">Кликните на карте для выбора центра города</p>
            <div v-if="form.latitude && form.longitude" class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin :size="14" />
              {{ Number(form.latitude).toFixed(6) }}, {{ Number(form.longitude).toFixed(6) }}
            </div>
          </div>

          <FieldGroup>
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
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Часовой пояс</FieldLabel>
              <FieldContent>
                <Select v-model="form.timezone">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите часовой пояс" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="zone in timezoneOptions" :key="zone.value" :value="zone.value">
                      {{ zone.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>

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
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { MapPin, Save, Search } from "lucide-vue-next";
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
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";

const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();

const cityId = computed(() => (route.params.id ? Number(route.params.id) : null));
const isEditing = computed(() => Number.isFinite(cityId.value));
const pageTitle = computed(() => (isEditing.value ? "Редактировать город" : "Новый город"));
const pageSubtitle = computed(() => (isEditing.value ? "Изменение данных города" : "Создание города доставки"));

const saving = ref(false);
const searchQuery = ref("");
const form = ref({
  name: "",
  latitude: null,
  longitude: null,
  timezone: "Europe/Moscow",
  is_active: true,
});
const timezoneOptions = [
  { value: "Europe/Kaliningrad", label: "Europe/Kaliningrad (UTC+2)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (UTC+3)" },
  { value: "Europe/Samara", label: "Europe/Samara (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Asia/Yekaterinburg (UTC+5)" },
  { value: "Asia/Omsk", label: "Asia/Omsk (UTC+6)" },
  { value: "Asia/Krasnoyarsk", label: "Asia/Krasnoyarsk (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Asia/Irkutsk (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Asia/Yakutsk (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Asia/Vladivostok (UTC+10)" },
  { value: "Asia/Magadan", label: "Asia/Magadan (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Asia/Kamchatka (UTC+12)" },
];

let cityMap = null;
let cityMarker = null;
let yandexMaps = null;

const syncMarkerPosition = () => {
  if (!cityMarker) return;
  const coords = cityMarker.geometry?.getCoordinates?.();
  if (!Array.isArray(coords) || coords.length < 2) return;
  form.value.latitude = Number(coords[0]);
  form.value.longitude = Number(coords[1]);
};

const goBack = () => {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  router.push({ name: "cities" });
};

const initCityMap = () => {
  if (cityMap) {
    cityMap.destroy();
  }
  const center = form.value.latitude && form.value.longitude ? [form.value.latitude, form.value.longitude] : [55.751244, 37.618423];
  const container = document.getElementById("city-map");
  if (!container || !yandexMaps) return;
  cityMap = new yandexMaps.Map(
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
  if (form.value.latitude && form.value.longitude) {
    cityMarker = new yandexMaps.Placemark([form.value.latitude, form.value.longitude], {}, {
      draggable: true,
      preset: "islands#redIcon",
    });
    cityMap.geoObjects.add(cityMarker);
    cityMarker.events.add("dragend", syncMarkerPosition);
  }
  cityMap.events.add("click", (event) => {
    const coords = event.get("coords");
    const lat = Number(coords?.[0]);
    const lon = Number(coords?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    form.value.latitude = lat;
    form.value.longitude = lon;
    if (cityMarker) {
      cityMarker.geometry.setCoordinates([lat, lon]);
    } else {
      cityMarker = new yandexMaps.Placemark([lat, lon], {}, {
        draggable: true,
        preset: "islands#redIcon",
      });
      cityMap.geoObjects.add(cityMarker);
      cityMarker.events.add("dragend", syncMarkerPosition);
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
        cityMap.setCenter([response.data.lat, response.data.lng], 11, { duration: 200 });
        if (cityMarker) {
          cityMarker.geometry.setCoordinates([response.data.lat, response.data.lng]);
        } else {
          cityMarker = new yandexMaps.Placemark([response.data.lat, response.data.lng], {}, {
            draggable: true,
            preset: "islands#redIcon",
          });
          cityMap.geoObjects.add(cityMarker);
          cityMarker.events.add("dragend", syncMarkerPosition);
        }
      }
    }
  } catch (error) {
    devError("Ошибка геокодирования:", error);
    showErrorNotification("Не удалось найти город на карте");
  }
};

const loadCity = async () => {
  if (!isEditing.value) {
    await nextTick();
    initCityMap();
    return;
  }
  try {
    const response = await api.get("/api/cities/admin/all");
    const city = (response.data.cities || []).find((item) => item.id === cityId.value);
    if (!city) {
      showErrorNotification("Город не найден");
      goBack();
      return;
    }
    form.value = {
      name: city.name,
      latitude: city.latitude ? Number(city.latitude) : null,
      longitude: city.longitude ? Number(city.longitude) : null,
      timezone: city.timezone || "Europe/Moscow",
      is_active: Boolean(city.is_active),
    };
    await nextTick();
    initCityMap();
  } catch (error) {
    devError("Ошибка загрузки города:", error);
    showErrorNotification("Ошибка загрузки города");
    goBack();
  }
};

const submitCity = async () => {
  saving.value = true;
  try {
    if (isEditing.value) {
      await api.put(`/api/cities/admin/${cityId.value}`, form.value);
    } else {
      await api.post("/api/cities/admin", form.value);
    }
    showSuccessNotification(isEditing.value ? "Город обновлен" : "Город создан");
    goBack();
  } catch (error) {
    devError("Ошибка сохранения города:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка сохранения города");
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadYandexMaps()
    .then((ymaps) => {
      yandexMaps = ymaps;
      loadCity();
    })
    .catch((error) => {
      devError("Ошибка загрузки Яндекс Карт:", error);
      showErrorNotification("Не удалось загрузить Яндекс Карты");
      loadCity();
    });
});

onUnmounted(() => {
  if (cityMap) {
    cityMap.destroy();
    cityMap = null;
    cityMarker = null;
    yandexMaps = null;
  }
});
</script>
