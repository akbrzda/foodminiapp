<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Стоп-лист</CardTitle>
          <CardDescription>Управление временно недоступными позициями по филиалам</CardDescription>
        </div>
        <Button @click="openModal()">
          <Plus :size="16" />
          Добавить
        </Button>
      </CardHeader>
      <CardContent class="pt-0">
        <div v-if="stopList.length === 0" class="py-8 text-center text-sm text-muted-foreground">Стоп-лист пуст</div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Филиал</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Добавлено</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in stopList" :key="item.id">
              <TableCell>
                <div class="text-sm font-medium">{{ getBranchName(item.branch_id) }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="item.entity_type === 'item' ? 'default' : item.entity_type === 'variant' ? 'secondary' : 'outline'">
                  {{ item.entity_type === "item" ? "Позиция" : item.entity_type === "variant" ? "Вариант" : "Модификатор" }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="text-sm font-medium text-foreground">{{ item.entity_name }}</div>
              </TableCell>
              <TableCell>
                <div class="text-xs text-muted-foreground">{{ item.reason || "—" }}</div>
              </TableCell>
              <TableCell>
                <div class="text-xs text-muted-foreground">{{ formatDate(item.created_at) }}</div>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="icon" @click="removeFromStopList(item)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <BaseModal v-if="showModal" title="Добавить в стоп-лист" subtitle="Временно сделать позицию недоступной" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitStopList">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиал *</label>
          <Select v-model="form.branch_id" required>
            <option value="">Выберите филиал</option>
            <option v-for="branch in referenceStore.branches" :key="branch.id" :value="branch.id">{{ branch.name }}</option>
          </Select>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип *</label>
          <Select v-model="form.entity_type" @change="loadEntities" required>
            <option value="">Выберите тип</option>
            <option value="item">Позиция меню</option>
            <option value="variant">Вариант позиции</option>
            <option value="modifier">Модификатор</option>
          </Select>
        </div>

        <div v-if="form.entity_type" class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {{ form.entity_type === "item" ? "Позиция" : form.entity_type === "variant" ? "Вариант" : "Модификатор" }} *
          </label>
          <Select v-model="form.entity_id" required>
            <option value="">Выберите</option>
            <option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.name }}</option>
          </Select>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина</label>
          <Select v-model="form.reason">
            <option value="">Без причины</option>
            <option v-for="reason in reasons" :key="reason.id" :value="reason.name">{{ reason.name }}</option>
          </Select>
        </div>

        <Button class="w-full" type="submit" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Добавление..." : "Добавить в стоп-лист" }}
        </Button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatDate } from "../utils/date.js";
import { useReferenceStore } from "../stores/reference.js";

const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();

const stopList = ref([]);
const entities = ref([]);
const reasons = ref([]);
const showModal = ref(false);
const saving = ref(false);

const form = ref({
  branch_id: "",
  entity_type: "",
  entity_id: "",
  reason: "",
});

const getBranchName = (branchId) => {
  return referenceStore.branches.find((b) => b.id === branchId)?.name || "Неизвестно";
};

const loadStopList = async () => {
  try {
    const response = await api.get("/api/menu/admin/stop-list");
    stopList.value = response.data.items || [];
  } catch (error) {
    console.error("Failed to load stop list:", error);
    showErrorNotification("Ошибка при загрузке стоп-листа");
  }
};

const loadReasons = async () => {
  try {
    const response = await api.get("/api/menu/admin/stop-list-reasons");
    reasons.value = (response.data.reasons || []).filter((reason) => reason.is_active);
  } catch (error) {
    console.error("Failed to load reasons:", error);
    reasons.value = [];
  }
};

const loadEntities = async () => {
  if (!form.value.entity_type) return;
  try {
    let endpoint = "";
    if (form.value.entity_type === "item") {
      endpoint = "/api/menu/admin/items";
    } else if (form.value.entity_type === "variant") {
      endpoint = "/api/menu/admin/variants";
    } else if (form.value.entity_type === "modifier") {
      endpoint = "/api/menu/admin/modifiers";
    }
    const response = await api.get(endpoint);
    entities.value = response.data.items || response.data.variants || response.data.modifiers || [];
  } catch (error) {
    console.error("Failed to load entities:", error);
    entities.value = [];
  }
};

const openModal = () => {
  form.value = { branch_id: "", entity_type: "", entity_id: "", reason: "" };
  entities.value = [];
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitStopList = async () => {
  saving.value = true;
  try {
    await api.post("/api/menu/admin/stop-list", form.value);
    showModal.value = false;
    await loadStopList();
  } catch (error) {
    console.error("Failed to add to stop list:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};

const removeFromStopList = async (item) => {
  if (!confirm(`Удалить "${item.entity_name}" из стоп-листа?`)) return;
  try {
    await api.delete(`/api/menu/admin/stop-list/${item.id}`);
    await loadStopList();
  } catch (error) {
    console.error("Failed to remove from stop list:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  }
};

onMounted(async () => {
  await referenceStore.fetchCitiesAndBranches();
  await loadReasons();
  await loadStopList();
});
</script>
