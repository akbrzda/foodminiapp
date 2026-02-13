<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Позиции меню" description="Управление товарами и их параметрами">
          <template #actions>
            <Badge variant="secondary">Показано: {{ paginatedItems.length }} / {{ filteredItems.length }}</Badge>
            <Button @click="createItem">
              <Plus :size="16" />
              Добавить позицию
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="grid gap-3 md:grid-cols-4">
          <Input v-model="filters.search" placeholder="Поиск по названию и описанию" />
          <Select v-model="filters.status">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="active">Только активные</SelectItem>
              <SelectItem value="hidden">Только скрытые</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="filters.categoryId">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              <SelectItem v-for="category in categoriesOptions" :key="category.id" :value="String(category.id)">
                {{ category.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" @click="resetFilters">Сбросить фильтры</Button>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Позиция</TableHead>
              <TableHead>Категории</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="isLoading">
              <TableRow v-for="index in 6" :key="`loading-${index}`">
                <TableCell>
                  <div class="flex items-center gap-3">
                    <Skeleton class="h-12 w-12 rounded-lg" />
                    <div class="space-y-2">
                      <Skeleton class="h-4 w-40" />
                      <Skeleton class="h-3 w-56" />
                    </div>
                  </div>
                </TableCell>
                <TableCell><Skeleton class="h-6 w-32" /></TableCell>
                <TableCell><Skeleton class="h-4 w-20" /></TableCell>
                <TableCell><Skeleton class="h-6 w-20" /></TableCell>
                <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="item in paginatedItems" :key="item.id">
                <TableCell>
                  <div class="flex items-center gap-3">
                    <img v-if="item.image_url" :src="normalizeImageUrl(item.image_url)" :alt="item.name" class="h-12 w-12 rounded-lg object-cover" />
                    <div>
                      <div class="font-medium text-foreground">{{ item.name }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description || "—" }}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex flex-wrap gap-1">
                    <Badge v-for="cat in item.categories" :key="cat.id" variant="secondary" class="text-xs">{{ cat.name }}</Badge>
                  </div>
                </TableCell>
                <TableCell>{{ item.base_price !== null && item.base_price !== undefined ? `от ${formatCurrency(item.base_price)}` : "—" }}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    :class="
                      item.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'
                    "
                  >
                    {{ item.is_active ? "Активна" : "Скрыта" }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" @click="editItem(item)">
                      <Pencil :size="16" />
                    </Button>
                    <Button variant="ghost" size="icon" @click="deleteItem(item)">
                      <Trash2 :size="16" class="text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
            <TableRow v-if="!isLoading && filteredItems.length === 0">
              <TableCell colspan="5" class="py-8 text-center text-sm text-muted-foreground">По заданным фильтрам ничего не найдено</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <TablePagination
      :total="filteredItems.length"
      :page="page"
      :page-size="pageSize"
      @update:page="page = $event"
      @update:page-size="onPageSizeChange"
    />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Pencil, Plus, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { formatCurrency } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";

const router = useRouter();
const { showErrorNotification } = useNotifications();

// Навигационный контекст
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("menu-items");

const items = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({
  search: "",
  status: "all",
  categoryId: "all",
});

const categoriesOptions = computed(() => {
  const map = new Map();
  for (const item of items.value) {
    for (const category of item.categories || []) {
      if (!map.has(category.id)) {
        map.set(category.id, { id: category.id, name: category.name });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
});

const filteredItems = computed(() => {
  const search = String(filters.search || "")
    .trim()
    .toLowerCase();
  return items.value.filter((item) => {
    if (filters.status === "active" && !item.is_active) return false;
    if (filters.status === "hidden" && item.is_active) return false;
    if (filters.categoryId !== "all") {
      const selectedCategoryId = Number(filters.categoryId);
      const hasCategory = (item.categories || []).some((category) => Number(category.id) === selectedCategoryId);
      if (!hasCategory) return false;
    }
    if (!search) return true;
    const haystack = `${item.name || ""} ${item.description || ""}`.toLowerCase();
    return haystack.includes(search);
  });
});

const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

const normalizeImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (import.meta.env.VITE_UPLOADS_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
};

const resetFilters = () => {
  filters.search = "";
  filters.status = "all";
  filters.categoryId = "all";
  page.value = 1;
};

const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const loadItems = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/api/menu/admin/items");
    items.value = response.data.items || [];
    page.value = 1;
  } catch (error) {
    devError("Failed to load items:", error);
    showErrorNotification(`Ошибка при загрузке позиций: ${error.response?.data?.error || error.message}`);
  } finally {
    isLoading.value = false;
  }
};
const createItem = () => {
  saveContext(filters, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "menu-item-form", params: { id: "new" } });
};

const editItem = (item) => {
  saveContext(filters, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "menu-item-form", params: { id: item.id } });
};
const deleteItem = async (item) => {
  if (!confirm(`Удалить позицию "${item.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/items/${item.id}`);
    await loadItems();
  } catch (error) {
    devError("Failed to delete item:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  }
};

onMounted(async () => {
  if (shouldRestore.value) {
    const context = restoreContext();

    if (context) {
      Object.assign(filters, context.filters);
      if (context.page) page.value = context.page;
      if (context.pageSize) pageSize.value = context.pageSize;

      await loadItems();
      restoreScroll(context.scroll);
    }
  } else {
    await loadItems();
  }
});

watch(
  () => [filters.search, filters.status, filters.categoryId],
  () => {
    page.value = 1;
  },
);
</script>
