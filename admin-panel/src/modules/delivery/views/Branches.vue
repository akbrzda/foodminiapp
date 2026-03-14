<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader title="Филиалы" description="Список филиалов и настройки времени приготовления">
          <template #actions>
            <Badge variant="secondary">Всего: {{ branches.length }}</Badge>
            <Button v-if="canManageBranches" class="w-full md:w-auto" :disabled="!cityId" @click="goToCreate">
              <Plus :size="16" />
              Добавить филиал
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <BaseFilters v-model="filtersModel" :fields="filterFields" :show-reset="false" :with-card="false" />
      </CardContent>
    </Card>
    <Card v-if="cityId">
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-3 w-40" />
              <Skeleton class="h-5 w-20" />
            </div>
          </template>
          <template v-else>
            <div v-for="branch in paginatedBranches" :key="`mobile-${branch.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="font-medium text-foreground">{{ branch.name }}</div>
              <div class="text-xs text-muted-foreground">{{ branch.address || "—" }}</div>
              <div class="mt-2 text-sm">
                <a v-if="normalizePhone(branch.phone)" class="hover:underline" :href="`tel:${normalizePhone(branch.phone)}`">
                  {{ formatPhone(branch.phone) }}
                </a>
                <span v-else class="text-muted-foreground">—</span>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ branch.latitude && branch.longitude ? `${branch.latitude}, ${branch.longitude}` : "Координаты не указаны" }}
              </div>
              <div class="mt-2 text-xs text-muted-foreground">
                Приготовление: {{ formatTimeValue(branch.prep_time) }}, Сборка: {{ formatTimeValue(branch.assembly_time) }}
              </div>
              <div class="mt-2">
                <Badge
                  variant="secondary"
                  :class="branch.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ branch.is_active ? "Активен" : "Неактивен" }}
                </Badge>
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <template v-if="canManageBranches">
                  <Button variant="ghost" size="icon" @click="goToEdit(branch)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteBranch(branch)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </template>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </div>
            </div>
            <div v-if="branches.length === 0" class="py-8 text-center text-sm text-muted-foreground">Филиалы не найдены</div>
          </template>
        </div>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Филиал</TableHead>
                <TableHead>Контакты</TableHead>
                <TableHead>Время</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 6" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="branch in paginatedBranches" :key="branch.id">
                  <TableCell>
                    <div class="font-medium text-foreground">{{ branch.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ branch.address || "—" }}</div>
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone :size="14" />
                      <a v-if="normalizePhone(branch.phone)" class="text-foreground hover:underline" :href="`tel:${normalizePhone(branch.phone)}`">
                        {{ formatPhone(branch.phone) }}
                      </a>
                      <span v-else>—</span>
                    </div>
                    <div v-if="branch.latitude && branch.longitude" class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin :size="14" />
                      {{ branch.latitude }}, {{ branch.longitude }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="text-xs text-muted-foreground">Приготовление: {{ formatTimeValue(branch.prep_time) }}</div>
                    <div class="text-xs text-muted-foreground">Сборка: {{ formatTimeValue(branch.assembly_time) }}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      :class="
                        branch.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'
                      "
                    >
                      {{ branch.is_active ? "Активен" : "Неактивен" }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-right">
                    <div v-if="canManageBranches" class="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" @click="goToEdit(branch)">
                        <Pencil :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="deleteBranch(branch)">
                        <Trash2 :size="16" class="text-red-600" />
                      </Button>
                    </div>
                    <span v-else class="text-xs text-muted-foreground">—</span>
                  </TableCell>
                </TableRow>
                <TableRow v-if="branches.length === 0">
                  <TableCell colspan="5" class="py-8 text-center text-sm text-muted-foreground">Филиалы не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <TablePagination
      v-if="cityId"
      :total="branches.length"
      :page="page"
      :page-size="pageSize"
      @update:page="page = $event"
      @update:page-size="onPageSizeChange"
    />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref, watch } from "vue";
import { MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BaseFilters from "@/shared/components/filters/BaseFilters.vue";
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
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { formatPhone, normalizePhone } from "@/shared/utils/format.js";

const router = useRouter();
const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();

// Навигационный контекст
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("branches");

const cityId = ref("");
const branches = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const canManageBranches = computed(() => authStore.hasPermission("locations.branches.manage"));
const filtersModel = computed({
  get: () => ({ cityId: cityId.value }),
  set: (value) => {
    cityId.value = value?.cityId || "";
  },
});
const filterFields = computed(() => [
  {
    key: "cityId",
    label: "Город",
    placeholder: "Выберите город",
    type: "select",
    defaultValue: "",
    options: referenceStore.cities.map((city) => ({
      value: String(city.id),
      label: city.name,
    })),
  },
]);
const paginatedBranches = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return branches.value.slice(start, start + pageSize.value);
});
let branchesRequestId = 0;

const loadBranches = async ({ preservePage = false } = {}) => {
  if (!cityId.value) {
    isLoading.value = false;
    branches.value = [];
    return;
  }
  const requestId = ++branchesRequestId;
  isLoading.value = true;
  try {
    const response = await api.get(`/api/cities/${cityId.value}/branches`);
    if (requestId === branchesRequestId) {
      branches.value = response.data.branches || [];
      if (!preservePage) {
        page.value = 1;
      }
    }
  } catch (error) {
    devError("Ошибка загрузки филиалов:", error);
    if (requestId === branchesRequestId) {
      branches.value = [];
    }
  } finally {
    if (requestId === branchesRequestId) {
      isLoading.value = false;
    }
  }
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const formatTimeValue = (value) => {
  const time = Number(value || 0);
  if (!time) return "—";
  return `${time} мин`;
};

const goToCreate = () => {
  if (!cityId.value) return;
  saveContext({ cityId: cityId.value }, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "branch-new", query: { cityId: String(cityId.value) } });
};

const goToEdit = (branch) => {
  if (!cityId.value) return;
  saveContext({ cityId: cityId.value }, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "branch-edit", params: { id: branch.id }, query: { cityId: String(cityId.value) } });
};

const deleteBranch = async (branch) => {
  if (!confirm(`Удалить филиал \"${branch.name}\"?`)) return;
  try {
    await api.delete(`/api/cities/admin/${cityId.value}/branches/${branch.id}`);
    showSuccessNotification("Филиал удален");
    await loadBranches();
  } catch (error) {
    devError("Ошибка удаления филиала:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка удаления филиала");
  }
};

onMounted(async () => {
  await referenceStore.loadCities();

  if (shouldRestore.value) {
    const context = restoreContext();

    if (context) {
      if (context.filters?.cityId) cityId.value = context.filters.cityId;
      if (context.page) page.value = context.page;
      if (context.pageSize) pageSize.value = context.pageSize;

      // loadBranches будет вызван автоматически через watch(cityId)
      if (cityId.value) {
        await loadBranches({ preservePage: true });
        restoreScroll(context.scroll);
      }
      return;
    }
  }

  if (cityId.value) {
    await loadBranches();
  }
});
watch(
  () => cityId.value,
  async (next, prev) => {
    if (next === prev) return;
    await loadBranches();
  },
);
</script>
