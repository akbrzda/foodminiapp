import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="pageTitle" :description="pageSubtitle">
          <template #actions>
            <Button variant="secondary" @click="goBack">
              <ArrowLeft :size="16" />
              Назад
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Основные настройки</CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <FieldGroup>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
            <FieldContent>
              <Input v-model="form.name" placeholder="Возврат после 30 дней" required />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</FieldLabel>
            <FieldContent>
              <Textarea v-model="form.description" rows="3" placeholder="Короткое описание цели рассылки" />
            </FieldContent>
          </Field>
          <FieldGroup class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип</FieldLabel>
              <FieldContent>
                <Select v-model="form.type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Ручная</SelectItem>
                    <SelectItem value="trigger">Триггерная</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field v-if="isEditing">
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
              <FieldContent>
                <Badge variant="secondary">{{ statusLabel(form.status) }}</Badge>
              </FieldContent>
            </Field>
          </FieldGroup>
        </FieldGroup>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Сегментация аудитории</CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <Field>
          <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Сохраненный сегмент</FieldLabel>
          <FieldContent>
            <Select v-model="form.segment_id">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Не выбран" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Не выбран</SelectItem>
                <SelectItem v-for="segment in segments" :key="segment.id" :value="segment.id">{{ segment.name }}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <div class="rounded-xl border border-border/60 bg-muted/20 p-4">
          <SegmentBuilder v-model="segmentConfig" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" type="button" @click="calculateAudience">Рассчитать аудиторию</Button>
          <span v-if="estimatedSize !== null" class="text-xs text-muted-foreground">Примерный размер: {{ estimatedSize }}</span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Контент сообщения</CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <Field>
          <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текст сообщения</FieldLabel>
          <FieldContent>
            <Textarea
              ref="contentTextarea"
              v-model="form.content_text"
              rows="6"
              placeholder="Привет, {first_name}!"
              @click="updateCursor"
              @keyup="updateCursor"
              @focus="updateCursor"
            />
            <div class="mt-2 space-y-2">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Плейсхолдеры</div>
              <div class="flex flex-wrap gap-2">
                <Button
                  v-for="placeholder in placeholders"
                  :key="placeholder.value"
                  type="button"
                  size="sm"
                  variant="outline"
                  @click="insertPlaceholder(placeholder.value)"
                >
                  {{ placeholder.label }}
                </Button>
              </div>
            </div>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение</FieldLabel>
          <FieldContent>
            <div
              class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground"
              @dragover.prevent
              @drop.prevent="onDrop"
            >
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
              <Button type="button" variant="outline" size="sm" @click="triggerFile">
                <UploadCloud :size="16" />
                Загрузить изображение
              </Button>
              <span>или перетащите файл сюда</span>
              <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
              <span v-if="uploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
            </div>
            <div v-if="uploadState.preview || form.content_image_url" class="mt-3 flex flex-wrap items-center gap-3">
              <img :src="uploadState.preview || form.content_image_url" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
              <Button type="button" variant="ghost" size="icon" @click="clearImage">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Кнопки</FieldLabel>
          <FieldContent>
            <div v-if="!buttons.length" class="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Кнопок пока нет.</div>
            <div v-for="(button, index) in buttons" :key="button.id" class="rounded-lg border border-border p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Кнопка #{{ index + 1 }}</div>
                <Button type="button" size="icon" variant="ghost" @click="removeButton(index)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
              <FieldGroup class="mt-3 grid gap-3 md:grid-cols-3">
                <Field>
                  <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Текст</FieldLabel>
                  <FieldContent>
                    <Input v-model="button.text" placeholder="Перейти" />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип</FieldLabel>
                  <FieldContent>
                    <Select v-model="button.type">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Выберите тип" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="url">Ссылка</SelectItem>
                        <SelectItem value="callback">Callback</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
                <Field v-if="button.type === 'url'">
                  <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">URL</FieldLabel>
                  <FieldContent>
                    <Input v-model="button.url" placeholder="https://..." />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </div>
            <Button type="button" variant="outline" @click="addButton">
              <Plus :size="16" />
              Добавить кнопку
            </Button>
          </FieldContent>
        </Field>
      </CardContent>
    </Card>

    <Card v-if="form.type === 'manual'">
      <CardHeader>
        <CardTitle>Планирование отправки</CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата отправки</FieldLabel>
            <FieldContent>
              <Popover v-model:open="isScheduleOpen">
                <PopoverTrigger asChild>
                  <Button variant="outline" class="w-full justify-start text-left font-normal" :class="!scheduledDate && 'text-muted-foreground'">
                    <CalendarIcon :size="16" />
                    {{ scheduledLabel }}
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0" align="start">
                  <div class="space-y-3 p-3">
                    <CalendarView
                      :model-value="scheduledCalendar"
                      :number-of-months="1"
                      locale="ru-RU"
                      initial-focus
                      @update:modelValue="handleScheduleUpdate"
                    />
                    <div class="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{{ scheduledHelperLabel }}</span>
                      <button type="button" class="text-primary hover:underline" @click="clearScheduledDate">Очистить</button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время отправки</FieldLabel>
            <FieldContent>
              <Input v-model="scheduledTime" type="time" />
            </FieldContent>
          </Field>
        </FieldGroup>
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Учитывать часовой пояс</FieldLabel>
            <FieldContent>
              <Select v-model="form.use_user_timezone">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите вариант" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Да</SelectItem>
                  <SelectItem :value="false">Нет</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Час отправки (0-23)</FieldLabel>
            <FieldContent>
              <Input v-model.number="form.target_hour" type="number" min="0" max="23" />
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>

    <Card v-else>
      <CardHeader>
        <CardTitle>Триггер</CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип триггера</FieldLabel>
            <FieldContent>
              <Select v-model="form.trigger_type">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inactive_users">Отсутствие заказов</SelectItem>
                  <SelectItem value="birthday">День рождения</SelectItem>
                  <SelectItem value="new_registration">Новая регистрация</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Активность</FieldLabel>
            <FieldContent>
              <Select v-model="form.is_active">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Активна</SelectItem>
                  <SelectItem :value="false">Выключена</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </FieldGroup>
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Параметр</FieldLabel>
            <FieldContent>
              <Input v-model.number="triggerFields.primary" type="number" :placeholder="triggerPlaceholder" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время проверки</FieldLabel>
            <FieldContent>
              <Input v-model="triggerFields.check_time" type="time" />
            </FieldContent>
          </Field>
        </FieldGroup>
        <p class="text-xs text-muted-foreground">{{ triggerHint }}</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Тестирование</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telegram ID для теста</FieldLabel>
            <FieldContent>
              <Input v-model="test.telegram_id" type="number" placeholder="123456789" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID пользователя для предпросмотра</FieldLabel>
            <FieldContent>
              <Input v-model="test.user_id" type="number" placeholder="456" />
            </FieldContent>
          </Field>
        </FieldGroup>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" type="button" @click="previewCampaign">Предпросмотр</Button>
          <Button variant="outline" type="button" @click="sendTest">Отправить тест</Button>
        </div>
        <div v-if="previewText" class="rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground whitespace-pre-wrap">
          {{ previewText }}
        </div>
      </CardContent>
    </Card>

    <div class="flex flex-wrap gap-3">
      <Button :disabled="saving" @click="saveCampaign">
        <Save :size="16" />
        {{ saving ? "Сохранение..." : "Сохранить" }}
      </Button>
      <Button variant="secondary" :disabled="sending" @click="sendCampaign">
        <Send :size="16" />
        {{ sending ? "Отправка..." : "Отправить" }}
      </Button>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { ArrowLeft, Calendar as CalendarIcon, Plus, Save, Send, Trash2, UploadCloud } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate as parseCalendarDate } from "@internationalized/date";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Calendar as CalendarView } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import SegmentBuilder from "../components/SegmentBuilder.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";

const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();
const ordersStore = useOrdersStore();

const campaignId = computed(() => Number(route.params.id || 0));
const isEditing = computed(() => Boolean(campaignId.value));
const segments = ref([]);
const estimatedSize = ref(null);
const previewText = ref("");
const saving = ref(false);
const sending = ref(false);
const uploadState = ref({ loading: false, error: null, preview: null });
const fileInput = ref(null);
const contentTextarea = ref(null);
const cursorPosition = ref(0);
const scheduledDate = ref("");
const scheduledDateTo = ref("");
const scheduledTime = ref("10:00");
const isScheduleOpen = ref(false);
const scheduleTimeZone = getLocalTimeZone();
const scheduleFormatter = new DateFormatter("ru-RU", { dateStyle: "medium" });
const scheduledCalendar = computed({
  get() {
    return scheduledDate.value ? parseCalendarDate(scheduledDate.value) : undefined;
  },
  set(value) {
    scheduledDate.value = value ? value.toString() : "";
  },
});
const scheduledLabel = computed(() => {
  if (!scheduledDate.value) return "Выберите дату";
  return scheduleFormatter.format(parseCalendarDate(scheduledDate.value).toDate(scheduleTimeZone));
});
const scheduledHelperLabel = computed(() => (scheduledDate.value ? "Дата выбрана" : "Выберите дату"));
const handleScheduleUpdate = (value) => {
  scheduledCalendar.value = value;
  if (scheduledDate.value) {
    isScheduleOpen.value = false;
  }
};
const clearScheduledDate = () => {
  scheduledDate.value = "";
  scheduledDateTo.value = "";
};
const test = ref({
  telegram_id: "",
  user_id: "",
});

const form = ref({
  name: "",
  description: "",
  type: "manual",
  status: "draft",
  segment_id: "",
  content_text: "",
  content_image_url: "",
  scheduled_at: "",
  use_user_timezone: true,
  target_hour: null,
  trigger_type: "inactive_users",
  is_active: true,
});
const segmentConfig = ref({ operator: "AND", conditions: [] });
const buttons = ref([]);
const triggerFields = ref({ primary: 30, check_time: "10:00" });
const placeholders = [
  { label: "Имя {first_name}", value: "{first_name}" },
  { label: "Фамилия {last_name}", value: "{last_name}" },
  { label: "Телефон {phone}", value: "{phone}" },
  { label: "Уровень {loyalty_level}", value: "{loyalty_level}" },
  { label: "Бонусы {bonus_balance}", value: "{bonus_balance}" },
  { label: "Дней без заказа {days_since_order}", value: "{days_since_order}" },
  { label: "Заказов {total_orders}", value: "{total_orders}" },
  { label: "Сумма {total_spent}", value: "{total_spent}" },
];

const statusLabel = (status) => {
  const labels = {
    draft: "Черновик",
    scheduled: "Запланирована",
    sending: "Отправляется",
    completed: "Завершена",
    cancelled: "Отменена",
    failed: "С ошибкой",
  };
  return labels[status] || status || "—";
};

const pageTitle = computed(() => (isEditing.value ? "Редактирование рассылки" : "Новая рассылка"));
const pageSubtitle = computed(() => (isEditing.value ? "Обновите параметры рассылки" : "Создайте маркетинговую рассылку"));
const breadcrumbTitle = computed(() => {
  const name = String(form.value.name || "").trim();
  if (!isEditing.value && !name) return "Новая рассылка";
  return name || "Рассылка";
});
const updateBreadcrumbs = () => {
  ordersStore.setBreadcrumbs([{ label: "Рассылки", to: "/broadcasts" }, { label: "Редактирование " + breadcrumbTitle.value }], route.name);
};

const loadSegments = async () => {
  try {
    const response = await api.get("/api/broadcasts/segments");
    segments.value = response.data?.data?.items || [];
  } catch (error) {
    devError("Ошибка загрузки сегментов:", error);
  }
};

const loadCampaign = async () => {
  if (!isEditing.value) return;
  try {
    const response = await api.get(`/api/broadcasts/${campaignId.value}`);
    const campaign = response.data?.data?.campaign;
    if (!campaign) return;
    form.value = {
      name: campaign.name,
      description: campaign.description || "",
      type: campaign.type,
      status: campaign.status,
      segment_id: campaign.segment_id || "",
      content_text: campaign.content_text || "",
      content_image_url: campaign.content_image_url || "",
      scheduled_at: campaign.scheduled_at ? String(campaign.scheduled_at).slice(0, 16) : "",
      use_user_timezone: Boolean(campaign.use_user_timezone),
      target_hour: campaign.target_hour ?? null,
      trigger_type: campaign.trigger_type || "inactive_users",
      is_active: Boolean(campaign.is_active),
    };
    segmentConfig.value = campaign.segment_config || { operator: "AND", conditions: [] };
    buttons.value = Array.isArray(campaign.content_buttons)
      ? campaign.content_buttons.map((btn, index) => ({ id: `${index}-${Date.now()}`, ...btn }))
      : [];
    triggerFields.value = mapTriggerFields(campaign.trigger_type, campaign.trigger_config);
    syncScheduleFields(form.value.scheduled_at);
    updateBreadcrumbs();
  } catch (error) {
    devError("Ошибка загрузки рассылки:", error);
    showErrorNotification("Не удалось загрузить рассылку");
  }
};

const calculateAudience = async () => {
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

const saveCampaign = async () => {
  saving.value = true;
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description,
      type: form.value.type,
      segment_id: form.value.segment_id || null,
      content_text: form.value.content_text,
      content_image_url: form.value.content_image_url || null,
      scheduled_at: form.value.scheduled_at || null,
      use_user_timezone: Boolean(form.value.use_user_timezone),
      target_hour: form.value.target_hour ?? null,
      trigger_type: form.value.trigger_type,
      segment_config: segmentConfig.value,
      content_buttons: buttons.value.map((button) => ({
        text: button.text || "",
        type: button.type || "url",
        url: button.url || "",
      })),
      trigger_config: buildTriggerConfig(),
      is_active: Boolean(form.value.is_active),
    };
    if (!payload.name) {
      showWarningNotification("Укажите название рассылки");
      return;
    }
    if (!payload.segment_config?.conditions?.length) {
      showWarningNotification("Добавьте условия сегментации");
      return;
    }
    if (isEditing.value) {
      await api.put(`/api/broadcasts/${campaignId.value}`, payload);
    } else {
      const response = await api.post("/api/broadcasts", payload);
      const createdId = response.data?.data?.id;
      if (createdId) {
        router.replace({ name: "broadcast-edit", params: { id: createdId } });
      }
    }
    showSuccessNotification("Рассылка сохранена");
  } catch (error) {
    devError("Ошибка сохранения рассылки:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сохранить рассылку");
  } finally {
    saving.value = false;
  }
};

const sendCampaign = async () => {
  if (!isEditing.value) {
    showWarningNotification("Сначала сохраните рассылку");
    return;
  }
  sending.value = true;
  try {
    await api.post(`/api/broadcasts/${campaignId.value}/send`);
    showSuccessNotification("Рассылка запущена");
  } catch (error) {
    devError("Ошибка запуска рассылки:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось запустить рассылку");
  } finally {
    sending.value = false;
  }
};

const previewCampaign = async () => {
  if (!isEditing.value) {
    showWarningNotification("Сначала сохраните рассылку");
    return;
  }
  if (!test.value.user_id) {
    showWarningNotification("Укажите ID пользователя");
    return;
  }
  try {
    const response = await api.post(`/api/broadcasts/${campaignId.value}/preview`, { user_id: Number(test.value.user_id) });
    previewText.value = response.data?.data?.text || "";
  } catch (error) {
    devError("Ошибка предпросмотра:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось получить предпросмотр");
  }
};

const sendTest = async () => {
  if (!isEditing.value) {
    showWarningNotification("Сначала сохраните рассылку");
    return;
  }
  if (!test.value.telegram_id) {
    showWarningNotification("Укажите Telegram ID");
    return;
  }
  try {
    await api.post(`/api/broadcasts/${campaignId.value}/test`, {
      telegram_id: Number(test.value.telegram_id),
      test_user_id: test.value.user_id ? Number(test.value.user_id) : null,
    });
    showSuccessNotification("Тест отправлен");
  } catch (error) {
    devError("Ошибка тестовой отправки:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось отправить тест");
  }
};

const goBack = () => {
  router.push({ name: "broadcasts" });
};

const addButton = () => {
  if (buttons.value.length >= 8) {
    showWarningNotification("Максимум 8 кнопок");
    return;
  }
  buttons.value.push({ id: `${Date.now()}-${Math.random()}`, text: "", type: "url", url: "" });
};
const removeButton = (index) => {
  buttons.value.splice(index, 1);
};

const getTextareaEl = () => {
  const el = contentTextarea.value?.$el || contentTextarea.value;
  return el instanceof HTMLElement ? el : null;
};
const updateCursor = () => {
  const el = getTextareaEl();
  if (!el) return;
  cursorPosition.value = el.selectionStart || 0;
};
const insertPlaceholder = (placeholder) => {
  const text = form.value.content_text || "";
  const pos = cursorPosition.value || 0;
  const nextValue = `${text.slice(0, pos)}${placeholder}${text.slice(pos)}`;
  form.value.content_text = nextValue;
  const nextPos = pos + placeholder.length;
  requestAnimationFrame(() => {
    const el = getTextareaEl();
    if (!el) return;
    el.focus();
    el.setSelectionRange(nextPos, nextPos);
    cursorPosition.value = nextPos;
  });
};

const syncScheduleFields = (value) => {
  if (!value) {
    scheduledDate.value = "";
    scheduledDateTo.value = "";
    scheduledTime.value = "10:00";
    return;
  }
  const [datePart, timePart] = String(value).split("T");
  scheduledDate.value = datePart || "";
  scheduledDateTo.value = datePart || "";
  scheduledTime.value = timePart ? timePart.slice(0, 5) : "10:00";
};

const updateScheduledAt = () => {
  if (!scheduledDate.value) {
    form.value.scheduled_at = "";
    scheduledDateTo.value = "";
    return;
  }
  const timePart = scheduledTime.value || "10:00";
  form.value.scheduled_at = `${scheduledDate.value}T${timePart}`;
  scheduledDateTo.value = scheduledDate.value;
};

const triggerFile = () => {
  fileInput.value?.click();
};
const onFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) handleFile(file);
};
const onDrop = (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) handleFile(file);
};
const handleFile = async (file) => {
  if (!file.type.startsWith("image/")) {
    uploadState.value = { loading: false, error: "Нужен файл изображения", preview: null };
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadState.value = { loading: false, error: "Файл больше 10MB", preview: null };
    return;
  }
  uploadState.value = { loading: true, error: null, preview: URL.createObjectURL(file) };
  const formData = new FormData();
  formData.append("image", file);
  try {
    const entityId = isEditing.value ? campaignId.value : "temp";
    const response = await api.post(`/api/uploads/broadcasts/${entityId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = response.data?.data?.url || "";
    form.value.content_image_url = uploadedUrl;
    uploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Ошибка загрузки изображения:", error);
    uploadState.value = { loading: false, error: "Не удалось загрузить изображение", preview: null };
  }
};

const clearImage = () => {
  form.value.content_image_url = "";
  uploadState.value = { loading: false, error: null, preview: null };
};

const mapTriggerFields = (type, config) => {
  const data = config || {};
  if (type === "birthday") {
    return { primary: Number(data.days_before || 7), check_time: data.check_time || "09:00" };
  }
  if (type === "new_registration") {
    return { primary: Number(data.hours_after || 24), check_time: data.check_time || "12:00" };
  }
  return { primary: Number(data.days || 30), check_time: data.check_time || "10:00" };
};

const buildTriggerConfig = () => {
  const type = form.value.trigger_type;
  if (type === "birthday") {
    return { days_before: Number(triggerFields.value.primary || 0), check_time: triggerFields.value.check_time || "09:00" };
  }
  if (type === "new_registration") {
    return { hours_after: Number(triggerFields.value.primary || 0), check_time: triggerFields.value.check_time || "12:00" };
  }
  return { days: Number(triggerFields.value.primary || 0), check_time: triggerFields.value.check_time || "10:00" };
};

const triggerHint = computed(() => {
  if (form.value.trigger_type === "birthday") return "Введите количество дней до дня рождения";
  if (form.value.trigger_type === "new_registration") return "Введите количество часов после регистрации";
  return "Введите количество дней без заказов";
});
const triggerPlaceholder = computed(() => {
  if (form.value.trigger_type === "birthday") return "Например: 7";
  if (form.value.trigger_type === "new_registration") return "Например: 24";
  return "Например: 30";
});

watch(
  () => form.value.segment_id,
  (segmentId) => {
    if (!segmentId) return;
    const selected = segments.value.find((segment) => segment.id === segmentId);
    if (selected?.config) {
      segmentConfig.value = selected.config;
    }
  },
);

watch(
  () => form.value.trigger_type,
  (type) => {
    triggerFields.value = mapTriggerFields(type, {});
  },
);

watch([scheduledDate, scheduledTime], updateScheduledAt);

onMounted(async () => {
  await loadSegments();
  await loadCampaign();
  syncScheduleFields(form.value.scheduled_at);
  updateBreadcrumbs();
});
watch(
  () => [breadcrumbTitle.value, isEditing.value],
  () => {
    updateBreadcrumbs();
  },
  { immediate: true },
);
</script>
