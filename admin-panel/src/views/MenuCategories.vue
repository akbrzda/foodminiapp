<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Категории меню</CardTitle>
        <CardDescription>Создание и настройка категорий</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 md:grid-cols-[1fr_auto]">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="cityId" @change="loadCategories">
              <option value="">Выберите город</option>
              <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
            </Select>
          </div>
          <div class="flex items-end">
            <Button class="w-full md:w-auto" @click="openModal()">
              <Plus :size="16" />
              Добавить категорию
            </Button>
          </div>
        </div>
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
                <Badge :variant="category.is_active ? 'success' : 'secondary'">{{ category.is_active ? "Активна" : "Скрыта" }}</Badge>
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
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</label>
            <Input v-model.number="form.sort_order" type="number" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="form.is_active">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </Select>
          </div>
        </div>
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
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
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
import { formatNumber } from "../utils/format.js";

const referenceStore = useReferenceStore();
const cityId = ref("");
const categories = ref([]);
const showModal = ref(false);
const editing = ref(null);
const form = ref({
  name: "",
  description: "",
  sort_order: 0,
  is_active: true,
});

const modalTitle = computed(() => (editing.value ? "Редактировать категорию" : "Новая категория"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры категории" : "Создайте категорию меню"));

const loadCategories = async () => {
  if (!cityId.value) {
    categories.value = [];
    return;
  }
  const response = await api.get("/api/menu/admin/categories", { params: { city_id: cityId.value } });
  categories.value = response.data.categories || [];
};

const openModal = (category = null) => {
  if (!cityId.value) {
    alert("Сначала выберите город");
    return;
  }
  editing.value = category;
  form.value = category
    ? {
        name: category.name,
        description: category.description || "",
        sort_order: category.sort_order || 0,
        is_active: category.is_active,
      }
    : { name: "", description: "", sort_order: 0, is_active: true };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitCategory = async () => {
  if (!cityId.value) return;
  if (editing.value) {
    await api.put(`/api/menu/admin/categories/${editing.value.id}`, form.value);
  } else {
    await api.post("/api/menu/admin/categories", { ...form.value, city_id: cityId.value });
  }
  showModal.value = false;
  await loadCategories();
};

const deleteCategory = async (category) => {
  if (!confirm(`Удалить категорию "${category.name}"?`)) return;
  await api.delete(`/api/menu/admin/categories/${category.id}`);
  await loadCategories();
};

onMounted(async () => {
  await referenceStore.loadCities();
});
</script>
