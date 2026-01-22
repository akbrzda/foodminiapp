<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Настройки меню</CardTitle>
          <CardDescription>Причины для стоп-листа и другие параметры</CardDescription>
        </div>
        <Button @click="openModal()">
          <Plus :size="16" />
          Добавить причину
        </Button>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Причины стоп-листа</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table v-if="reasons.length > 0">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Порядок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="reason in reasons" :key="reason.id">
              <TableCell>{{ reason.name }}</TableCell>
              <TableCell>{{ formatNumber(reason.sort_order || 0) }}</TableCell>
              <TableCell>
                <Badge :variant="reason.is_active ? 'success' : 'secondary'">{{ reason.is_active ? "Активна" : "Скрыта" }}</Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(reason)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteReason(reason)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div v-else class="py-8 text-center text-sm text-muted-foreground">Причины не добавлены</div>
      </CardContent>
    </Card>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitReason">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="form.name" required />
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</label>
            <Input v-model.number="form.sort_order" type="number" placeholder="0 = автоматически" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="form.is_active">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </Select>
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
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
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
import { useNotifications } from "../composables/useNotifications.js";
import { formatNumber } from "../utils/format.js";

const reasons = ref([]);
const { showErrorNotification } = useNotifications();
const showModal = ref(false);
const editing = ref(null);
const saving = ref(false);

const form = ref({
  name: "",
  sort_order: 0,
  is_active: true,
});

const modalTitle = computed(() => (editing.value ? "Редактировать причину" : "Новая причина"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры" : "Создайте причину стоп-листа"));

const loadReasons = async () => {
  try {
    const response = await api.get("/api/menu/admin/stop-list-reasons");
    reasons.value = response.data.reasons || [];
  } catch (error) {
    console.error("Failed to load reasons:", error);
    showErrorNotification("Ошибка при загрузке причин");
  }
};

const openModal = (reason = null) => {
  editing.value = reason;
  form.value = reason
    ? {
        name: reason.name,
        sort_order: reason.sort_order || 0,
        is_active: reason.is_active,
      }
    : {
        name: "",
        sort_order: 0,
        is_active: true,
      };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitReason = async () => {
  saving.value = true;
  try {
    if (editing.value) {
      await api.put(`/api/menu/admin/stop-list-reasons/${editing.value.id}`, form.value);
    } else {
      await api.post("/api/menu/admin/stop-list-reasons", form.value);
    }
    showModal.value = false;
    await loadReasons();
  } catch (error) {
    console.error("Failed to save reason:", error);
    showErrorNotification(`Ошибка при сохранении причины: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};

const deleteReason = async (reason) => {
  if (!confirm(`Удалить причину "${reason.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/stop-list-reasons/${reason.id}`);
    await loadReasons();
  } catch (error) {
    console.error("Failed to delete reason:", error);
    showErrorNotification(`Ошибка при удалении причины: ${error.response?.data?.error || error.message}`);
  }
};

onMounted(loadReasons);
</script>
