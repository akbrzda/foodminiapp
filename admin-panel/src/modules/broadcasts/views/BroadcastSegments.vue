<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Сегменты" description="Сохраненные сегменты аудитории">
          <template #actions>
            <Badge variant="secondary">Всего: {{ segments.length }}</Badge>
            <Button @click="openModal()">
              <Plus :size="16" />
              Создать сегмент
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
              <TableHead>Название</TableHead>
              <TableHead>Описание</TableHead>
              <TableHead>Размер</TableHead>
              <TableHead>Обновлено</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="isLoading">
              <TableRow v-for="index in 6" :key="`loading-${index}`">
                <TableCell><Skeleton class="h-4 w-44" /></TableCell>
                <TableCell><Skeleton class="h-4 w-56" /></TableCell>
                <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="segment in paginatedSegments" :key="segment.id">
                <TableCell>
                  <div class="font-medium text-foreground">{{ segment.name }}</div>
                  <div class="text-xs text-muted-foreground">ID: {{ segment.id }}</div>
                </TableCell>
                <TableCell>{{ segment.description || "—" }}</TableCell>
                <TableCell>{{ formatNumber(segment.estimated_size || 0) }}</TableCell>
                <TableCell>{{ formatDateTime(segment.updated_at) || "—" }}</TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" @click="openModal(segment)">
                      <Pencil :size="16" />
                    </Button>
                    <Button variant="ghost" size="icon" @click="deleteSegment(segment)">
                      <Trash2 :size="16" class="text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow v-if="segments.length === 0">
                <TableCell colspan="5" class="py-8 text-center text-sm text-muted-foreground">Сегменты не найдены</TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <TablePagination :total="segments.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />

    <Dialog v-model:open="showModal">
      <DialogContent class="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="saveSegment">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
            <Input v-model="form.name" required />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</label>
            <Textarea v-model="form.description" rows="3" />
          </div>
          <SegmentBuilder v-model="segmentConfig" />
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" @click="calculate">Рассчитать аудиторию</Button>
            <span v-if="estimatedSize !== null" class="text-xs text-muted-foreground">Размер: {{ estimatedSize }}</span>
          </div>
          <DialogFooter class="gap-2">
            <Button type="button" variant="outline" @click="closeModal">Отмена</Button>
            <Button type="submit">
              <Save :size="16" />
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref, watch } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import SegmentBuilder from "../components/SegmentBuilder.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { formatDateTime, formatNumber } from "@/shared/utils/format.js";

const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("broadcast-segments");
const segments = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const showModal = ref(false);
const editing = ref(null);
const estimatedSize = ref(null);
const segmentConfig = ref({ operator: "AND", conditions: [] });
const form = ref({
  name: "",
  description: "",
});

const modalTitle = computed(() => (editing.value ? "Редактировать сегмент" : "Новый сегмент"));
const modalSubtitle = computed(() => (editing.value ? "Обновите параметры сегмента" : "Создайте сегмент аудитории"));
const paginatedSegments = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return segments.value.slice(start, start + pageSize.value);
});

const loadSegments = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const response = await api.get("/api/broadcasts/segments");
    segments.value = response.data?.data?.items || [];
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Ошибка загрузки сегментов:", error);
    showErrorNotification("Не удалось загрузить сегменты");
  } finally {
    isLoading.value = false;
  }
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const openModal = (segment = null) => {
  editing.value = segment;
  estimatedSize.value = null;
  if (segment) {
    form.value = {
      name: segment.name,
      description: segment.description || "",
    };
    segmentConfig.value = segment.config || { operator: "AND", conditions: [] };
  } else {
    form.value = {
      name: "",
      description: "",
    };
    segmentConfig.value = { operator: "AND", conditions: [] };
  }
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editing.value = null;
  estimatedSize.value = null;
};

const calculate = async () => {
  try {
    if (!segmentConfig.value?.conditions?.length) {
      showWarningNotification("Добавьте условия сегментации");
      return;
    }
    const response = await api.post("/api/broadcasts/segments/calculate", { config: segmentConfig.value });
    estimatedSize.value = response.data?.data?.estimated_size || 0;
  } catch (error) {
    devError("Ошибка расчета сегмента:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось рассчитать аудиторию");
  }
};

const saveSegment = async () => {
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description,
      config: segmentConfig.value,
    };
    if (!payload.name) {
      showWarningNotification("Укажите название сегмента");
      return;
    }
    if (!payload.config?.conditions?.length) {
      showWarningNotification("Добавьте условия сегментации");
      return;
    }
    if (editing.value) {
      await api.put(`/api/broadcasts/segments/${editing.value.id}`, payload);
    } else {
      await api.post("/api/broadcasts/segments", payload);
    }
    showSuccessNotification("Сегмент сохранен");
    closeModal();
    await loadSegments();
  } catch (error) {
    devError("Ошибка сохранения сегмента:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сохранить сегмент");
  }
};

const deleteSegment = async (segment) => {
  if (!confirm(`Удалить сегмент "${segment.name}"?`)) return;
  try {
    await api.delete(`/api/broadcasts/segments/${segment.id}`);
    await loadSegments();
  } catch (error) {
    devError("Ошибка удаления сегмента:", error);
    showErrorNotification("Не удалось удалить сегмент");
  }
};

onMounted(async () => {
  if (shouldRestore.value) {
    const context = restoreContext();
    if (context) {
      if (context.page) page.value = context.page;
      if (context.pageSize) pageSize.value = context.pageSize;
      await loadSegments({ preservePage: true });
      restoreScroll(context.scroll);
      return;
    }
  }
  await loadSegments();
});
watch(
  () => [page.value, pageSize.value],
  () => {
    saveContext({}, { page: page.value, pageSize: pageSize.value });
  },
);
</script>
