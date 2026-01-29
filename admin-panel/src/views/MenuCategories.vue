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
      <CardHeader>
        <CardTitle>Список категорий</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
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
            <TableRow v-for="category in categories" :key="category.id">
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
    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitCategory">
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
          <Input v-model="form.image_url" placeholder="URL изображения категории (опционально)" />
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</label>
            <Input v-model.number="form.sort_order" type="number" placeholder="0 = автоматически" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Глобальный статус</label>
            <Select v-model="form.is_active">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </Select>
          </div>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Доступность по городам</label>
          <div class="grid gap-2 md:grid-cols-2">
            <label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
              <input v-model="form.city_ids" type="checkbox" :value="city.id" class="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              {{ city.name }}
            </label>
          </div>
        </div>
        <Button class="w-full" type="submit" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить" }}
        </Button>
      </form>
    </BaseModal>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import CardContent from "../components/ui/CardContent.vue";
import PageHeader from "../components/PageHeader.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import Textarea from "../components/ui/Textarea.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatNumber } from "../utils/format.js";
import { useReferenceStore } from "../stores/reference.js";
import { useOrdersStore } from "../stores/orders.js";
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showErrorNotification } = useNotifications();
const categories = ref([]);
const showModal = ref(false);
const editing = ref(null);
const saving = ref(false);
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
  } catch (error) {
    console.error("Failed to load categories:", error);
    showErrorNotification("Ошибка при загрузке категорий");
  }
};
const openModal = async (category = null) => {
  editing.value = category;
  form.value = category
    ? {
        name: category.name,
        description: category.description || "",
        image_url: category.image_url || "",
        sort_order: category.sort_order || 0,
        is_active: category.is_active,
        city_ids: [],
      }
    : {
        name: "",
        description: "",
        image_url: "",
        sort_order: 0,
        is_active: true,
        city_ids: referenceStore.cities.map((city) => city.id),
      };
  if (category) {
    try {
      const response = await api.get(`/api/menu/admin/categories/${category.id}/cities`);
      const activeCityIds = (response.data.cities || []).filter((city) => city.is_active).map((city) => city.city_id);
      form.value.city_ids = activeCityIds;
    } catch (error) {
      console.error("Failed to load category cities:", error);
      showErrorNotification("Ошибка при загрузке доступности по городам");
    }
  }
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
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
    showModal.value = false;
    await loadCategories();
  } catch (error) {
    console.error("Failed to save category:", error);
    showErrorNotification(`Ошибка при сохранении категории: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const deleteCategory = async (category) => {
  if (!confirm(`Удалить категорию "${category.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/categories/${category.id}`);
    await loadCategories();
  } catch (error) {
    console.error("Failed to delete category:", error);
    showErrorNotification(`Ошибка при удалении категории: ${error.response?.data?.error || error.message}`);
  }
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    await loadCategories();
  } catch (error) {
    console.error("Ошибка загрузки категорий:", error);
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
