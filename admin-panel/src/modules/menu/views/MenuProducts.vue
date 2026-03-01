<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Блюда меню" description="Управление блюдами и их параметрами">
          <template #actions>
            <Badge variant="secondary">Показано: {{ paginatedItems.length }} / {{ filteredItems.length }}</Badge>
            <Button @click="createItem">
              <Plus :size="16" />
              Добавить блюдо
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
          <div class="space-y-1 sm:col-span-2 xl:col-span-4">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
            <Input v-model="filters.search" placeholder="Поиск по названию и описанию" />
          </div>
          <div class="space-y-1 xl:col-span-2">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
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
          </div>
          <div class="space-y-1 xl:col-span-2">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Категория</label>
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
          </div>
          <div class="space-y-1 xl:col-span-2">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="filters.cityId">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Город" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все города</SelectItem>
                <SelectItem v-for="city in cityOptions" :key="city.id" :value="String(city.id)">
                  {{ city.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1 xl:col-span-1">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Источник</label>
            <Select v-model="filters.source">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Источник блюд" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Локальное</SelectItem>
                <SelectItem value="iiko">iiko</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex items-end xl:col-span-1">
            <Button class="w-full" variant="outline" @click="resetFilters">Сбросить</Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-36" />
              <Skeleton class="h-3 w-44" />
              <Skeleton class="h-5 w-20" />
            </div>
          </template>
          <template v-else>
            <div v-for="item in paginatedItems" :key="`mobile-${item.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="flex items-start gap-3">
                <img v-if="item.image_url" :src="normalizeImageUrl(item.image_url)" :alt="item.name" class="h-12 w-12 rounded-lg object-cover" />
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-foreground">{{ item.name }}</div>
                  <div class="text-xs text-muted-foreground">{{ item.description || "—" }}</div>
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <Badge v-for="cat in item.categories" :key="`mobile-cat-${item.id}-${cat.id}`" variant="secondary" class="text-xs">{{ cat.name }}</Badge>
              </div>
              <div class="mt-2 flex items-center justify-between">
                <div class="text-sm font-medium text-foreground">
                  {{ item.base_price !== null && item.base_price !== undefined ? `от ${formatCurrency(item.base_price)}` : "—" }}
                </div>
                <Badge
                  variant="secondary"
                  :class="item.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ item.is_active ? "Активна" : "Скрыта" }}
                </Badge>
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="icon" @click="editItem(item)">
                  <Pencil :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="deleteItem(item)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </div>
            <div v-if="filteredItems.length === 0" class="py-8 text-center text-sm text-muted-foreground">По заданным фильтрам ничего не найдено</div>
          </template>
        </div>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Блюдо</TableHead>
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
        </div>
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
import { useReferenceStore } from "@/shared/stores/reference.js";
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
const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();

// Навигационный контекст
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("menu-products");

const items = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const defaultSource = ref("local");
const isSourceWatcherReady = ref(false);
const filters = reactive({
  search: "",
  status: "all",
  categoryId: "all",
  cityId: "all",
  source: "",
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

const cityOptions = computed(() => {
  return [...referenceStore.cities].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));
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
    if (filters.cityId !== "all") {
      const selectedCityId = Number(filters.cityId);
      const itemCityIds = Array.isArray(item.city_ids) ? item.city_ids.map((id) => Number(id)) : [];
      if (!itemCityIds.includes(selectedCityId)) return false;
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
  const nextSource = defaultSource.value || "local";
  filters.search = "";
  filters.status = "all";
  filters.categoryId = "all";
  filters.cityId = "all";
  filters.source = nextSource;
  page.value = 1;
};

const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const loadItems = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const params = {};
    if (filters.source === "local" || filters.source === "iiko") {
      params.source = filters.source;
    }
    const response = await api.get("/api/menu/admin/products", { params });
    items.value = response.data.items || [];
    const responseDefaultSource = String(response.data?.meta?.default_source || "")
      .trim()
      .toLowerCase();
    if (responseDefaultSource === "local" || responseDefaultSource === "iiko") {
      defaultSource.value = responseDefaultSource;
    }
    const responseSource = String(response.data?.meta?.source || "")
      .trim()
      .toLowerCase();
    if (!filters.source && (responseSource === "local" || responseSource === "iiko")) {
      filters.source = responseSource;
    } else if (!filters.source) {
      filters.source = defaultSource.value;
    }
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Failed to load items:", error);
    showErrorNotification(`Ошибка при загрузке блюд: ${error.response?.data?.error || error.message}`);
  } finally {
    isLoading.value = false;
  }
};
const createItem = () => {
  saveContext(filters, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "menu-product-form", params: { id: "new" } });
};

const editItem = (item) => {
  saveContext(filters, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "menu-product-form", params: { id: item.id } });
};
const deleteItem = async (item) => {
  if (!confirm(`Удалить блюдо "${item.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/products/${item.id}`);
    await loadItems();
  } catch (error) {
    devError("Failed to delete item:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  }
};

onMounted(async () => {
  await referenceStore.loadCities();

  if (shouldRestore.value) {
    const context = restoreContext();
    
    if (context) {
      Object.assign(filters, context.filters);
      if (context.page) page.value = context.page;
      if (context.pageSize) pageSize.value = context.pageSize;
      
      await loadItems({ preservePage: true });
      restoreScroll(context.scroll);
    }
  } else {
    await loadItems();
  }
  isSourceWatcherReady.value = true;
});

watch(
  () => [filters.search, filters.status, filters.categoryId, filters.cityId],
  () => {
    page.value = 1;
  },
);
watch(
  () => filters.source,
  async (nextSource, prevSource) => {
    if (!isSourceWatcherReady.value) return;
    if (nextSource !== "local" && nextSource !== "iiko") return;
    if (nextSource === prevSource) return;
    page.value = 1;
    await loadItems({ preservePage: true });
  },
);
</script>
