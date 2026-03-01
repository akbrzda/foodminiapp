<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="isEditing ? 'Редактирование подписочной кампании' : 'Новая подписочная кампания'" description="Настройка deep-link и условий участия">
          <template #actions>
            <BackButton @click="goBack" />
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card v-if="isLoading">
      <CardContent class="space-y-4 pt-6">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-32 w-full" />
      </CardContent>
    </Card>

    <template v-else>
      <Card>
        <CardHeader>
          <CardTitle>Основные поля</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Название</FieldLabel>
              <FieldContent>
                <Input v-model="form.title" placeholder="Подписка на канал Казань" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Тег кампании</FieldLabel>
              <FieldContent>
                <div class="space-y-2">
                  <Input v-model="form.tag" placeholder="kazan_promo_2026" />
                  <div class="flex flex-wrap gap-2">
                    <Input :model-value="deepLinkByTag" readonly class="min-w-[280px] flex-1" />
                    <Button type="button" variant="outline" @click="copyTaggedLink">
                      <Copy :size="16" />
                      Скопировать ссылку
                    </Button>
                  </div>
                </div>
              </FieldContent>
            </Field>
          </FieldGroup>

          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>ID канала</FieldLabel>
              <FieldContent>
                <Input v-model="form.channel_id" placeholder="@my_channel или -1001234567890" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Ссылка на канал</FieldLabel>
              <FieldContent>
                <Input v-model="form.channel_url" placeholder="https://t.me/my_channel" />
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Логика кампании</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <FieldGroup class="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>Активность</FieldLabel>
              <FieldContent>
                <Select v-model="form.is_active">
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Активна</SelectItem>
                    <SelectItem :value="false">Отключена</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Период</FieldLabel>
              <FieldContent>
                <Select v-model="form.is_perpetual">
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Бессрочно</SelectItem>
                    <SelectItem :value="false">Ограниченный период</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Режим награды</FieldLabel>
              <FieldContent>
                <Select v-model="form.is_reward_unique">
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Однократно</SelectItem>
                    <SelectItem :value="false">Повторяемо</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>

          <FieldGroup v-if="!form.is_perpetual" class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Дата начала</FieldLabel>
              <FieldContent>
                <Input v-model="form.start_date" type="datetime-local" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Дата завершения</FieldLabel>
              <FieldContent>
                <Input v-model="form.end_date" type="datetime-local" />
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Сообщения и медиа</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <Field>
            <FieldLabel>Welcome message</FieldLabel>
            <FieldContent>
              <Textarea v-model="form.welcome_message" rows="4" placeholder="Подпишитесь на канал и нажмите кнопку проверки" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Success message</FieldLabel>
            <FieldContent>
              <Textarea v-model="form.success_message" rows="4" placeholder="Подписка подтверждена! Забирайте бонус" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Error message</FieldLabel>
            <FieldContent>
              <Textarea v-model="form.error_message" rows="4" placeholder="Пока не видим подписку, попробуйте снова" />
            </FieldContent>
          </Field>
          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Тип медиа</FieldLabel>
              <FieldContent>
                <Select v-model="form.media_type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Без медиа" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Без медиа</SelectItem>
                    <SelectItem value="photo">Фото</SelectItem>
                    <SelectItem value="video">Видео</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>{{ form.media_type === "video" ? "Ссылка на видео" : "Ссылка на медиа" }}</FieldLabel>
              <FieldContent>
                <Input v-model="form.media_url" placeholder="https://..." />
              </FieldContent>
            </Field>
          </FieldGroup>
          <Field v-if="form.media_type === 'photo'">
            <FieldLabel>Загрузка фото (upload util)</FieldLabel>
            <FieldContent>
              <div
                class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground"
                @dragover.prevent
                @drop.prevent="onDrop"
              >
                <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
                <Button type="button" variant="outline" size="sm" @click="triggerFile">
                  <UploadCloud :size="16" />
                  Загрузить фото
                </Button>
                <span>или перетащите файл сюда</span>
                <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
                <span v-if="uploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
              </div>
              <div v-if="uploadState.preview || form.media_url" class="mt-3 flex items-center gap-3">
                <img :src="uploadState.preview || form.media_url" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
                <Button type="button" variant="ghost" size="icon" @click="clearMedia">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </FieldContent>
          </Field>
        </CardContent>
      </Card>

      <div class="flex flex-wrap gap-3">
        <Button :disabled="isSaving" @click="saveCampaign">
          <Save :size="16" />
          {{ isSaving ? "Сохранение..." : "Сохранить" }}
        </Button>
        <Button variant="secondary" @click="goBack">Отмена</Button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, reactive, ref } from "vue";
import { Copy, Save, Trash2, UploadCloud } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BackButton from "@/shared/components/BackButton.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";

const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();

const campaignId = computed(() => Number(route.params.id || 0));
const isEditing = computed(() => Boolean(campaignId.value));
const botUsername = ref(String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "").trim());
const isLoading = ref(false);
const isSaving = ref(false);
const fileInput = ref(null);
const uploadState = ref({ loading: false, error: null, preview: null });
const form = reactive({
  tag: "",
  title: "",
  channel_id: "",
  channel_url: "",
  welcome_message: "",
  success_message: "",
  error_message: "",
  media_type: "",
  media_url: "",
  is_reward_unique: false,
  is_active: true,
  is_perpetual: false,
  start_date: "",
  end_date: "",
});

const normalizeTag = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");

const deepLinkByTag = computed(() => {
  const tag = normalizeTag(form.tag);
  if (!tag) return "";
  if (!botUsername.value) return `https://t.me/<username>?start=${tag}`;
  return `https://t.me/${botUsername.value}?start=${tag}`;
});

const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toApiDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const fillForm = (data) => {
  form.tag = data.tag || "";
  form.title = data.title || "";
  form.channel_id = data.channel_id || "";
  form.channel_url = data.channel_url || "";
  form.welcome_message = data.welcome_message || "";
  form.success_message = data.success_message || "";
  form.error_message = data.error_message || "";
  form.media_type = data.media_type || "";
  form.media_url = data.media_url || "";
  form.is_reward_unique = Boolean(data.is_reward_unique);
  form.is_active = Boolean(data.is_active);
  form.is_perpetual = Boolean(data.is_perpetual);
  form.start_date = toLocalDateTime(data.start_date);
  form.end_date = toLocalDateTime(data.end_date);
  uploadState.value = { loading: false, error: null, preview: data.media_url || null };
};

const copyTaggedLink = async () => {
  if (!deepLinkByTag.value) {
    showWarningNotification("Сначала укажите тег кампании");
    return;
  }
  try {
    await navigator.clipboard.writeText(deepLinkByTag.value);
    showSuccessNotification("Ссылка с тегом скопирована");
  } catch (error) {
    showErrorNotification("Не удалось скопировать ссылку");
  }
};

const loadCampaign = async () => {
  if (!isEditing.value) return;
  isLoading.value = true;
  try {
    const response = await api.get(`/api/subscription-campaigns/${campaignId.value}`);
    fillForm(response.data?.data || {});
  } catch (error) {
    devError("Ошибка загрузки подписочной кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить кампанию");
  } finally {
    isLoading.value = false;
  }
};

const loadBotUsername = async () => {
  if (botUsername.value) return;
  try {
    const response = await api.get("/api/settings/admin/telegram-bot/profile");
    const username = String(response.data?.data?.username || "").trim();
    if (username) {
      botUsername.value = username;
    }
  } catch (error) {
    devError("Не удалось получить username Telegram-бота:", error);
  }
};

const saveCampaign = async () => {
  isSaving.value = true;
  try {
    const payload = {
      tag: form.tag,
      title: form.title,
      channel_id: form.channel_id,
      channel_url: form.channel_url,
      welcome_message: form.welcome_message,
      success_message: form.success_message,
      error_message: form.error_message,
      media_type: form.media_type || null,
      media_url: form.media_url || null,
      is_reward_unique: form.is_reward_unique,
      is_active: form.is_active,
      is_perpetual: form.is_perpetual,
      start_date: form.is_perpetual ? null : toApiDateTime(form.start_date),
      end_date: form.is_perpetual ? null : toApiDateTime(form.end_date),
    };
    if (isEditing.value) {
      await api.put(`/api/subscription-campaigns/${campaignId.value}`, payload);
    } else {
      await api.post("/api/subscription-campaigns", payload);
    }
    showSuccessNotification("Кампания сохранена");
    router.push({ name: "subscription-campaigns" });
  } catch (error) {
    devError("Ошибка сохранения подписочной кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось сохранить кампанию");
  } finally {
    isSaving.value = false;
  }
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
    const response = await api.post(`/api/uploads/subscription-campaigns/${entityId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = response.data?.data?.url || "";
    form.media_url = uploadedUrl;
    form.media_type = "photo";
    uploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Ошибка загрузки медиа подписочной кампании:", error);
    uploadState.value = { loading: false, error: "Не удалось загрузить файл", preview: null };
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить файл");
  }
};

const clearMedia = () => {
  form.media_url = "";
  uploadState.value = { loading: false, error: null, preview: null };
};

const goBack = () => {
  router.push({ name: "subscription-campaigns" });
};

onMounted(() => {
  loadBotUsername();
  loadCampaign();
});
</script>
