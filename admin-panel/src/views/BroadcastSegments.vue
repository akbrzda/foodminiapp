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
            <TableRow v-for="segment in segments" :key="segment.id">
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
          </TableBody>
        </Table>
      </CardContent>
    </Card>

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
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import Badge from "../components/ui/badge/Badge.vue";
import Button from "../components/ui/button/Button.vue";
import Card from "../components/ui/card/Card.vue";
import CardContent from "../components/ui/card/CardContent.vue";
import CardHeader from "../components/ui/card/CardHeader.vue";
import CardTitle from "../components/ui/card/CardTitle.vue";
import Input from "../components/ui/input/Input.vue";
import Textarea from "../components/ui/textarea/Textarea.vue";
import PageHeader from "../components/PageHeader.vue";
import Table from "../components/ui/table/Table.vue";
import TableBody from "../components/ui/table/TableBody.vue";
import TableCell from "../components/ui/table/TableCell.vue";
import TableHead from "../components/ui/table/TableHead.vue";
import TableHeader from "../components/ui/table/TableHeader.vue";
import TableRow from "../components/ui/table/TableRow.vue";
import SegmentBuilder from "../components/broadcasts/SegmentBuilder.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog/index.js";
import { useNotifications } from "../composables/useNotifications.js";
import { formatDateTime, formatNumber } from "../utils/format.js";

const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();
const segments = ref([]);
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

const loadSegments = async () => {
  try {
    const response = await api.get("/api/broadcasts/segments");
    segments.value = response.data?.data?.items || [];
  } catch (error) {
    console.error("Ошибка загрузки сегментов:", error);
    showErrorNotification("Не удалось загрузить сегменты");
  }
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
    console.error("Ошибка расчета сегмента:", error);
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
    console.error("Ошибка сохранения сегмента:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сохранить сегмент");
  }
};

const deleteSegment = async (segment) => {
  if (!confirm(`Удалить сегмент "${segment.name}"?`)) return;
  try {
    await api.delete(`/api/broadcasts/segments/${segment.id}`);
    await loadSegments();
  } catch (error) {
    console.error("Ошибка удаления сегмента:", error);
    showErrorNotification("Не удалось удалить сегмент");
  }
};

onMounted(loadSegments);
</script>
