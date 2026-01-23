<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Системные настройки</CardTitle>
        <CardDescription>Включение и отключение ключевых модулей</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Изменения применяются сразу после сохранения. Отключенные модули скрываются в клиентском интерфейсе.
        </div>
      </CardContent>
    </Card>

    <Tabs v-model="activeTab" :tabs="tabs">
      <div v-if="activeTab === 0" class="space-y-6">
        <Card v-if="groupedModuleSettings.length">
          <CardHeader>
            <CardTitle>Модули</CardTitle>
            <CardDescription>Управление состоянием сервисных блоков</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="space-y-6">
              <div v-for="group in groupedModuleSettings" :key="group.name" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-3">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-background px-4 py-3"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-40">
                      <Select v-if="item.type === 'boolean' || typeof form[item.key] === 'boolean'" v-model="form[item.key]">
                        <option :value="true">Включено</option>
                        <option :value="false">Выключено</option>
                      </Select>
                      <Input v-else-if="item.type === 'string'" v-model="form[item.key]" type="text" />
                      <Input
                        v-else
                        v-model.number="form[item.key]"
                        type="number"
                        step="1"
                        min="0"
                        @change="normalizeInteger(item.key)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки не найдены</CardContent>
        </Card>

        <div class="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" :disabled="loading || saving" @click="loadSettings">
            <RefreshCcw :size="16" />
            Сбросить
          </Button>
          <Button :disabled="loading || saving" @click="saveSettings">
            <Save :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </div>
      </div>

      <div v-else-if="activeTab === 1" class="space-y-6">
        <Card v-if="groupedLoyaltySettings.length">
          <CardHeader>
            <CardTitle>Лояльность</CardTitle>
            <CardDescription>Настройка уровней, начисления и списания бонусов</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="space-y-6">
              <div v-for="group in groupedLoyaltySettings" :key="group.name" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-3">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-background px-4 py-3"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-40">
                      <Select v-if="item.type === 'boolean' || typeof form[item.key] === 'boolean'" v-model="form[item.key]">
                        <option :value="true">Включено</option>
                        <option :value="false">Выключено</option>
                      </Select>
                      <Input v-else-if="item.type === 'string'" v-model="form[item.key]" type="text" />
                      <Input
                        v-else
                        v-model.number="form[item.key]"
                        type="number"
                        step="1"
                        min="0"
                        :max="getMaxValue(item.key)"
                        @change="normalizeInteger(item.key)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки лояльности не найдены</CardContent>
        </Card>

        <div class="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" :disabled="loading || saving" @click="loadSettings">
            <RefreshCcw :size="16" />
            Сбросить
          </Button>
          <Button :disabled="loading || saving" @click="saveSettings">
            <Save :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </div>
      </div>

      <div v-else class="space-y-6">
        <Card>
          <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Причины стоп-листа</CardTitle>
              <CardDescription>Настройка причин, по которым позиции скрываются</CardDescription>
            </div>
            <Button @click="openModal()">
              <Plus :size="16" />
              Добавить причину
            </Button>
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
                    <Badge
                      variant="secondary"
                      :class="reason.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                    >
                      {{ reason.is_active ? "Активна" : "Скрыта" }}
                    </Badge>
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
      </div>
    </Tabs>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitReason">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="formReason.name" required />
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</label>
            <Input v-model.number="formReason.sort_order" type="number" placeholder="0 = автоматически" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="formReason.is_active">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </Select>
          </div>
        </div>
        <Button class="w-full" type="submit" :disabled="savingReason">
          <Save :size="16" />
          {{ savingReason ? "Сохранение..." : "Сохранить" }}
        </Button>
      </form>
    </BaseModal>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-vue-next";
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
import Tabs from "../components/ui/Tabs.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatNumber } from "../utils/format.js";

const items = ref([]);
const form = ref({});
const loading = ref(false);
const saving = ref(false);
const reasons = ref([]);
const tabs = ["Модули", "Лояльность", "Причины стоп-листа"];
const activeTab = ref(0);
const showModal = ref(false);
const editing = ref(null);
const savingReason = ref(false);
const formReason = ref({
  name: "",
  sort_order: 0,
  is_active: true,
});
const { showErrorNotification, showSuccessNotification } = useNotifications();

const modalTitle = computed(() => (editing.value ? "Редактировать причину" : "Новая причина"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры" : "Создайте причину стоп-листа"));
const percentKeys = new Set([
  "bonus_max_redeem_percent",
  "loyalty_level_1_redeem_percent",
  "loyalty_level_2_redeem_percent",
  "loyalty_level_3_redeem_percent",
  "loyalty_level_1_rate",
  "loyalty_level_2_rate",
  "loyalty_level_3_rate",
]);

const groupSettings = (list) => {
  const groups = new Map();
  for (const item of list) {
    const groupName = item.group || "Общее";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(item);
  }
  return Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
};

const moduleSettings = computed(() => items.value.filter((item) => item.group !== "Лояльность"));
const loyaltySettings = computed(() => items.value.filter((item) => item.group === "Лояльность"));
const groupedModuleSettings = computed(() => groupSettings(moduleSettings.value));
const groupedLoyaltySettings = computed(() => groupSettings(loyaltySettings.value));

const normalizeInteger = (key) => {
  const value = form.value[key];
  if (!Number.isFinite(value)) return;
  form.value[key] = Math.round(value);
};

const getMaxValue = (key) => {
  if (percentKeys.has(key)) return 100;
  return null;
};

const toFormValue = (item) => {
  if (item.type === "number" && percentKeys.has(item.key)) {
    return Number.isFinite(item.value) ? Math.round(item.value * 100) : 0;
  }
  return item.value;
};

const hydrateForm = () => {
  form.value = items.value.reduce((acc, item) => {
    acc[item.key] = toFormValue(item);
    return acc;
  }, {});
};

const loadSettings = async () => {
  loading.value = true;
  try {
    const response = await api.get("/api/settings/admin");
    items.value = response.data.items || [];
    hydrateForm();
  } catch (error) {
    console.error("Failed to load settings:", error);
    showErrorNotification("Ошибка при загрузке настроек");
  } finally {
    loading.value = false;
  }
};

const saveSettings = async () => {
  saving.value = true;
  try {
    const payload = {};
    for (const [key, value] of Object.entries(form.value)) {
      if (percentKeys.has(key)) {
        payload[key] = Number.isFinite(value) ? value / 100 : value;
      } else {
        payload[key] = value;
      }
    }
    const response = await api.put("/api/settings/admin", { settings: payload });
    items.value = response.data.items || [];
    hydrateForm();
    showSuccessNotification("Настройки сохранены");
  } catch (error) {
    console.error("Failed to save settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек";
    showErrorNotification(message);
  } finally {
    saving.value = false;
  }
};

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
  formReason.value = reason
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
  savingReason.value = true;
  try {
    if (editing.value) {
      await api.put(`/api/menu/admin/stop-list-reasons/${editing.value.id}`, formReason.value);
    } else {
      await api.post("/api/menu/admin/stop-list-reasons", formReason.value);
    }
    showModal.value = false;
    await loadReasons();
  } catch (error) {
    console.error("Failed to save reason:", error);
    showErrorNotification(`Ошибка при сохранении причины: ${error.response?.data?.error || error.message}`);
  } finally {
    savingReason.value = false;
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

onMounted(async () => {
  await loadSettings();
  await loadReasons();
});
</script>
