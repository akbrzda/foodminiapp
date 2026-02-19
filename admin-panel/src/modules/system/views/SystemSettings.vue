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
            <div v-else-if="activeTab === 2" class="flex flex-wrap items-center gap-3">
              <Button variant="secondary" :disabled="telegramLoading || telegramSaving || telegramTesting" @click="loadTelegramSettings">
                <Spinner v-if="telegramLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button variant="secondary" :disabled="telegramLoading || telegramSaving || telegramTesting" @click="sendTelegramStartTest">
                <Spinner v-if="telegramTesting" class="h-4 w-4" />
                <SendHorizontal v-else :size="16" />
                {{ telegramTesting ? "Отправка..." : "Тест" }}
              </Button>
              <Button :disabled="telegramLoading || telegramSaving || telegramTesting" @click="saveTelegramSettings">
                <Spinner v-if="telegramSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ telegramSaving ? "Сохранение..." : "Сохранить" }}
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
        <Card v-if="moduleLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-56" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
          </CardContent>
        </Card>
        <Card v-else-if="moduleGroups.length">
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
                    Параметры начисления и уровней фиксированы: 3 уровня (Бронза, Серебро, Золото), начисление 3/5/7% и максимум списания 20%.
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
            <Table v-if="reasonsLoading || reasons.length > 0">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Порядок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-if="reasonsLoading">
                  <TableRow v-for="index in 5" :key="`reasons-loading-${index}`">
                    <TableCell><Skeleton class="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                    <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                  </TableRow>
                </template>
                <template v-else>
                  <TableRow v-for="reason in reasons" :key="reason.id">
                    <TableCell>{{ reason.name }}</TableCell>
                    <TableCell>{{ formatNumber(reason.sort_order || 0) }}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        :class="
                          reason.is_active
                            ? 'bg-emerald-100 text-emerald-700 border-transparent'
                            : 'bg-muted text-muted-foreground border-transparent'
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
                </template>
              </TableBody>
            </Table>
            <div v-else class="py-8 text-center text-sm text-muted-foreground">Причины не добавлены</div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent :value="2" class="space-y-6">
        <Card v-if="telegramLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-40 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-24 w-full" />
          </CardContent>
        </Card>

        <Card v-else>
          <CardHeader>
            <CardTitle>Приветствие команды /start</CardTitle>
            <CardDescription>Настройка текста, изображения и кнопки в Telegram-боте</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6 pt-0">
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="telegramForm.enabled">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Включено</SelectItem>
                      <SelectItem :value="false">Выключено</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telegram ID для теста</FieldLabel>
                <FieldContent>
                  <Input v-model="telegramTestId" type="number" placeholder="123456789" />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текст сообщения</FieldLabel>
              <FieldContent>
                <Textarea
                  v-model="telegramForm.text"
                  rows="6"
                  maxlength="4096"
                  placeholder="Введите приветственный текст для команды /start"
                />
              </FieldContent>
            </Field>

            <FieldGroup class="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение</FieldLabel>
                <FieldContent>
                  <input ref="telegramFileInput" type="file" accept="image/*" class="hidden" @change="onTelegramFileChange" />
                  <div
                    class="flex min-h-24 flex-col items-start justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-3"
                  >
                    <div class="text-xs text-muted-foreground">JPG/PNG/WebP, до 10MB</div>
                    <div v-if="telegramUploadState.error" class="text-xs text-red-600">{{ telegramUploadState.error }}</div>
                    <div v-if="telegramUploadState.loading" class="text-xs text-muted-foreground">Загрузка...</div>
                    <div v-if="telegramUploadState.preview || telegramForm.image_url" class="mt-3">
                      <img :src="telegramUploadState.preview || telegramForm.image_url" alt="preview" class="h-24 w-24 rounded-lg object-cover" />
                    </div>
                  </div>
                </FieldContent>
              </Field>
              <div class="flex w-full gap-2 md:w-auto">
                <Button type="button" variant="outline" class="w-full md:w-auto" @click="triggerTelegramFileInput">
                  <ImagePlus :size="16" />
                  Загрузить
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  class="w-full md:w-auto"
                  :disabled="!telegramForm.image_url && !telegramUploadState.preview"
                  @click="clearTelegramImage"
                >
                  <X :size="16" />
                  Удалить
                </Button>
              </div>
            </FieldGroup>

            <FieldGroup class="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип кнопки</FieldLabel>
                <FieldContent>
                  <Select v-model="telegramForm.button_type">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="web_app">Web App</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текст кнопки</FieldLabel>
                <FieldContent>
                  <Input v-model="telegramForm.button_text" type="text" maxlength="64" placeholder="Открыть меню" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ссылка кнопки</FieldLabel>
                <FieldContent>
                  <Input v-model="telegramForm.button_url" type="url" placeholder="https://..." />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Card class="border-dashed">
              <CardHeader>
                <CardTitle class="text-sm">Предпросмотр</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 pt-0">
                <img
                  v-if="telegramUploadState.preview || telegramForm.image_url"
                  :src="telegramUploadState.preview || telegramForm.image_url"
                  alt="preview"
                  class="max-h-64 w-full rounded-lg object-cover"
                />
                <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {{ telegramForm.text || "Текст приветствия не задан" }}
                </p>
                <Button
                  v-if="telegramForm.button_text && telegramForm.button_url"
                  type="button"
                  variant="secondary"
                  class="pointer-events-none"
                >
                  {{ telegramForm.button_text }}
                </Button>
              </CardContent>
            </Card>
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
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref } from "vue";
import { ImagePlus, Pencil, Plus, RefreshCcw, Save, SendHorizontal, Trash2, X } from "lucide-vue-next";
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
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
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
const reasonsLoading = ref(false);
const tabs = ["Модули", "Причины стоп-листа", "Telegram /start"];
const activeTab = ref(0);
const showModal = ref(false);
const editing = ref(null);
const savingReason = ref(false);
const telegramLoading = ref(false);
const telegramSaving = ref(false);
const telegramTesting = ref(false);
const telegramFileInput = ref(null);
const telegramTestId = ref("");
const telegramUploadState = ref({
  loading: false,
  error: null,
  preview: null,
});
const telegramForm = ref({
  enabled: true,
  text: "",
  image_url: "",
  button_type: "web_app",
  button_text: "",
  button_url: "",
});
const formReason = ref({
  name: "",
  sort_order: 0,
  is_active: true,
});
const { showErrorNotification, showSuccessNotification } = useNotifications();

const modalTitle = computed(() => (editing.value ? "Редактировать причину" : "Новая причина"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры" : "Создайте причину стоп-листа"));
const percentKeys = new Set();
const primitiveTypes = new Set(["boolean", "string", "number"]);

const normalizeTelegramForm = (value = {}) => {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const buttonType = String(config.button_type || "web_app").toLowerCase();
  return {
    enabled: config.enabled !== false,
    text: String(config.text || ""),
    image_url: String(config.image_url || ""),
    button_type: buttonType === "url" || buttonType === "web_app" ? buttonType : "web_app",
    button_text: String(config.button_text || ""),
    button_url: String(config.button_url || ""),
  };
};

const applySettingsResponse = (data) => {
  const settings = data?.settings || {};
  moduleItems.value = (data?.items || []).filter((item) => item.group !== "Интеграции" && primitiveTypes.has(item.type));
  hydrateForm(moduleItems.value, moduleForm);
  telegramForm.value = normalizeTelegramForm(settings.telegram_start_message);
  telegramUploadState.value = {
    loading: false,
    error: null,
    preview: telegramForm.value.image_url || null,
  };
};

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
    applySettingsResponse(response.data);
  } catch (error) {
    devError("Failed to load settings:", error);
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
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки сохранены");
  } catch (error) {
    devError("Failed to save settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек";
    showErrorNotification(message);
  } finally {
    moduleSaving.value = false;
  }
};

const loadTelegramSettings = async () => {
  telegramLoading.value = true;
  try {
    const response = await api.get("/api/settings/admin");
    applySettingsResponse(response.data);
  } catch (error) {
    devError("Failed to load telegram start settings:", error);
    showErrorNotification("Ошибка при загрузке настроек Telegram");
  } finally {
    telegramLoading.value = false;
  }
};

const saveTelegramSettings = async () => {
  telegramSaving.value = true;
  try {
    const payload = normalizeTelegramForm(telegramForm.value);
    const response = await api.put("/api/settings/admin", {
      settings: { telegram_start_message: payload },
    });
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки /start сохранены");
  } catch (error) {
    devError("Failed to save telegram start settings:", error);
    const message = error.response?.data?.errors?.telegram_start_message || error.response?.data?.errors?.settings || "Ошибка при сохранении /start";
    showErrorNotification(message);
  } finally {
    telegramSaving.value = false;
  }
};

const sendTelegramStartTest = async () => {
  const telegramId = Number(telegramTestId.value);
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    showErrorNotification("Укажите корректный Telegram ID для теста");
    return;
  }
  telegramTesting.value = true;
  try {
    await api.post("/api/settings/admin/telegram-start/test", { telegram_id: telegramId });
    showSuccessNotification("Тестовое сообщение отправлено");
  } catch (error) {
    devError("Failed to send telegram start test:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось отправить тест");
  } finally {
    telegramTesting.value = false;
  }
};

const loadReasons = async () => {
  reasonsLoading.value = true;
  try {
    const response = await api.get("/api/menu/admin/stop-list-reasons");
    reasons.value = response.data.reasons || [];
  } catch (error) {
    devError("Failed to load reasons:", error);
    showErrorNotification("Ошибка при загрузке причин");
  } finally {
    reasonsLoading.value = false;
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
    devError("Failed to save reason:", error);
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
    devError("Failed to delete reason:", error);
    showErrorNotification(`Ошибка при удалении причины: ${error.response?.data?.error || error.message}`);
  }
};

const triggerTelegramFileInput = () => {
  telegramFileInput.value?.click();
};

const onTelegramFileChange = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  void handleTelegramFile(file);
};

const handleTelegramFile = async (file) => {
  if (!file.type.startsWith("image/")) {
    telegramUploadState.value = { loading: false, error: "Нужен файл изображения", preview: null };
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    telegramUploadState.value = { loading: false, error: "Файл больше 10MB", preview: null };
    return;
  }

  telegramUploadState.value = { loading: true, error: null, preview: URL.createObjectURL(file) };
  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await api.post("/api/uploads/telegram-start/1", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = response.data?.data?.url || "";
    telegramForm.value.image_url = uploadedUrl;
    telegramUploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Ошибка загрузки изображения /start:", error);
    telegramUploadState.value = { loading: false, error: "Не удалось загрузить изображение", preview: null };
  }
};

const clearTelegramImage = () => {
  telegramForm.value.image_url = "";
  telegramUploadState.value = { loading: false, error: null, preview: null };
};

onMounted(async () => {
  try {
    await loadModuleSettings();
    await loadReasons();
  } catch (error) {
    devError("Ошибка загрузки настроек системы:", error);
    showErrorNotification("Ошибка загрузки настроек системы");
  }
});
</script>
