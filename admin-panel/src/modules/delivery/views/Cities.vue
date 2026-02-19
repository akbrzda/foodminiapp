<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Города" description="Управление городами доставки">
          <template #actions>
            <Badge variant="secondary">Всего: {{ cities.length }}</Badge>
            <Button @click="goToCreate">
              <Plus :size="16" />
              Добавить город
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-28" />
              <Skeleton class="h-3 w-36" />
              <Skeleton class="h-5 w-20" />
            </div>
          </template>
          <template v-else>
            <div v-for="city in paginatedCities" :key="`mobile-${city.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="font-medium text-foreground">{{ city.name }}</div>
              <div class="text-xs text-muted-foreground">ID: {{ city.id }}</div>
              <div class="mt-2 text-sm text-muted-foreground">
                {{ city.latitude && city.longitude ? `${city.latitude}, ${city.longitude}` : "—" }}
              </div>
              <div class="text-xs text-muted-foreground">{{ city.timezone || "Europe/Moscow" }}</div>
              <div class="mt-2">
                <Badge
                  variant="secondary"
                  :class="city.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ city.is_active ? "Активен" : "Неактивен" }}
                </Badge>
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="icon" @click="goToEdit(city)">
                  <Pencil :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="deleteCity(city)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </div>
            <div v-if="cities.length === 0" class="py-8 text-center text-sm text-muted-foreground">Города не найдены</div>
          </template>
        </div>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Город</TableHead>
                <TableHead>Координаты</TableHead>
                <TableHead>Часовой пояс</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 6" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="city in paginatedCities" :key="city.id">
                  <TableCell>
                    <div class="font-medium text-foreground">{{ city.name }}</div>
                    <div class="text-xs text-muted-foreground">ID: {{ city.id }}</div>
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin :size="14" />
                      {{ city.latitude && city.longitude ? `${city.latitude}, ${city.longitude}` : "—" }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="text-sm text-muted-foreground">
                      {{ city.timezone || "Europe/Moscow" }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      :class="
                        city.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'
                      "
                    >
                      {{ city.is_active ? "Активен" : "Неактивен" }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" @click="goToEdit(city)">
                        <Pencil :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="deleteCity(city)">
                        <Trash2 :size="16" class="text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="cities.length === 0">
                  <TableCell colspan="5" class="py-8 text-center text-sm text-muted-foreground">Города не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <TablePagination :total="cities.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref } from "vue";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";

const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();

// Навигационный контекст
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("cities");

const cities = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const paginatedCities = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return cities.value.slice(start, start + pageSize.value);
});

const loadCities = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const response = await api.get("/api/cities/admin/all");
    cities.value = response.data.cities || [];
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Failed to load cities:", error);
    showErrorNotification("Ошибка при загрузке городов");
  } finally {
    isLoading.value = false;
  }
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const goToCreate = () => {
  saveContext({}, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "city-new" });
};

const goToEdit = (city) => {
  saveContext({}, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "city-edit", params: { id: city.id } });
};

const deleteCity = async (city) => {
  if (!confirm(`Удалить город \"${city.name}\"?`)) return;
  try {
    await api.delete(`/api/cities/admin/${city.id}`);
    showSuccessNotification("Город удален");
    await loadCities();
  } catch (error) {
    devError("Ошибка удаления города:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка удаления города");
  }
};

onMounted(async () => {
  if (shouldRestore.value) {
    const context = restoreContext();
    if (context) {
      if (context.page) page.value = context.page;
      if (context.pageSize) pageSize.value = context.pageSize;
      await loadCities({ preservePage: true });
      restoreScroll(context.scroll);
      return;
    }
  }
  await loadCities();
});
</script>
