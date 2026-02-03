<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Системные настройки" description="Включение и отключение ключевых модулей и их настройка">
          <template #actions>
            <div v-if="activeTab === 0" class="flex flex-wrap items-center gap-3">
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving" @click="loadModuleSettings">
                <Spinner v-if="moduleLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button :disabled="moduleLoading || moduleSaving" @click="saveModuleSettings">
                <Spinner v-if="moduleSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ moduleSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Tabs v-model="activeTab">
      <TabsList>
        <TabsTrigger v-for="(tab, index) in tabs" :key="tab" :value="index">{{ tab }}</TabsTrigger>
      </TabsList>
      <TabsContent :value="0" class="space-y-6">
        <Card v-if="moduleGroups.length">
          <CardHeader>
            <CardTitle>Модули</CardTitle>
            <CardDescription>Управление состоянием сервисных блоков</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="space-y-6">
              <div v-for="group in moduleGroups" :key="group.name" class="space-y-4">
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
                      <Select v-if="item.type === 'boolean' || typeof moduleForm[item.key] === 'boolean'" v-model="moduleForm[item.key]">
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите статус" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem :value="true">Включено</SelectItem>
                          <SelectItem :value="false">Выключено</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input v-else-if="item.type === 'string'" v-model="moduleForm[item.key]" type="text" />
                      <Input
                        v-else
                        v-model.number="moduleForm[item.key]"
                        type="number"
                        step="1"
                        min="0"
                        @change="normalizeInteger(moduleForm, item.key)"
                      />
                    </div>
                  </div>
                  <div
                    v-if="group.name === 'Лояльность'"
                    class="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
                  >
                    Параметры начисления и уровней фиксированы: 3 уровня (Бронза, Серебро, Золото), начисление 3/5/7% и максимум списания 25%.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки не найдены</CardContent>
        </Card>
      </TabsContent>

      <TabsContent :value="1" class="space-y-6">
        <Card>
          <CardContent class="!p-0">
            <div class="flex flex-col gap-2 border-b border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div class="text-sm font-semibold text-foreground">Причины стоп-листа</div>
                <div class="text-xs text-muted-foreground">Настройка причин, по которым позиции скрываются</div>
              </div>
              <Button @click="openModal()">
                <Plus :size="16" />
                Добавить причину
              </Button>
            </div>
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
                      :class="
                        reason.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'
                      "
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
      </TabsContent>
    </Tabs>

    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitReason">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="formReason.name" required />
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</FieldLabel>
                <FieldContent>
                  <Input v-model.number="formReason.sort_order" type="number" placeholder="0 = автоматически" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="formReason.is_active">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Активна</SelectItem>
                      <SelectItem :value="false">Скрыта</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldGroup>
          <Button class="w-full" type="submit" :disabled="savingReason">
            <Spinner v-if="savingReason" class="h-4 w-4" />
            <Save v-else :size="16" />
            {{ savingReason ? "Сохранение..." : "Сохранить" }}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Spinner from "@/shared/components/ui/spinner/Spinner.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatNumber, normalizeBoolean } from "@/shared/utils/format.js";

const moduleItems = ref([]);
const moduleForm = ref({});
const moduleLoading = ref(false);
const moduleSaving = ref(false);
const reasons = ref([]);
const tabs = ["Модули", "Причины стоп-листа"];
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
const percentKeys = new Set();

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

const groupedModuleSettings = computed(() => groupSettings(moduleItems.value));
const moduleGroups = computed(() => groupedModuleSettings.value);

const normalizeInteger = (targetForm, key) => {
  const value = targetForm.value[key];
  if (!Number.isFinite(value)) return;
  targetForm.value[key] = Math.round(value);
};

const toFormValue = (item) => {
  if (item.type === "number" && percentKeys.has(item.key)) {
    return Number.isFinite(item.value) ? Math.round(item.value * 100) : 0;
  }
  return item.value;
};

const hydrateForm = (list, targetForm) => {
  targetForm.value = list.reduce((acc, item) => {
    acc[item.key] = toFormValue(item);
    return acc;
  }, {});
};

const loadModuleSettings = async () => {
  moduleLoading.value = true;
  try {
    const response = await api.get("/api/settings/admin");
    moduleItems.value = response.data.items || [];
    hydrateForm(moduleItems.value, moduleForm);
  } catch (error) {
    console.error("Failed to load settings:", error);
    showErrorNotification("Ошибка при загрузке настроек");
  } finally {
    moduleLoading.value = false;
  }
};

const saveModuleSettings = async () => {
  moduleSaving.value = true;
  try {
    const payload = {};
    for (const [key, value] of Object.entries(moduleForm.value)) {
      if (percentKeys.has(key)) {
        payload[key] = Number.isFinite(value) ? value / 100 : value;
      } else {
        payload[key] = value;
      }
    }
    const response = await api.put("/api/settings/admin", { settings: payload });
    moduleItems.value = response.data.items || [];
    hydrateForm(moduleItems.value, moduleForm);
    showSuccessNotification("Настройки сохранены");
  } catch (error) {
    console.error("Failed to save settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек";
    showErrorNotification(message);
  } finally {
    moduleSaving.value = false;
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
        is_active: normalizeBoolean(reason.is_active, true),
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
  try {
    await loadModuleSettings();
    await loadReasons();
  } catch (error) {
    console.error("Ошибка загрузки настроек системы:", error);
    showErrorNotification("Ошибка загрузки настроек системы");
  }
});
</script>
