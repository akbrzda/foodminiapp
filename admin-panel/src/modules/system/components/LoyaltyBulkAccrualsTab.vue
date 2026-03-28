<template>
  <div class="space-y-5">
    <Card>
      <CardHeader>
        <CardTitle>Массовое начисление бонусов</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="isPremiumBonusMode" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Функция недоступна при активной интеграции PremiumBonus.
        </div>

        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Название операции</FieldLabel>
            <FieldContent>
              <Input v-model="form.name" :disabled="isPremiumBonusMode || loading" placeholder="Например: Бонусы к празднику" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Сумма начисления (бонусов)</FieldLabel>
            <FieldContent>
              <Input
                v-model.number="form.bonus_amount"
                type="number"
                min="1"
                step="1"
                :disabled="isPremiumBonusMode || loading"
                placeholder="100"
              />
            </FieldContent>
          </Field>
        </FieldGroup>

        <div class="rounded-xl border border-border/60 bg-muted/20 p-4">
          <SegmentBuilder v-model="segmentConfig" />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            :disabled="isPremiumBonusMode || loading"
            @click="calculateAudience"
          >
            <Calculator :size="16" />
            Подсчитать пользователей
          </Button>
          <span v-if="audienceCount !== null" class="text-xs text-muted-foreground">Подходит пользователей: {{ audienceCount }}</span>
        </div>

        <Field>
          <FieldLabel>Сообщение пользователю</FieldLabel>
          <FieldContent>
            <Textarea
              ref="messageTextarea"
              v-model="form.message_template"
              rows="5"
              :disabled="isPremiumBonusMode || loading"
              placeholder="Привет, {first_name}! Вам начислено {bonus_amount} бонусов. Баланс: {bonus_balance}."
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
                  :disabled="isPremiumBonusMode || loading"
                  @click="insertPlaceholder(placeholder.value)"
                >
                  {{ placeholder.label }}
                </Button>
              </div>
            </div>
          </FieldContent>
        </Field>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="isPremiumBonusMode || loading" @click="startAccrual">
            <Send :size="16" />
            {{ loading ? "Начисление..." : "Запустить начисление" }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>История операций</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" :disabled="historyLoading" @click="loadHistory">
            <RefreshCcw :size="16" />
            Обновить
          </Button>
        </div>

        <div v-if="historyLoading" class="space-y-2">
          <Skeleton v-for="index in 4" :key="`history-skeleton-${index}`" class="h-16 w-full" />
        </div>

        <div v-else class="space-y-2">
          <button
            v-for="item in history"
            :key="item.id"
            type="button"
            class="w-full rounded-lg border border-border p-3 text-left transition hover:bg-muted/30"
            @click="selectAccrual(item.id)"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="font-medium">#{{ item.id }} · {{ item.name }}</div>
                <div class="text-xs text-muted-foreground">
                  Статус: {{ item.status }} · Создал: {{ formatAdminName(item) }} · {{ formatDate(item.created_at) }}
                </div>
              </div>
              <div class="text-xs text-muted-foreground">
                Пользователей: {{ item.audience_count || 0 }} · Сумма: {{ item.actual_total_amount || 0 }}
              </div>
            </div>
          </button>
          <div v-if="history.length === 0" class="py-4 text-sm text-muted-foreground">Операции пока не запускались.</div>
        </div>
      </CardContent>
    </Card>

    <Card v-if="selectedAccrual">
      <CardHeader>
        <CardTitle>Детали операции #{{ selectedAccrual.id }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="text-sm">
          <div>Название: {{ selectedAccrual.name }}</div>
          <div>Статус: {{ selectedAccrual.status }}</div>
          <div>
            Статистика: аудитория {{ selectedAccrual.audience_count || 0 }}, успех {{ selectedAccrual.success_count || 0 }},
            ошибки {{ selectedAccrual.failed_count || 0 }}, пропущено {{ selectedAccrual.skipped_count || 0 }}
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="outline" :disabled="recipientsLoading" @click="loadRecipients(selectedAccrual.id)">
            <RefreshCcw :size="16" />
            Обновить получателей
          </Button>
        </div>

        <div v-if="recipientsLoading" class="space-y-2">
          <Skeleton v-for="index in 5" :key="`recipient-skeleton-${index}`" class="h-14 w-full" />
        </div>

        <div v-else class="max-h-96 space-y-2 overflow-auto pr-1">
          <div v-for="recipient in recipients" :key="recipient.id" class="rounded-lg border border-border p-3 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                {{ recipient.user_id }} · {{ recipient.first_name || "" }} {{ recipient.last_name || "" }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ recipient.status }} · уведомление: {{ recipient.notification_status }}
              </div>
            </div>
            <div v-if="recipient.error_message" class="mt-1 text-xs text-red-600">{{ recipient.error_message }}</div>
          </div>
          <div v-if="recipients.length === 0" class="py-4 text-sm text-muted-foreground">Нет данных по получателям.</div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Calculator, RefreshCcw, Send } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import SegmentBuilder from "@/modules/broadcasts/components/SegmentBuilder.vue";

const props = defineProps({
  isPremiumBonusMode: {
    type: Boolean,
    default: false,
  },
});

const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();

const loading = ref(false);
const historyLoading = ref(false);
const recipientsLoading = ref(false);
const audienceCount = ref(null);
const history = ref([]);
const recipients = ref([]);
const selectedAccrual = ref(null);
const cursorPosition = ref(0);
const messageTextarea = ref(null);

const form = ref({
  name: "",
  bonus_amount: 100,
  message_template: "",
});

const segmentConfig = ref({ operator: "AND", conditions: [] });

const placeholders = [
  { label: "{first_name}", value: "{first_name}" },
  { label: "{last_name}", value: "{last_name}" },
  { label: "{bonus_amount}", value: "{bonus_amount}" },
  { label: "{bonus_balance}", value: "{bonus_balance}" },
  { label: "{accrual_name}", value: "{accrual_name}" },
  { label: "{accrual_date}", value: "{accrual_date}" },
];

const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return String(value);
  }
};

const formatAdminName = (item) => {
  const first = String(item?.created_by_first_name || "").trim();
  const last = String(item?.created_by_last_name || "").trim();
  const full = `${first} ${last}`.trim();
  return full || `ID ${item?.created_by || "—"}`;
};

const getTextareaEl = () => {
  const el = messageTextarea.value?.$el || messageTextarea.value;
  return el instanceof HTMLElement ? el : null;
};

const updateCursor = () => {
  const el = getTextareaEl();
  if (!el) return;
  cursorPosition.value = el.selectionStart || 0;
};

const insertPlaceholder = (placeholder) => {
  const text = form.value.message_template || "";
  const pos = cursorPosition.value || 0;
  form.value.message_template = `${text.slice(0, pos)}${placeholder}${text.slice(pos)}`;
  const nextPos = pos + placeholder.length;
  requestAnimationFrame(() => {
    const el = getTextareaEl();
    if (!el) return;
    el.focus();
    el.setSelectionRange(nextPos, nextPos);
    cursorPosition.value = nextPos;
  });
};

const calculateAudience = async () => {
  if (props.isPremiumBonusMode) return;
  if (!segmentConfig.value?.conditions?.length) {
    showWarningNotification("Добавьте условия сегментации");
    return;
  }
  loading.value = true;
  try {
    const response = await api.post("/api/admin/loyalty/accruals/calculate", {
      segment_config: segmentConfig.value,
    });
    audienceCount.value = Number(response.data?.audience_count || 0);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось рассчитать аудиторию");
  } finally {
    loading.value = false;
  }
};

const loadHistory = async () => {
  historyLoading.value = true;
  try {
    const response = await api.get("/api/admin/loyalty/accruals", { params: { limit: 50, offset: 0 } });
    history.value = Array.isArray(response.data?.items) ? response.data.items : [];
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить историю начислений");
  } finally {
    historyLoading.value = false;
  }
};

const loadRecipients = async (accrualId) => {
  recipientsLoading.value = true;
  try {
    const response = await api.get(`/api/admin/loyalty/accruals/${accrualId}/recipients`, {
      params: { limit: 200, offset: 0 },
    });
    recipients.value = Array.isArray(response.data?.items) ? response.data.items : [];
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить получателей");
  } finally {
    recipientsLoading.value = false;
  }
};

const selectAccrual = async (accrualId) => {
  try {
    const response = await api.get(`/api/admin/loyalty/accruals/${accrualId}`);
    selectedAccrual.value = response.data?.item || null;
    await loadRecipients(accrualId);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить детали операции");
  }
};

const startAccrual = async () => {
  if (props.isPremiumBonusMode) return;
  if (!segmentConfig.value?.conditions?.length) {
    showWarningNotification("Добавьте условия сегментации");
    return;
  }
  if (!Number.isInteger(Number(form.value.bonus_amount)) || Number(form.value.bonus_amount) <= 0) {
    showWarningNotification("Сумма начисления должна быть положительным целым числом");
    return;
  }

  loading.value = true;
  try {
    const createResponse = await api.post("/api/admin/loyalty/accruals", {
      name: String(form.value.name || "").trim(),
      bonus_amount: Number(form.value.bonus_amount),
      segment_config: segmentConfig.value,
      message_template: String(form.value.message_template || "").trim(),
    });

    const accrualId = Number(createResponse.data?.id);
    if (!Number.isInteger(accrualId) || accrualId <= 0) {
      throw new Error("Некорректный id созданной операции");
    }

    await api.post(`/api/admin/loyalty/accruals/${accrualId}/start`);
    showSuccessNotification("Массовое начисление запущено");

    await loadHistory();
    await selectAccrual(accrualId);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || error?.message || "Не удалось выполнить начисление");
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await loadHistory();
});
</script>
