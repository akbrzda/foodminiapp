<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader :title="pageTitle" :description="pageSubtitle">
          <template #actions>
            <BackButton @click="goBack" />
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card v-if="isLoading">
      <CardContent class="space-y-3 pt-6">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-28 w-full" />
      </CardContent>
    </Card>

    <template v-else>
      <Card>
        <CardHeader>
          <CardTitle>Основные настройки</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <Field>
            <FieldLabel>Название</FieldLabel>
            <FieldContent>
              <Input v-model="form.name" placeholder="Весенние акции" />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Заголовок</FieldLabel>
            <FieldContent>
              <Input v-model="form.title" placeholder="Stories блок на главной" />
            </FieldContent>
          </Field>

          <div class="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>Placement</FieldLabel>
              <FieldContent>
                <Select v-model="form.placement">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите placement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">home</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Статус</FieldLabel>
              <FieldContent>
                <Select v-model="form.status">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="active">Активна</SelectItem>
                    <SelectItem value="paused">Пауза</SelectItem>
                    <SelectItem value="archived">Архив</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Приоритет</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.priority" type="number" min="0" />
              </FieldContent>
            </Field>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Дата начала</FieldLabel>
              <FieldContent>
                <div class="space-y-2">
                  <Popover v-model:open="isStartDateOpen">
                    <PopoverTrigger asChild>
                      <Button variant="outline" class="w-full justify-start text-left font-normal" :class="!startDate && 'text-muted-foreground'">
                        <CalendarIcon :size="16" />
                        {{ startDateLabel }}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-auto p-0" align="start">
                      <CalendarView :model-value="startCalendar" locale="ru-RU" initial-focus @update:modelValue="handleStartDateUpdate" />
                    </PopoverContent>
                  </Popover>
                  <div class="grid grid-cols-2 gap-2">
                    <Select v-model="startHour">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Часы" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="hour in hours" :key="`start-hour-${hour}`" :value="hour">{{ hour }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select v-model="startMinute">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Минуты" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="minute in minutes" :key="`start-minute-${minute}`" :value="minute">{{ minute }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Дата окончания</FieldLabel>
              <FieldContent>
                <div class="space-y-2">
                  <Popover v-model:open="isEndDateOpen">
                    <PopoverTrigger asChild>
                      <Button variant="outline" class="w-full justify-start text-left font-normal" :class="!endDate && 'text-muted-foreground'">
                        <CalendarIcon :size="16" />
                        {{ endDateLabel }}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-auto p-0" align="start">
                      <CalendarView :model-value="endCalendar" locale="ru-RU" initial-focus @update:modelValue="handleEndDateUpdate" />
                    </PopoverContent>
                  </Popover>
                  <div class="grid grid-cols-2 gap-2">
                    <Select v-model="endHour">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Часы" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="hour in hours" :key="`end-hour-${hour}`" :value="hour">{{ hour }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select v-model="endMinute">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Минуты" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="minute in minutes" :key="`end-minute-${minute}`" :value="minute">{{ minute }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FieldContent>
            </Field>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Город</FieldLabel>
              <FieldContent>
                <Select v-model="cityModel">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все города" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все города</SelectItem>
                    <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="String(city.id)">
                      {{ city.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Филиал</FieldLabel>
              <FieldContent>
                <Select v-model="branchModel" :disabled="!availableBranches.length">
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="availableBranches.length ? 'Все филиалы' : 'Сначала выберите город'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все филиалы</SelectItem>
                    <SelectItem v-for="branch in availableBranches" :key="branch.id" :value="String(branch.id)">
                      {{ branch.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>

          <Field>
            <FieldLabel>Обложка</FieldLabel>
            <FieldContent>
              <div
                class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground"
                @dragover.prevent
                @drop.prevent="onCoverDrop"
              >
                <input ref="coverFileInput" type="file" accept="image/*" class="hidden" @change="onCoverFileChange" />
                <Button type="button" variant="outline" size="sm" @click="triggerCoverFile">
                  <UploadCloud :size="16" />
                  Загрузить обложку
                </Button>
                <span>или перетащите файл сюда</span>
                <span v-if="coverUploadState.error" class="text-xs text-red-600">{{ coverUploadState.error }}</span>
                <span v-if="coverUploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
              </div>
              <div v-if="coverPreviewUrl" class="mt-3 flex items-center gap-3">
                <img :src="coverPreviewUrl" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
                <Button type="button" variant="ghost" size="icon" @click="clearCover">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </FieldContent>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Слайды</CardTitle>
        </CardHeader>
        <CardContent>
          <StorySlidesEditor
            v-model="form.slides"
            :story-upload-entity-id="storyUploadEntityId"
            :categories="menuReferences.categories"
            :products="menuReferences.products"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent class="flex items-center justify-end gap-2 pt-6">
          <Button variant="outline" @click="goBack">Отмена</Button>
          <Button :disabled="isSubmitting" @click="submitForm">
            <Save :size="16" />
            {{ submitLabel }}
          </Button>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Save, UploadCloud, Trash2, Calendar as CalendarIcon } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate as parseCalendarDate } from "@internationalized/date";
import { useRoute, useRouter } from "vue-router";
import { storiesAPI } from "@/shared/api/client.js";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { normalizeImageUrl } from "@/shared/utils/format.js";
import { devError } from "@/shared/utils/logger";
import BackButton from "@/shared/components/BackButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Calendar as CalendarView } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import StorySlidesEditor from "@/modules/stories/components/StorySlidesEditor.vue";

const router = useRouter();
const route = useRoute();
const referenceStore = useReferenceStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();

const storyId = computed(() => Number(route.params.id || 0));
const isEditing = computed(() => Number.isInteger(storyId.value) && storyId.value > 0);

const isLoading = ref(false);
const isSubmitting = ref(false);
const menuReferences = ref({ categories: [], products: [] });

const timeZone = getLocalTimeZone();
const dateFormatter = new DateFormatter("ru-RU", { dateStyle: "medium" });

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const tempUploadId = ref(`temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const storyUploadEntityId = computed(() => (isEditing.value ? storyId.value : tempUploadId.value));

const coverFileInput = ref(null);
const coverUploadState = ref({ loading: false, error: null, preview: null });

const form = ref({
  name: "",
  title: "",
  placement: "home",
  status: "active",
  priority: 0,
  city_id: null,
  branch_id: null,
  cover_image_url: "",
  slides: [],
});

const startDate = ref("");
const startHour = ref("00");
const startMinute = ref("00");
const endDate = ref("");
const endHour = ref("23");
const endMinute = ref("59");
const isStartDateOpen = ref(false);
const isEndDateOpen = ref(false);

const pageTitle = computed(() => (isEditing.value ? "Редактирование Stories" : "Новая Stories-кампания"));
const pageSubtitle = computed(() => (isEditing.value ? "Изменение stories-кампании" : "Создание stories-кампании"));
const submitLabel = computed(() => (isSubmitting.value ? "Сохранение..." : isEditing.value ? "Сохранить" : "Создать"));

const startCalendar = computed(() => (startDate.value ? parseCalendarDate(startDate.value) : undefined));
const endCalendar = computed(() => (endDate.value ? parseCalendarDate(endDate.value) : undefined));

const startDateLabel = computed(() => {
  if (!startDate.value) return "Не ограничено";
  return dateFormatter.format(parseCalendarDate(startDate.value).toDate(timeZone));
});

const endDateLabel = computed(() => {
  if (!endDate.value) return "Не ограничено";
  return dateFormatter.format(parseCalendarDate(endDate.value).toDate(timeZone));
});

const coverPreviewUrl = computed(() => normalizeImageUrl(coverUploadState.value.preview || form.value.cover_image_url || ""));

const cityModel = computed({
  get: () => (form.value.city_id ? String(form.value.city_id) : "all"),
  set: (value) => {
    form.value.city_id = value === "all" ? null : Number(value);
    if (!form.value.city_id) {
      form.value.branch_id = null;
    }
  },
});

const availableBranches = computed(() => {
  if (!form.value.city_id) return [];
  return referenceStore.branchesByCity[form.value.city_id] || [];
});

const branchModel = computed({
  get: () => (form.value.branch_id ? String(form.value.branch_id) : "all"),
  set: (value) => {
    form.value.branch_id = value === "all" ? null : Number(value);
  },
});

const normalizeDateTimeForInput = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const dateTime = localDate.toISOString().slice(0, 16);
  const [datePart, timePart] = dateTime.split("T");
  const [hourPart, minutePart] = (timePart || "00:00").split(":");

  return {
    date: datePart || "",
    hour: hourPart || "00",
    minute: minutePart || "00",
  };
};

const toIsoOrNull = (dateValue, hourValue, minuteValue) => {
  if (!dateValue) return null;
  const value = `${dateValue}T${hourValue || "00"}:${minuteValue || "00"}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const mapSlidesForForm = (slides = []) => {
  return slides.map((slide, index) => ({
    id: slide.id || `slide-${index}`,
    title: slide.title || "",
    subtitle: slide.subtitle || "",
    media_url: slide.media_url || "",
    cta_text: slide.cta_text || "",
    cta_type: slide.cta_type || "none",
    cta_value: slide.cta_value || "",
    duration_seconds: Number(slide.duration_seconds || 6),
    sort_order: Number(slide.sort_order ?? index),
    is_active: slide.is_active !== false,
  }));
};

const handleStartDateUpdate = (value) => {
  startDate.value = value ? value.toString() : "";
  if (startDate.value) isStartDateOpen.value = false;
};

const handleEndDateUpdate = (value) => {
  endDate.value = value ? value.toString() : "";
  if (endDate.value) isEndDateOpen.value = false;
};

const loadMenuReferences = async () => {
  try {
    const response = await storiesAPI.referencesMenu();
    menuReferences.value = {
      categories: Array.isArray(response.data?.data?.categories) ? response.data.data.categories : [],
      products: Array.isArray(response.data?.data?.products) ? response.data.data.products : [],
    };
  } catch (error) {
    devError("Ошибка загрузки справочника stories:", error);
    menuReferences.value = { categories: [], products: [] };
  }
};

const loadStory = async () => {
  if (!isEditing.value) return;

  isLoading.value = true;
  try {
    const response = await storiesAPI.getById(storyId.value);
    const data = response.data?.data;
    if (!data) {
      showErrorNotification("Stories-кампания не найдена");
      router.push({ name: "stories" });
      return;
    }

    form.value = {
      name: data.name || "",
      title: data.title || "",
      placement: data.placement || "home",
      status: data.status || "active",
      priority: Number(data.priority || 0),
      city_id: data.city_id ? Number(data.city_id) : null,
      branch_id: data.branch_id ? Number(data.branch_id) : null,
      cover_image_url: data.cover_image_url || "",
      slides: mapSlidesForForm(data.slides || []),
    };

    const startParts = normalizeDateTimeForInput(data.start_at);
    const endParts = normalizeDateTimeForInput(data.end_at);

    startDate.value = startParts?.date || "";
    startHour.value = startParts?.hour || "00";
    startMinute.value = startParts?.minute || "00";

    endDate.value = endParts?.date || "";
    endHour.value = endParts?.hour || "23";
    endMinute.value = endParts?.minute || "59";

    coverUploadState.value = { loading: false, error: null, preview: data.cover_image_url || null };
  } catch (error) {
    devError("Ошибка загрузки stories-кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить stories-кампанию");
    router.push({ name: "stories" });
  } finally {
    isLoading.value = false;
  }
};

const triggerCoverFile = () => {
  coverFileInput.value?.click();
};

const uploadCoverFile = async (file) => {
  if (!file) {
    coverUploadState.value = { loading: false, error: "Нужен файл изображения", preview: null };
    return;
  }

  if (!file.type.startsWith("image/")) {
    coverUploadState.value = { loading: false, error: "Только изображения", preview: null };
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    coverUploadState.value = { loading: false, error: "Файл больше 10MB", preview: null };
    return;
  }

  coverUploadState.value = { loading: true, error: null, preview: URL.createObjectURL(file) };

  const formData = new FormData();
  formData.append("image", file);

  try {
    const entityId = String(storyUploadEntityId.value || "new").trim() || "new";
    const response = await api.post(`/api/uploads/stories/${entityId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = String(response.data?.data?.url || "").trim();
    form.value.cover_image_url = uploadedUrl;
    coverUploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Ошибка загрузки обложки stories:", error);
    coverUploadState.value = { loading: false, error: "Не удалось загрузить изображение", preview: null };
  }
};

const onCoverFileChange = async (event) => {
  const file = event?.target?.files?.[0] || null;
  await uploadCoverFile(file);
  if (event?.target) event.target.value = "";
};

const onCoverDrop = async (event) => {
  const file = event?.dataTransfer?.files?.[0] || null;
  await uploadCoverFile(file);
};

const clearCover = () => {
  form.value.cover_image_url = "";
  coverUploadState.value = { loading: false, error: null, preview: null };
};

const validateForm = () => {
  if (!form.value.name.trim()) {
    showErrorNotification("Укажите название кампании");
    return false;
  }

  if (!form.value.title.trim()) {
    showErrorNotification("Укажите заголовок кампании");
    return false;
  }

  if (!Array.isArray(form.value.slides) || form.value.slides.length === 0) {
    showErrorNotification("Добавьте минимум один слайд");
    return false;
  }

  const invalidSlide = form.value.slides.find((slide) => !String(slide.title || "").trim() || !String(slide.media_url || "").trim());
  if (invalidSlide) {
    showErrorNotification("У каждого слайда обязательны заголовок и медиа");
    return false;
  }

  const startIso = toIsoOrNull(startDate.value, startHour.value, startMinute.value);
  const endIso = toIsoOrNull(endDate.value, endHour.value, endMinute.value);

  if (startIso && endIso && new Date(startIso).getTime() > new Date(endIso).getTime()) {
    showErrorNotification("Дата начала не может быть позже даты окончания");
    return false;
  }

  return true;
};

const buildPayload = () => ({
  name: form.value.name.trim(),
  title: form.value.title.trim(),
  placement: form.value.placement,
  status: form.value.status,
  priority: Number(form.value.priority || 0),
  cover_image_url: form.value.cover_image_url.trim() || null,
  start_at: toIsoOrNull(startDate.value, startHour.value, startMinute.value),
  end_at: toIsoOrNull(endDate.value, endHour.value, endMinute.value),
  city_id: form.value.city_id,
  branch_id: form.value.branch_id,
  slides: form.value.slides.map((slide, index) => ({
    title: String(slide.title || "").trim(),
    subtitle: String(slide.subtitle || "").trim() || null,
    media_url: String(slide.media_url || "").trim(),
    cta_text: String(slide.cta_text || "").trim() || null,
    cta_type: String(slide.cta_type || "none").trim(),
    cta_value: String(slide.cta_value || "").trim() || null,
    duration_seconds: Math.max(3, Math.min(15, Number(slide.duration_seconds || 6))),
    sort_order: index,
    is_active: slide.is_active !== false,
  })),
});

const submitForm = async () => {
  if (!validateForm()) return;

  isSubmitting.value = true;
  try {
    const payload = buildPayload();
    if (isEditing.value) {
      await storiesAPI.update(storyId.value, payload);
      showSuccessNotification("Stories-кампания обновлена");
    } else {
      await storiesAPI.create(payload);
      showSuccessNotification("Stories-кампания создана");
    }
    router.push({ name: "stories" });
  } catch (error) {
    devError("Ошибка сохранения stories-кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось сохранить stories-кампанию");
  } finally {
    isSubmitting.value = false;
  }
};

const goBack = () => {
  router.push({ name: "stories" });
};

watch(
  () => form.value.city_id,
  async (cityId) => {
    if (!cityId) {
      form.value.branch_id = null;
      return;
    }
    await referenceStore.loadBranches(cityId);
    if (form.value.branch_id) {
      const exists = (referenceStore.branchesByCity[cityId] || []).some((item) => Number(item.id) === Number(form.value.branch_id));
      if (!exists) {
        form.value.branch_id = null;
      }
    }
  }
);

onMounted(async () => {
  await Promise.all([referenceStore.loadCities(), loadMenuReferences()]);

  if (isEditing.value) {
    await loadStory();
    if (form.value.city_id) {
      await referenceStore.loadBranches(form.value.city_id);
    }
  }
});
</script>
