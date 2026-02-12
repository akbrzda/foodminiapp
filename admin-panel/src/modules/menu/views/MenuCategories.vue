import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Категории меню" description="Создание и настройка категорий">
          <template #actions>
            <Badge variant="secondary">Всего: {{ categories.length }}</Badge>
            <Button class="w-full md:w-auto" @click="openModal()">
              <Plus :size="16" />
              Добавить категорию
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Категория</TableHead>
              <TableHead>Порядок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="category in paginatedCategories" :key="category.id">
              <TableCell>
                <div class="font-medium text-foreground">{{ category.name }}</div>
                <div class="text-xs text-muted-foreground">{{ category.description || "—" }}</div>
              </TableCell>
              <TableCell>{{ formatNumber(category.sort_order || 0) }}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  :class="
                    category.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'
                  "
                >
                  {{ category.is_active ? "Активна" : "Скрыта" }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(category)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteCategory(category)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <TablePagination :total="categories.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitCategory">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</FieldLabel>
              <FieldContent>
                <Textarea v-model="form.description" rows="3" />
              </FieldContent>
            </Field>
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
                    Загрузить изображение
                  </Button>
                  <span>или перетащите файл сюда</span>
                  <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
                  <span v-if="uploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
                </div>
                <div v-if="uploadState.preview || form.image_url" class="mt-3 flex items-center gap-3">
                  <img :src="normalizeImageUrl(uploadState.preview || form.image_url)" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
                </div>
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.sort_order" type="number" placeholder="0 = автоматически" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Глобальный статус</FieldLabel>
                <FieldContent>
                  <Select v-model="form.is_active">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Активна</SelectItem>
                      <SelectItem :value="false">Скрыта</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Доступность по городам</FieldLabel>
              <FieldContent>
                <div class="grid gap-2 md:grid-cols-2">
                  <Label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
                    <input
                      v-model="form.city_ids"
                      type="checkbox"
                      :value="Number(city.id)"
                      class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    {{ city.name }}
                  </Label>
                </div>
              </FieldContent>
            </Field>
          </FieldGroup>
          <Button class="w-full" type="submit" :disabled="saving">
            <Save :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Pencil, Plus, Save, Trash2, UploadCloud } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import PageHeader from "@/shared/components/PageHeader.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatNumber, normalizeBoolean, normalizeImageUrl } from "@/shared/utils/format.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const categories = ref([]);
const page = ref(1);
const pageSize = ref(20);
const showModal = ref(false);
const editing = ref(null);
const saving = ref(false);
const fileInput = ref(null);
const uploadState = ref({ loading: false, error: null, preview: null });
const form = ref({
  name: "",
  description: "",
  image_url: "",
  sort_order: 0,
  is_active: true,
  city_ids: [],
});
const modalTitle = computed(() => (editing.value ? "Редактировать категорию" : "Новая категория"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры категории" : "Создайте категорию меню"));
const paginatedCategories = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return categories.value.slice(start, start + pageSize.value);
});
const modalNameTitle = computed(() => {
  if (!showModal.value) return null;
  const name = String(form.value.name || "").trim();
  if (editing.value && name) return `Категория: ${name}`;
  if (editing.value) return "Категория";
  return "Новая категория";
});
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const loadCategories = async () => {
  try {
    const response = await api.get("/api/menu/admin/all-categories");
    categories.value = response.data.categories || [];
    page.value = 1;
  } catch (error) {
    devError("Failed to load categories:", error);
    showErrorNotification("Ошибка при загрузке категорий");
  }
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};
const openModal = async (category = null) => {
  editing.value = category;
  uploadState.value = { loading: false, error: null, preview: null };
  form.value = category
    ? {
        name: category.name,
        description: category.description || "",
        image_url: category.image_url || "",
        sort_order: category.sort_order || 0,
        is_active: normalizeBoolean(category.is_active, true),
        city_ids: [],
      }
    : {
        name: "",
        description: "",
        image_url: "",
        sort_order: 0,
        is_active: true,
        city_ids: referenceStore.cities.map((city) => Number(city.id)).filter(Number.isFinite),
      };
  if (category) {
    try {
      const response = await api.get(`/api/menu/admin/categories/${category.id}/cities`);
      const activeCityIds = (response.data.cities || [])
        .filter((city) => city.is_active)
        .map((city) => Number(city.city_id))
        .filter(Number.isFinite);
      form.value.city_ids = activeCityIds;
    } catch (error) {
      devError("Failed to load category cities:", error);
      showErrorNotification("Ошибка при загрузке доступности по городам");
    }
  }
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
};
const triggerFile = () => {
  fileInput.value?.click();
};
const onDrop = (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    handleFile(file);
  }
};
const onFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    handleFile(file);
  }
};
const handleFile = async (file) => {
  if (!file.type.startsWith("image/")) {
    uploadState.value.error = "Только изображения";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadState.value.error = "Файл больше 10MB";
    return;
  }
  uploadState.value = { loading: true, error: null, preview: URL.createObjectURL(file) };
  try {
    const categoryId = editing.value?.id || "temp";
    const formData = new FormData();
    formData.append("image", file);
    const response = await api.post(`/api/uploads/menu-categories/${categoryId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = response.data?.data?.url || "";
    form.value.image_url = uploadedUrl;
    uploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Failed to upload category image:", error);
    uploadState.value = { loading: false, error: "Ошибка загрузки", preview: null };
  }
};
const submitCategory = async () => {
  saving.value = true;
  try {
    const payload = { ...form.value };
    if (editing.value) {
      await api.put(`/api/menu/admin/categories/${editing.value.id}`, payload);
    } else {
      await api.post("/api/menu/admin/categories", payload);
    }
    showSuccessNotification(editing.value ? "Категория обновлена" : "Категория создана");
    showModal.value = false;
    await loadCategories();
  } catch (error) {
    devError("Failed to save category:", error);
    showErrorNotification(`Ошибка при сохранении категории: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const deleteCategory = async (category) => {
  if (!confirm(`Удалить категорию "${category.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/categories/${category.id}`);
    showSuccessNotification("Категория удалена");
    await loadCategories();
  } catch (error) {
    devError("Failed to delete category:", error);
    showErrorNotification(`Ошибка при удалении категории: ${error.response?.data?.error || error.message}`);
  }
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    await loadCategories();
  } catch (error) {
    devError("Ошибка загрузки категорий:", error);
    showErrorNotification("Ошибка загрузки категорий");
  }
});
watch(
  () => [modalNameTitle.value, ordersStore.newOrdersCount],
  () => {
    updateDocumentTitle(modalNameTitle.value || "Категории");
  },
  { immediate: true },
);
</script>
