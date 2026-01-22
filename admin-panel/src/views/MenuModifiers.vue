<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Группы модификаторов</CardTitle>
          <CardDescription>Одиночный и множественный выбор</CardDescription>
        </div>
        <Button @click="openModal()">
          <Plus :size="16" />
          Добавить группу
        </Button>
      </CardHeader>
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
              <Button variant="ghost" size="icon" @click="openVariantPricesModal(modifier)">
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

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitGroup">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="form.name" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип</label>
          <Select v-model="form.type">
            <option value="single">Одиночный выбор</option>
            <option value="multiple">Множественный выбор</option>
          </Select>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Минимум выборов</label>
            <Input v-model.number="form.min_selections" type="number" min="0" placeholder="0" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Максимум выборов</label>
            <Input v-model.number="form.max_selections" type="number" min="1" placeholder="1" />
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input v-model="form.is_required" type="checkbox" class="h-4 w-4 rounded border-border" />
          Обязательная группа
        </label>
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input v-model="form.is_global" type="checkbox" class="h-4 w-4 rounded border-border" />
          Глобальная группа (переиспользуемая)
        </label>
        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>

    <BaseModal v-if="showModifierModal" title="Модификатор" subtitle="Добавьте параметр" @close="closeModifierModal">
      <form class="space-y-4" @submit.prevent="submitModifier">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="modifierForm.name" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Цена</label>
          <Input v-model.number="modifierForm.price" type="number" step="0.01" />
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Вес</label>
            <Input v-model.number="modifierForm.weight" type="number" step="0.01" placeholder="Опционально" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Единица</label>
            <Select v-model="modifierForm.weight_unit">
              <option value="">Не указано</option>
              <option value="g">г (граммы)</option>
              <option value="kg">кг (килограммы)</option>
              <option value="ml">мл (миллилитры)</option>
              <option value="l">л (литры)</option>
              <option value="pcs">шт (штуки)</option>
            </Select>
          </div>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение</label>
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
            <span v-if="uploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
          </div>
          <div v-if="uploadState.preview || modifierForm.image_url" class="mt-3 flex items-center gap-3">
            <img :src="normalizeImageUrl(uploadState.preview || modifierForm.image_url)" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
            <Input v-model="modifierForm.image_url" class="text-xs" placeholder="URL изображения" />
          </div>
        </div>
        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>

    <BaseModal v-if="showVariantPricesModal" title="Цены по вариациям" subtitle="Настройка цен модификатора" @close="closeVariantPricesModal">
      <form class="space-y-4" @submit.prevent="submitVariantPrices">
        <div v-if="variantPriceRows.length === 0" class="text-sm text-muted-foreground">Нет доступных вариаций</div>
        <div v-for="row in variantPriceRows" :key="row.variant_id" class="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] items-end">
          <div class="space-y-1">
            <div class="text-sm font-medium text-foreground">{{ row.variant_name }}</div>
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Цена</label>
            <Input v-model.number="row.price" type="number" step="0.01" placeholder="0.00" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Вес</label>
            <Input v-model.number="row.weight" type="number" step="0.01" placeholder="—" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">Ед.</label>
            <Select v-model="row.weight_unit">
              <option value="">—</option>
              <option value="g">г</option>
              <option value="kg">кг</option>
              <option value="ml">мл</option>
              <option value="l">л</option>
              <option value="pcs">шт</option>
            </Select>
          </div>
        </div>
        <Button class="w-full" type="submit" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить цены" }}
        </Button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, Save, Settings2, Trash2, UploadCloud } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import { formatCurrency } from "../utils/format.js";

const groups = ref([]);
const showModal = ref(false);
const showModifierModal = ref(false);
const showVariantPricesModal = ref(false);
const editing = ref(null);
const activeGroup = ref(null);
const editingModifier = ref(null);
const activeModifierForPrices = ref(null);
const fileInput = ref(null);
const variantPriceRows = ref([]);
const allVariants = ref([]);
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

const loadGroups = async () => {
  try {
    const response = await api.get("/api/menu/admin/modifier-groups");
    groups.value = response.data.modifier_groups || [];
  } catch (error) {
    console.error("Failed to load groups:", error);
    alert("Ошибка при загрузке групп: " + (error.response?.data?.error || error.message));
  }
};

const loadVariants = async () => {
  if (allVariants.value.length > 0) return;
  const response = await api.get("/api/menu/admin/variants");
  allVariants.value = response.data.variants || [];
};

const openModal = (group = null) => {
  editing.value = group;
  form.value = group
    ? {
        name: group.name,
        type: group.type,
        is_required: group.is_required,
        is_global: group.is_global || false,
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
    showModal.value = false;
    await loadGroups();
  } catch (error) {
    console.error("Failed to save group:", error);
    alert("Ошибка при сохранении группы: " + (error.response?.data?.error || error.message));
  }
};

const deleteGroup = async (group) => {
  if (!confirm(`Удалить группу "${group.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/modifier-groups/${group.id}`);
    await loadGroups();
  } catch (error) {
    console.error("Failed to delete group:", error);
    alert("Ошибка при удалении группы: " + (error.response?.data?.error || error.message));
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

const openVariantPricesModal = async (modifier) => {
  try {
    saving.value = true;
    await loadVariants();
    const response = await api.get(`/api/menu/admin/modifiers/${modifier.id}/variant-prices`);
    const existingPrices = response.data.prices || [];
    const priceByVariant = new Map(existingPrices.map((price) => [price.variant_id, price]));

    variantPriceRows.value = allVariants.value.map((variant) => {
      const existing = priceByVariant.get(variant.id);
      return {
        variant_id: variant.id,
        variant_name: variant.name,
        price: existing?.price ?? null,
        weight: existing?.weight ?? null,
        weight_unit: existing?.weight_unit ?? "",
      };
    });

    activeModifierForPrices.value = modifier;
    showVariantPricesModal.value = true;
  } catch (error) {
    console.error("Failed to load variant prices:", error);
    alert("Ошибка при загрузке цен вариаций");
  } finally {
    saving.value = false;
  }
};

const closeVariantPricesModal = () => {
  showVariantPricesModal.value = false;
  activeModifierForPrices.value = null;
  variantPriceRows.value = [];
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

    // Используем ID модификатора если редактируем, иначе 'temp' для временной загрузки
    const modifierId = editingModifier.value?.id || "temp";
    const response = await api.post(`/api/uploads/modifiers/${modifierId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const uploadedUrl = response.data?.data?.url || "";
    modifierForm.value.image_url = uploadedUrl;
    uploadState.value.preview = uploadedUrl;
  } catch (error) {
    console.error("Upload failed:", error);
    uploadState.value.error = "Ошибка загрузки";
  } finally {
    uploadState.value.loading = false;
  }
};

const submitModifier = async () => {
  if (!activeGroup.value) {
    console.error("activeGroup is not set");
    alert("Ошибка: не выбрана группа модификаторов");
    return;
  }

  try {
    if (editingModifier.value) {
      await api.put(`/api/menu/admin/modifiers/${editingModifier.value.id}`, modifierForm.value);
    } else {
      const url = `/api/menu/admin/modifier-groups/${activeGroup.value.id}/modifiers`;
      await api.post(url, modifierForm.value);
    }
    showModifierModal.value = false;
    await loadGroups();
  } catch (error) {
    console.error("Failed to save modifier:", error);
    alert("Ошибка при сохранении модификатора: " + (error.response?.data?.error || error.message));
  }
};

const submitVariantPrices = async () => {
  if (!activeModifierForPrices.value) return;
  saving.value = true;
  try {
    for (const row of variantPriceRows.value) {
      if (row.price === null || row.price === undefined || row.price === "") continue;
      await api.post(`/api/menu/admin/modifiers/${activeModifierForPrices.value.id}/variant-prices`, {
        variant_id: row.variant_id,
        price: row.price,
        weight: row.weight,
        weight_unit: row.weight_unit || null,
      });
    }
    closeVariantPricesModal();
  } catch (error) {
    console.error("Failed to save variant prices:", error);
    alert("Ошибка при сохранении цен вариаций");
  } finally {
    saving.value = false;
  }
};

const deleteModifier = async (modifier) => {
  if (!confirm(`Удалить модификатор "${modifier.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/modifiers/${modifier.id}`);
    await loadGroups();
  } catch (error) {
    console.error("Failed to delete modifier:", error);
    alert("Ошибка при удалении модификатора: " + (error.response?.data?.error || error.message));
  }
};

onMounted(loadGroups);
</script>
