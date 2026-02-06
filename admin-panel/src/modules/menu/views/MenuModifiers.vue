import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Группы модификаторов" description="Одиночный и множественный выбор">
          <template #actions>
            <Button @click="openModal()">
              <Plus :size="16" />
              Добавить группу
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <div class="space-y-4">
      <Card v-for="group in groups" :key="group.id">
        <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>{{ group.name }}</CardTitle>
            <CardDescription>
              {{ group.type === "single" ? "Одиночный" : "Множественный" }} ·
              {{ group.is_required ? "Обязательный" : "Опциональный" }}
              {{ group.is_global ? " · Глобальная" : "" }}
              <span v-if="group.min_selections || group.max_selections">
                · Выбор: {{ group.min_selections || 0 }}-{{ group.max_selections || "∞" }}
              </span>
            </CardDescription>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="icon" @click="openModal(group)">
              <Pencil :size="16" />
            </Button>
            <Button variant="ghost" size="icon" @click="deleteGroup(group)">
              <Trash2 :size="16" class="text-red-600" />
            </Button>
          </div>
        </CardHeader>
        <CardContent class="space-y-2">
          <div
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-4 py-2 text-sm"
          >
            <div class="flex items-center gap-3">
              <img
                v-if="modifier.image_url"
                :src="normalizeImageUrl(modifier.image_url)"
                :alt="modifier.name"
                class="h-10 w-10 rounded-lg object-cover"
              />
              <div>
                <div class="font-medium text-foreground">{{ modifier.name }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ formatCurrency(modifier.price) }}
                  <span v-if="modifier.weight"> · {{ modifier.weight }}{{ modifier.weight_unit || "г" }}</span>
                </div>
              </div>
            </div>
            <div class="flex gap-2">
              <Button variant="ghost" size="icon" @click="editModifier(group, modifier)">
                <Pencil :size="16" />
              </Button>
              <Button variant="ghost" size="icon" @click="openCityPricesModal(modifier)">
                <Settings2 :size="16" />
              </Button>
              <Button variant="ghost" size="icon" @click="deleteModifier(modifier)">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
          </div>
          <Button variant="outline" size="sm" @click="openModifierModal(group)">
            <Plus :size="16" />
            Добавить модификатор
          </Button>
        </CardContent>
      </Card>
    </div>
    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitGroup">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип</FieldLabel>
              <FieldContent>
                <Select v-model="form.type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Одиночный выбор</SelectItem>
                    <SelectItem value="multiple">Множественный выбор</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Минимум выборов</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.min_selections" type="number" min="0" placeholder="0" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Максимум выборов</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.max_selections" type="number" min="1" placeholder="1" />
                </FieldContent>
              </Field>
            </FieldGroup>
            <Field>
              <FieldContent>
                <Label class="flex items-center gap-2 text-sm text-foreground">
                  <input v-model="form.is_required" type="checkbox" class="h-4 w-4 rounded border-border" />
                  Обязательная группа
                </Label>
                <Label class="flex items-center gap-2 text-sm text-foreground">
                  <input v-model="form.is_global" type="checkbox" class="h-4 w-4 rounded border-border" />
                  Глобальная группа (переиспользуемая)
                </Label>
              </FieldContent>
            </Field>
          </FieldGroup>
          <Button class="w-full" type="submit">
            <Save :size="16" />
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog v-if="showModifierModal" :open="showModifierModal" @update:open="(value) => (value ? null : closeModifierModal())">
      <DialogContent class="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Модификатор</DialogTitle>
          <DialogDescription>Добавьте параметр</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitModifier">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="modifierForm.name" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Цена</FieldLabel>
              <FieldContent>
                <Input v-model.number="modifierForm.price" type="number" step="0.01" />
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Вес</FieldLabel>
                <FieldContent>
                  <Input v-model.number="modifierForm.weight" type="number" step="0.01" placeholder="Опционально" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Единица</FieldLabel>
                <FieldContent>
                  <Select v-model="modifierForm.weight_unit">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Не указано" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Не указано</SelectItem>
                      <SelectItem value="g">г (граммы)</SelectItem>
                      <SelectItem value="kg">кг (килограммы)</SelectItem>
                      <SelectItem value="ml">мл (миллилитры)</SelectItem>
                      <SelectItem value="l">л (литры)</SelectItem>
                      <SelectItem value="pcs">шт (штуки)</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение</FieldLabel>
              <FieldContent>
                <div
                  class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground"
                  @dragover.prevent
                  @drop.prevent="onDrop"
                >
                  <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
                  <Button type="button" variant="outline" size="sm" @click="triggerFile">
                    <UploadCloud :size="16" />
                    Загрузить (до 500KB)
                  </Button>
                  <span>или перетащите файл сюда</span>
                  <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
                  <span v-if="uploadState.loading" class="flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner class="h-4 w-4" />
                    Загрузка...
                  </span>
                </div>
                <div v-if="uploadState.preview || modifierForm.image_url" class="mt-3 flex items-center gap-3">
                  <img
                    :src="normalizeImageUrl(uploadState.preview || modifierForm.image_url)"
                    class="h-16 w-16 rounded-xl object-cover"
                    alt="preview"
                  />
                </div>
              </FieldContent>
            </Field>
          </FieldGroup>
          <Button class="w-full" type="submit">
            <Save :size="16" />
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog v-if="showCityPricesModal" :open="showCityPricesModal" @update:open="(value) => (value ? null : closeCityPricesModal())">
      <DialogContent class="w-full max-w-4xl">
        <DialogHeader>
          <DialogTitle>Цены по городам</DialogTitle>
          <DialogDescription>Настройка цен и доступности модификатора</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitCityPrices">
          <div class="space-y-2">
            <div class="text-sm text-muted-foreground">Доступность по городам</div>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="modifierCityIds"
                  type="checkbox"
                  :value="Number(city.id)"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {{ city.name }}
              </Label>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="text-sm text-muted-foreground">Город</div>
            <Select v-model="selectedCityId" :disabled="modifierCityIds.length === 0">
              <SelectTrigger class="w-64">
                <SelectValue placeholder="Выберите город" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="city in activeCities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
              </SelectContent>
            </Select>
            <div v-if="modifierCityIds.length === 0" class="text-xs text-muted-foreground">Сначала включите хотя бы один город.</div>
          </div>
          <div v-if="selectedCityId" class="space-y-2">
            <div class="text-xs text-muted-foreground">Базовая цена: {{ formatCurrency(activeModifierForPrices?.price || 0) }}</div>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-1">
                <Label class="text-xs text-muted-foreground">Цена</Label>
                <Input v-model.number="getOrCreateModifierCityPrice(selectedCityId).price" type="number" step="0.01" placeholder="0.00" />
              </div>
            </div>
          </div>
          <Button class="w-full" type="submit" :disabled="saving">
            <Save :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить цены" }}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Pencil, Plus, Save, Settings2, Trash2, UploadCloud } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatCurrency, normalizeBoolean } from "@/shared/utils/format.js";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import Spinner from "@/shared/components/ui/spinner/Spinner.vue";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
const groups = ref([]);
const { showErrorNotification, showSuccessNotification } = useNotifications();
const ordersStore = useOrdersStore();
const referenceStore = useReferenceStore();
const showModal = ref(false);
const showModifierModal = ref(false);
const showCityPricesModal = ref(false);
const editing = ref(null);
const activeGroup = ref(null);
const editingModifier = ref(null);
const activeModifierForPrices = ref(null);
const fileInput = ref(null);
const modifierCityIds = ref([]);
const modifierCityPrices = ref([]);
const selectedCityId = ref(null);
const saving = ref(false);
const uploadState = ref({
  loading: false,
  error: null,
  preview: null,
});
const form = ref({
  name: "",
  type: "single",
  is_required: false,
  is_global: false,
  min_selections: 0,
  max_selections: 1,
});
const modifierForm = ref({
  name: "",
  price: 0,
  weight: null,
  weight_unit: "",
  image_url: "",
});
const normalizeImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (import.meta.env.VITE_UPLOADS_URL || import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
};
const modalTitle = computed(() => (editing.value ? "Редактировать группу" : "Новая группа"));
const modalSubtitle = computed(() => (editing.value ? "Параметры группы" : "Создайте группу модификаторов"));
const modalNameTitle = computed(() => {
  if (showModifierModal.value) {
    const name = String(modifierForm.value.name || "").trim();
    if (editingModifier.value && name) return `Модификатор: ${name}`;
    if (editingModifier.value) return "Модификатор";
    return "Новый модификатор";
  }
  if (showModal.value) {
    const name = String(form.value.name || "").trim();
    if (editing.value && name) return `Группа: ${name}`;
    if (editing.value) return "Группа";
    return "Новая группа";
  }
  return null;
});
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const activeCities = computed(() => referenceStore.cities.filter((city) => modifierCityIds.value.includes(city.id)));
const normalizeCityId = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const getOrCreateModifierCityPrice = (cityId) => {
  const normalizedCityId = normalizeCityId(cityId);
  if (!normalizedCityId) return { city_id: cityId, price: activeModifierForPrices.value?.price || 0 };
  let entry = modifierCityPrices.value.find((price) => normalizeCityId(price.city_id) === normalizedCityId);
  if (!entry) {
    entry = {
      city_id: normalizedCityId,
      price: activeModifierForPrices.value?.price || 0,
    };
    modifierCityPrices.value.push(entry);
  }
  return entry;
};
const loadGroups = async () => {
  try {
    const response = await api.get("/api/menu/admin/modifier-groups");
    groups.value = response.data.modifier_groups || [];
  } catch (error) {
    devError("Failed to load groups:", error);
    showErrorNotification(`Ошибка при загрузке групп: ${error.response?.data?.error || error.message}`);
  }
};
const openModal = (group = null) => {
  editing.value = group;
  form.value = group
    ? {
        name: group.name,
        type: group.type,
        is_required: normalizeBoolean(group.is_required, false),
        is_global: normalizeBoolean(group.is_global, false),
        min_selections: group.min_selections || 0,
        max_selections: group.max_selections || 1,
      }
    : { name: "", type: "single", is_required: false, is_global: false, min_selections: 0, max_selections: 1 };
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
};
const submitGroup = async () => {
  try {
    if (editing.value) {
      await api.put(`/api/menu/admin/modifier-groups/${editing.value.id}`, form.value);
    } else {
      await api.post("/api/menu/admin/modifier-groups", form.value);
    }
    showSuccessNotification(editing.value ? "Группа модификаторов обновлена" : "Группа модификаторов создана");
    showModal.value = false;
    await loadGroups();
  } catch (error) {
    devError("Failed to save group:", error);
    showErrorNotification(`Ошибка при сохранении группы: ${error.response?.data?.error || error.message}`);
  }
};
const deleteGroup = async (group) => {
  if (!confirm(`Удалить группу "${group.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/modifier-groups/${group.id}`);
    showSuccessNotification("Группа модификаторов удалена");
    await loadGroups();
  } catch (error) {
    devError("Failed to delete group:", error);
    showErrorNotification(`Ошибка при удалении группы: ${error.response?.data?.error || error.message}`);
  }
};
const openModifierModal = (group) => {
  activeGroup.value = group;
  editingModifier.value = null;
  modifierForm.value = { name: "", price: 0, weight: null, weight_unit: "", image_url: "" };
  uploadState.value = { loading: false, error: null, preview: null };
  showModifierModal.value = true;
};
const editModifier = (group, modifier) => {
  activeGroup.value = group;
  editingModifier.value = modifier;
  modifierForm.value = {
    name: modifier.name,
    price: modifier.price,
    weight: modifier.weight || null,
    weight_unit: modifier.weight_unit || "",
    image_url: modifier.image_url || "",
  };
  uploadState.value = { loading: false, error: null, preview: null };
  showModifierModal.value = true;
};
const closeModifierModal = () => {
  showModifierModal.value = false;
};
const openCityPricesModal = async (modifier) => {
  try {
    saving.value = true;
    await referenceStore.fetchCitiesAndBranches();
    const response = await api.get(`/api/menu/admin/modifiers/${modifier.id}/prices`);
    const existingPrices = response.data.prices || [];
    modifierCityPrices.value = existingPrices.map((price) => ({
      city_id: normalizeCityId(price.city_id),
      price: price.price,
      is_active: Number(price.is_active) === 1 || price.is_active === true,
    }));
    modifierCityIds.value = existingPrices
      .filter((price) => Number(price.is_active) === 1 || price.is_active === true)
      .map((price) => normalizeCityId(price.city_id))
      .filter(Number.isFinite);
    selectedCityId.value = modifierCityIds.value.length ? modifierCityIds.value[0] : null;
    if (selectedCityId.value) {
      getOrCreateModifierCityPrice(selectedCityId.value);
    }
    activeModifierForPrices.value = modifier;
    showCityPricesModal.value = true;
  } catch (error) {
    devError("Failed to load modifier prices:", error);
    showErrorNotification("Ошибка при загрузке цен модификатора");
  } finally {
    saving.value = false;
  }
};
const closeCityPricesModal = () => {
  showCityPricesModal.value = false;
  activeModifierForPrices.value = null;
  modifierCityPrices.value = [];
  modifierCityIds.value = [];
  selectedCityId.value = null;
};
const triggerFile = () => {
  fileInput.value?.click();
};
const onFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) handleFile(file);
};
const onDrop = (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) handleFile(file);
};
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
const handleFile = async (file) => {
  if (!file.type.startsWith("image/")) {
    uploadState.value.error = "Только изображения";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadState.value.error = "Файл слишком большой (макс 10MB)";
    return;
  }
  uploadState.value.loading = true;
  uploadState.value.error = null;
  uploadState.value.preview = URL.createObjectURL(file);
  try {
    const formData = new FormData();
    formData.append("image", file);
    const modifierId = editingModifier.value?.id || "temp";
    const response = await api.post(`/api/uploads/modifiers/${modifierId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = response.data?.data?.url || "";
    modifierForm.value.image_url = uploadedUrl;
    uploadState.value.preview = uploadedUrl;
  } catch (error) {
    devError("Upload failed:", error);
    uploadState.value.error = "Ошибка загрузки";
  } finally {
    uploadState.value.loading = false;
  }
};
const submitModifier = async () => {
  if (!activeGroup.value) {
    devError("activeGroup is not set");
    showErrorNotification("Ошибка: не выбрана группа модификаторов");
    return;
  }
  try {
    const payload = {
      ...modifierForm.value,
      name: String(modifierForm.value.name || "").trim(),
      weight: modifierForm.value.weight ?? null,
      weight_unit: modifierForm.value.weight_unit || null,
      image_url: modifierForm.value.image_url || null,
    };
    if (editingModifier.value) {
      await api.put(`/api/menu/admin/modifiers/${editingModifier.value.id}`, payload);
    } else {
      const url = `/api/menu/admin/modifier-groups/${activeGroup.value.id}/modifiers`;
      await api.post(url, payload);
    }
    showSuccessNotification(editingModifier.value ? "Модификатор обновлен" : "Модификатор создан");
    showModifierModal.value = false;
    await loadGroups();
  } catch (error) {
    devError("Failed to save modifier:", error);
    showErrorNotification(`Ошибка при сохранении модификатора: ${error.response?.data?.error || error.message}`);
  }
};
const submitCityPrices = async () => {
  if (!activeModifierForPrices.value) return;
  saving.value = true;
  try {
    await api.put(`/api/menu/admin/modifiers/${activeModifierForPrices.value.id}/cities`, { city_ids: modifierCityIds.value });
    for (const cityId of modifierCityIds.value) {
      const entry = getOrCreateModifierCityPrice(cityId);
      if (entry.price === null || entry.price === undefined || entry.price === "") continue;
      await api.post(`/api/menu/admin/modifiers/${activeModifierForPrices.value.id}/prices`, {
        city_id: cityId,
        price: entry.price,
      });
    }
    showSuccessNotification("Цены модификатора сохранены");
    closeCityPricesModal();
  } catch (error) {
    devError("Failed to save modifier prices:", error);
    showErrorNotification("Ошибка при сохранении цен модификатора");
  } finally {
    saving.value = false;
  }
};
const deleteModifier = async (modifier) => {
  if (!confirm(`Удалить модификатор "${modifier.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/modifiers/${modifier.id}`);
    showSuccessNotification("Модификатор удален");
    await loadGroups();
  } catch (error) {
    devError("Failed to delete modifier:", error);
    showErrorNotification(`Ошибка при удалении модификатора: ${error.response?.data?.error || error.message}`);
  }
};
watch(
  () => [modalNameTitle.value, ordersStore.newOrdersCount],
  () => {
    updateDocumentTitle(modalNameTitle.value || "Модификаторы");
  },
  { immediate: true },
);
watch(
  () => modifierCityIds.value,
  (next, prev) => {
    const prevSet = new Set(prev || []);
    const nextSet = new Set(next || []);
    const added = next.filter((id) => !prevSet.has(id));
    added.forEach((cityId) => getOrCreateModifierCityPrice(cityId));
    if (selectedCityId.value && !nextSet.has(selectedCityId.value)) {
      selectedCityId.value = next.length ? next[0] : null;
    }
  },
  { deep: true },
);
watch(
  () => selectedCityId.value,
  (next) => {
    if (!next) return;
    getOrCreateModifierCityPrice(next);
  },
);
onMounted(loadGroups);
</script>
