import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Филиалы" description="Управление филиалами и временем приготовления">
          <template #actions>
            <Badge variant="secondary">Всего: {{ branches.length }}</Badge>
            <Button v-if="!isManager" class="w-full md:w-auto" :disabled="!cityId" @click="goToCreate">
              <Plus :size="16" />
              Добавить филиал
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[220px]">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
              <FieldContent>
                <Select v-model="cityId" @update:modelValue="loadBranches">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите город" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                      {{ city.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card v-if="cityId">
      <CardContent class="!p-0">
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
            <TableRow v-for="branch in paginatedBranches" :key="branch.id">
              <TableCell>
                <div class="font-medium text-foreground">{{ branch.name }}</div>
                <div class="text-xs text-muted-foreground">{{ branch.address || "—" }}</div>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone :size="14" />
                  <a
                    v-if="normalizePhone(branch.phone)"
                    class="text-foreground hover:underline"
                    :href="`tel:${normalizePhone(branch.phone)}`"
                  >
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
                <div v-if="!isManager" class="flex justify-end gap-2">
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
          </TableBody>
        </Table>
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
import { computed, onMounted, ref } from "vue";
import { MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { formatPhone, normalizePhone } from "@/shared/utils/format.js";

const router = useRouter();
const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();

const cityId = ref("");
const branches = ref([]);
const page = ref(1);
const pageSize = ref(20);
const isManager = computed(() => authStore.role === "manager");
const paginatedBranches = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return branches.value.slice(start, start + pageSize.value);
});
let branchesRequestId = 0;

const loadBranches = async () => {
  if (!cityId.value) {
    branches.value = [];
    return;
  }
  const requestId = ++branchesRequestId;
  try {
    const response = await api.get(`/api/cities/${cityId.value}/branches`);
    if (requestId === branchesRequestId) {
      branches.value = response.data.branches || [];
      page.value = 1;
    }
  } catch (error) {
    devError("Ошибка загрузки филиалов:", error);
    if (requestId === branchesRequestId) {
      branches.value = [];
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
  router.push({ name: "branch-new", query: { cityId: String(cityId.value) } });
};

const goToEdit = (branch) => {
  if (!cityId.value) return;
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

onMounted(() => {
  referenceStore.loadCities();
});
</script>
