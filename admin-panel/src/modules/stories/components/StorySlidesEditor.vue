<template>
  <div class="space-y-3">
    <div
      v-for="(slide, index) in localSlides"
      :key="slide.id"
      class="rounded-xl border border-border p-3"
    >
      <div class="mb-3 flex items-center justify-between">
        <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Слайд #{{ index + 1 }}</div>
        <Button type="button" variant="ghost" size="icon" @click="removeSlide(index)">
          <Trash2 :size="16" class="text-red-600" />
        </Button>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel class="text-xs">Заголовок</FieldLabel>
          <FieldContent>
            <Input v-model="slide.title" placeholder="Скидка 20%" />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-xs">Подзаголовок</FieldLabel>
          <FieldContent>
            <Input v-model="slide.subtitle" placeholder="Только до конца недели" />
          </FieldContent>
        </Field>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel class="text-xs">Медиа слайда</FieldLabel>
          <FieldContent>
            <div
              class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-center text-xs text-muted-foreground"
              @dragover.prevent
              @drop.prevent="onDrop($event, slide)"
            >
              <input
                :ref="(el) => setFileInputRef(slide.id, el)"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onFileChange($event, slide)"
              />
              <Button type="button" variant="outline" size="sm" @click="triggerFile(slide.id)">
                <UploadCloud :size="16" />
                Загрузить изображение
              </Button>
              <span>или перетащите файл сюда</span>
              <span v-if="getUploadState(slide.id).error" class="text-xs text-red-600">{{ getUploadState(slide.id).error }}</span>
              <span v-if="getUploadState(slide.id).loading" class="text-xs text-muted-foreground">Загрузка...</span>
            </div>
            <div v-if="getSlidePreview(slide)" class="mt-3 flex items-center gap-3">
              <img :src="getSlidePreview(slide)" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
              <Button type="button" variant="ghost" size="icon" @click="clearSlideMedia(slide)">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-xs">Длительность (сек)</FieldLabel>
          <FieldContent>
            <Input v-model.number="slide.duration_seconds" type="number" min="3" max="15" />
          </FieldContent>
        </Field>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <Field>
          <FieldLabel class="text-xs">CTA текст</FieldLabel>
          <FieldContent>
            <Input v-model="slide.cta_text" placeholder="Открыть" />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-xs">CTA тип</FieldLabel>
          <FieldContent>
            <Select v-model="slide.cta_type" @update:model-value="onCtaTypeChanged(slide)">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Нет</SelectItem>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="product">Блюдо</SelectItem>
                <SelectItem value="category">Категория</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-xs">CTA значение</FieldLabel>
          <FieldContent>
            <template v-if="slide.cta_type === 'category' || slide.cta_type === 'product'">
              <div class="relative">
                <Input
                  v-model="ctaSearchQuery[slide.id]"
                  :placeholder="slide.cta_type === 'category' ? 'Выберите категорию' : 'Выберите блюдо'"
                  @focus="openCtaDropdown(slide.id)"
                  @input="openCtaDropdown(slide.id)"
                  @blur="closeCtaDropdownDelayed(slide.id)"
                />
                <div
                  v-if="ctaDropdownOpen[slide.id]"
                  class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card shadow-sm"
                >
                  <button
                    v-for="option in getCtaOptions(slide)"
                    :key="`${slide.id}-${option.id}`"
                    type="button"
                    class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted"
                    @mousedown.prevent="selectCtaOption(slide, option)"
                  >
                    {{ option.name }}
                  </button>
                  <div v-if="getCtaOptions(slide).length === 0" class="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</div>
                </div>
              </div>
            </template>
            <template v-else>
              <Input v-model="slide.cta_value" placeholder="/menu или https://..." />
            </template>
          </FieldContent>
        </Field>
      </div>
    </div>

    <Button type="button" variant="outline" @click="addSlide">
      <Plus :size="16" />
      Добавить слайд
    </Button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { Plus, Trash2, UploadCloud } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { devError } from "@/shared/utils/logger";
import { normalizeImageUrl } from "@/shared/utils/format.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
  storyUploadEntityId: {
    type: [String, Number],
    default: "new",
  },
  categories: {
    type: Array,
    default: () => [],
  },
  products: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:modelValue"]);

const localSlides = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const fileInputs = ref({});
const uploadState = ref({});
const ctaSearchQuery = ref({});
const ctaDropdownOpen = ref({});

const setFileInputRef = (slideId, element) => {
  fileInputs.value[slideId] = element;
};

const getUploadState = (slideId) => {
  if (!uploadState.value[slideId]) {
    uploadState.value[slideId] = { loading: false, error: null, preview: null };
  }
  return uploadState.value[slideId];
};

const triggerFile = (slideId) => {
  fileInputs.value[slideId]?.click();
};

const getSlidePreview = (slide) => {
  const state = getUploadState(slide.id);
  return normalizeImageUrl(state.preview || slide.media_url || "");
};

const clearSlideMedia = (slide) => {
  slide.media_url = "";
  uploadState.value[slide.id] = { loading: false, error: null, preview: null };
};

const uploadSlideFile = async (file, slide) => {
  if (!file) {
    uploadState.value[slide.id] = { loading: false, error: "Нужен файл изображения", preview: null };
    return;
  }

  if (!file.type.startsWith("image/")) {
    uploadState.value[slide.id] = { loading: false, error: "Только изображения", preview: null };
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    uploadState.value[slide.id] = { loading: false, error: "Файл больше 10MB", preview: null };
    return;
  }

  uploadState.value[slide.id] = { loading: true, error: null, preview: URL.createObjectURL(file) };

  const formData = new FormData();
  formData.append("image", file);

  try {
    const entityId = String(props.storyUploadEntityId || "new").trim() || "new";
    const response = await api.post(`/api/uploads/stories/${entityId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = String(response.data?.data?.url || "").trim();
    slide.media_url = uploadedUrl;
    uploadState.value[slide.id] = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Ошибка загрузки слайда stories:", error);
    uploadState.value[slide.id] = { loading: false, error: "Не удалось загрузить изображение", preview: null };
  }
};

const onFileChange = async (event, slide) => {
  const file = event?.target?.files?.[0] || null;
  await uploadSlideFile(file, slide);
  if (event?.target) {
    event.target.value = "";
  }
};

const onDrop = async (event, slide) => {
  const file = event?.dataTransfer?.files?.[0] || null;
  await uploadSlideFile(file, slide);
};

const getCtaOptions = (slide) => {
  const list = slide.cta_type === "category" ? props.categories : props.products;
  const query = String(ctaSearchQuery.value[slide.id] || "")
    .trim()
    .toLowerCase();

  if (!query) return list.slice(0, 50);

  return list
    .filter((option) => String(option.name || "").toLowerCase().includes(query))
    .slice(0, 50);
};

const openCtaDropdown = (slideId) => {
  ctaDropdownOpen.value[slideId] = true;
};

const closeCtaDropdownDelayed = (slideId) => {
  setTimeout(() => {
    ctaDropdownOpen.value[slideId] = false;
  }, 120);
};

const selectCtaOption = (slide, option) => {
  slide.cta_value = String(option.id);
  ctaSearchQuery.value[slide.id] = option.name;
  ctaDropdownOpen.value[slide.id] = false;
};

const onCtaTypeChanged = (slide) => {
  if (slide.cta_type === "category" || slide.cta_type === "product") {
    const selectedId = Number(slide.cta_value || 0);
    const list = slide.cta_type === "category" ? props.categories : props.products;
    const selected = list.find((item) => Number(item.id) === selectedId);
    ctaSearchQuery.value[slide.id] = selected?.name || "";
    return;
  }
  ctaSearchQuery.value[slide.id] = "";
};

watch(
  () => props.modelValue,
  (slides) => {
    if (!Array.isArray(slides)) return;
    for (const slide of slides) {
      if (!slide?.id) continue;
      if (slide.cta_type !== "category" && slide.cta_type !== "product") continue;
      if (ctaSearchQuery.value[slide.id]) continue;
      const list = slide.cta_type === "category" ? props.categories : props.products;
      const selected = list.find((item) => Number(item.id) === Number(slide.cta_value || 0));
      if (selected?.name) {
        ctaSearchQuery.value[slide.id] = selected.name;
      }
    }
  },
  { immediate: true, deep: true }
);

const createSlide = () => ({
  id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  subtitle: "",
  media_url: "",
  cta_text: "",
  cta_type: "none",
  cta_value: "",
  duration_seconds: 6,
  sort_order: localSlides.value.length,
  is_active: true,
});

const addSlide = () => {
  localSlides.value = [...localSlides.value, createSlide()];
};

const removeSlide = (index) => {
  localSlides.value = localSlides.value.filter((_, idx) => idx !== index).map((item, idx) => ({
    ...item,
    sort_order: idx,
  }));
};
</script>
