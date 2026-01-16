<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Позиции меню</CardTitle>
        <CardDescription>Управление товарами, вариантами и модификаторами</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="cityId" @change="loadCategories">
              <option value="">Выберите город</option>
              <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Категория</label>
            <Select v-model="categoryId" @change="loadItems">
              <option value="">Выберите категорию</option>
              <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
            </Select>
          </div>
          <div class="flex items-end">
            <Button class="w-full md:w-auto" @click="openModal()">
              <Plus :size="16" />
              Добавить позицию
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Список позиций</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Позиция</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in items" :key="item.id">
              <TableCell>
                <div class="flex items-center gap-3">
                  <img
                    v-if="item.image_url"
                    :src="normalizeImageUrl(item.image_url)"
                    :alt="item.name"
                    class="h-12 w-12 rounded-lg object-cover"
                  />
                  <div>
                    <div class="font-medium text-foreground">{{ item.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ item.description || "Без описания" }}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{{ formatCurrency(item.price) }}</TableCell>
              <TableCell>
                <Badge :variant="item.is_active ? 'success' : 'secondary'">{{ item.is_active ? "Активна" : "Скрыта" }}</Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(item)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteItem(item)">
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
      <form class="space-y-4" @submit.prevent="submitItem">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="form.name" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</label>
          <Textarea v-model="form.description" rows="3" />
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
          <div v-if="uploadState.preview || form.image_url" class="mt-3 flex items-center gap-3">
            <img :src="normalizeImageUrl(uploadState.preview || form.image_url)" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
            <Input v-model="form.image_url" class="text-xs" />
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Цена (если без вариантов)</label>
            <Input v-model.number="form.price" type="number" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="form.is_active">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader class="flex items-center justify-between">
            <CardTitle>Варианты позиции</CardTitle>
            <Button type="button" variant="outline" size="sm" @click="addVariant">
              <Plus :size="16" />
              Добавить
            </Button>
          </CardHeader>
          <CardContent class="space-y-3">
            <div v-for="(variant, index) in form.variants" :key="index" class="grid gap-3 md:grid-cols-[1.2fr_0.6fr_auto]">
              <Input v-model="variant.name" placeholder="Название" />
              <Input v-model.number="variant.price" type="number" placeholder="Цена" />
              <Button type="button" variant="ghost" size="icon" @click="removeVariant(index)">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Группы модификаторов</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <label v-for="group in modifierGroups" :key="group.id" class="flex items-center gap-2 text-sm text-foreground">
                <input v-model="form.modifier_group_ids" type="checkbox" :value="group.id" class="h-4 w-4 rounded border-border" />
                <span>{{ group.name }}</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, Save, Trash2, UploadCloud } from "lucide-vue-next";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import BaseModal from "../components/BaseModal.vue";
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
import Textarea from "../components/ui/Textarea.vue";
import { formatCurrency, normalizeImageUrl } from "../utils/format.js";

const referenceStore = useReferenceStore();
const cityId = ref("");
const categoryId = ref("");
const categories = ref([]);
const items = ref([]);
const modifierGroups = ref([]);
const showModal = ref(false);
const editing = ref(null);

const form = ref({
  name: "",
  description: "",
  image_url: "",
  price: 0,
  is_active: true,
  variants: [],
  modifier_group_ids: [],
});

const fileInput = ref(null);
const uploadState = ref({
  loading: false,
  error: "",
  preview: "",
});

const removedVariantIds = ref([]);
const originalGroupIds = ref([]);

const modalTitle = computed(() => (editing.value ? "Редактировать позицию" : "Новая позиция"));
const modalSubtitle = computed(() => (editing.value ? "Обновите параметры позиции" : "Создайте позицию меню"));

const loadCategories = async () => {
  if (!cityId.value) {
    categories.value = [];
    categoryId.value = "";
    items.value = [];
    return;
  }
  const response = await api.get("/api/menu/admin/categories", { params: { city_id: cityId.value } });
  categories.value = response.data.categories || [];
  categoryId.value = "";
  items.value = [];
};

const loadItems = async () => {
  if (!categoryId.value) {
    items.value = [];
    return;
  }
  const response = await api.get(`/api/menu/admin/categories/${categoryId.value}/items`);
  items.value = response.data.items || [];
};

const loadModifierGroups = async () => {
  const response = await api.get("/api/menu/admin/modifier-groups");
  modifierGroups.value = response.data.modifier_groups || [];
};

const openModal = async (item = null) => {
  if (!categoryId.value && !item) {
    alert("Сначала выберите категорию");
    return;
  }
  editing.value = item;
  removedVariantIds.value = [];
  originalGroupIds.value = [];
  form.value = item
    ? {
        name: item.name,
        description: item.description || "",
        image_url: item.image_url || "",
        price: item.price || 0,
        is_active: item.is_active,
        variants: [],
        modifier_group_ids: [],
      }
    : {
        name: "",
        description: "",
        image_url: "",
        price: 0,
        is_active: true,
        variants: [],
        modifier_group_ids: [],
      };

  uploadState.value = {
    loading: false,
    error: "",
    preview: item?.image_url || "",
  };

  if (item?.id) {
    const [variantsResponse, groupsResponse] = await Promise.all([
      api.get(`/api/menu/admin/items/${item.id}/variants`),
      api.get(`/api/menu/admin/items/${item.id}/modifier-groups`),
    ]);
    form.value.variants = variantsResponse.data.variants || [];
    form.value.modifier_group_ids = (groupsResponse.data.modifier_groups || []).map((group) => group.id);
    originalGroupIds.value = form.value.modifier_group_ids.slice();
  }

  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitItem = async () => {
  if (!categoryId.value && !editing.value) return;

  const payload = {
    name: form.value.name,
    description: form.value.description,
    image_url: form.value.image_url,
    price: form.value.price,
    is_active: form.value.is_active,
  };

  if (editing.value) {
    await api.put(`/api/menu/admin/items/${editing.value.id}`, payload);
  } else {
    await api.post(`/api/menu/admin/categories/${categoryId.value}/items`, payload);
  }

  if (editing.value?.id) {
    await syncVariants(editing.value.id);
    await syncModifierGroups(editing.value.id);
  }

  showModal.value = false;
  await loadItems();
};

const deleteItem = async (item) => {
  if (!confirm(`Удалить позицию "${item.name}"?`)) return;
  await api.delete(`/api/menu/admin/items/${item.id}`);
  await loadItems();
};

const addVariant = () => {
  form.value.variants.push({ name: "", price: 0 });
};

const removeVariant = (index) => {
  const variant = form.value.variants[index];
  if (variant?.id) {
    removedVariantIds.value.push(variant.id);
  }
  form.value.variants.splice(index, 1);
};

const syncVariants = async (itemId) => {
  for (const variantId of removedVariantIds.value) {
    await api.delete(`/api/menu/admin/variants/${variantId}`);
  }
  for (const variant of form.value.variants) {
    if (variant.id) {
      await api.put(`/api/menu/admin/variants/${variant.id}`, variant);
    } else if (variant.name && variant.price !== null) {
      await api.post(`/api/menu/admin/items/${itemId}/variants`, variant);
    }
  }
};

const syncModifierGroups = async (itemId) => {
  const currentIds = new Set(form.value.modifier_group_ids);
  const originalIds = new Set(originalGroupIds.value);

  for (const groupId of currentIds) {
    if (!originalIds.has(groupId)) {
      await api.post(`/api/menu/admin/items/${itemId}/modifier-groups`, { modifier_group_id: groupId });
    }
  }

  for (const groupId of originalIds) {
    if (!currentIds.has(groupId)) {
      await api.delete(`/api/menu/admin/items/${itemId}/modifier-groups/${groupId}`);
    }
  }
};

const triggerFile = () => {
  fileInput.value?.click();
};

const onFileChange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await uploadFile(file);
};

const onDrop = async (event) => {
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  await uploadFile(file);
};

const uploadFile = async (file) => {
  uploadState.value = { loading: true, error: "", preview: uploadState.value.preview };
  if (file.size > 500 * 1024) {
    uploadState.value = { loading: false, error: "Файл слишком большой", preview: "" };
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await api.post("/api/uploads", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    form.value.image_url = response.data.file_url || "";
    uploadState.value = {
      loading: false,
      error: "",
      preview: response.data.file_url || "",
    };
  } catch (error) {
    console.error("Ошибка загрузки файла:", error);
    uploadState.value = { loading: false, error: "Не удалось загрузить файл", preview: "" };
  }
};

onMounted(async () => {
  await referenceStore.loadCities();
  await loadModifierGroups();
});
</script>
