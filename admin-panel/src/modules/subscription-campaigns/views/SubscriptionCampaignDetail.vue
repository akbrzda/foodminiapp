<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="campaign?.title || 'Кампания подписки'" description="Статистика и участники">
          <template #actions>
            <BackButton @click="goBack" />
            <Button variant="secondary" @click="editCampaign">
              <Pencil :size="16" />
              Редактировать
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <div v-if="isLoadingCampaign" class="grid gap-4 md:grid-cols-4">
      <Card v-for="index in 4" :key="`stats-loading-${index}`">
        <CardContent class="pt-6 space-y-2">
          <Skeleton class="h-3 w-28" />
          <Skeleton class="h-8 w-24" />
        </CardContent>
      </Card>
    </div>
    <div v-else class="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Участников</div>
          <div class="text-2xl font-semibold">{{ stats.participants_total || 0 }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Проверок подписки</div>
          <div class="text-2xl font-semibold">{{ stats.checks_total || 0 }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Подписались</div>
          <div class="text-2xl font-semibold">{{ stats.subscribed_total || 0 }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Конверсия</div>
          <div class="text-2xl font-semibold">{{ stats.conversion_rate || 0 }}%</div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Deep-link кампании</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <Input :model-value="deepLink" readonly />
          <div class="flex gap-2">
            <Button variant="outline" @click="copyDeepLink">
              <Copy :size="16" />
              Копировать
            </Button>
            <Button variant="outline" @click="openDeepLink">
              <ExternalLink :size="16" />
              Открыть
            </Button>
          </div>
        </div>
        <div class="inline-flex rounded-lg border border-border bg-white p-2">
          <img :src="qrUrl" alt="QR deep-link" class="h-36 w-36" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
          <div class="space-y-1 xl:col-span-5">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
            <Input v-model="filters.search" placeholder="Имя, телефон или telegram_id" />
          </div>
          <div class="space-y-1 xl:col-span-3">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус подписки</label>
            <Select v-model="filters.is_currently_subscribed">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все</SelectItem>
                <SelectItem value="1">Подписан</SelectItem>
                <SelectItem value="0">Не подписан</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1 xl:col-span-2">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Дата от</label>
            <Input v-model="filters.date_from" type="date" />
          </div>
          <div class="space-y-1 xl:col-span-2">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Дата до</label>
            <Input v-model="filters.date_to" type="date" />
          </div>
        </div>
        <div class="mt-3">
          <Button variant="outline" @click="exportParticipants">
            <Download :size="16" />
            Экспорт CSV
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="!p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Попыток</TableHead>
              <TableHead>Наград</TableHead>
              <TableHead>Первая подписка</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="isLoadingParticipants">
              <TableRow v-for="index in 8" :key="`participants-loading-${index}`">
                <TableCell><Skeleton class="h-4 w-40" /></TableCell>
                <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                <TableCell><Skeleton class="h-4 w-32" /></TableCell>
                <TableCell><Skeleton class="h-6 w-20" /></TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="item in participants" :key="item.id">
                <TableCell>
                  <div class="font-medium">{{ item.first_name || "—" }} {{ item.last_name || "" }}</div>
                  <div class="text-xs text-muted-foreground">{{ item.phone || "—" }}</div>
                </TableCell>
                <TableCell>{{ item.telegram_id }}</TableCell>
                <TableCell>{{ item.attempts_count }}</TableCell>
                <TableCell>{{ item.rewards_claimed_count }}</TableCell>
                <TableCell>{{ formatDateTime(item.first_subscribed_at) || "—" }}</TableCell>
                <TableCell>
                  <Badge :class="item.is_currently_subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'" variant="secondary">
                    {{ item.is_currently_subscribed ? "Подписан" : "Нет" }}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow v-if="!participants.length">
                <TableCell colspan="6" class="py-8 text-center text-sm text-muted-foreground">Участники не найдены</TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <TablePagination
      :total="participantsTotal"
      :page="participantsPage"
      :page-size="participantsPageSize"
      @update:page="onParticipantsPageChange"
      @update:page-size="onParticipantsPageSizeChange"
    />
  </div>
</template>

<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Copy, Download, ExternalLink, Pencil } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatDateTime } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BackButton from "@/shared/components/BackButton.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";

const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();

const campaignId = computed(() => Number(route.params.id || 0));
const botUsername = ref(String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "").trim());
const campaign = ref(null);
const stats = ref({});
const participants = ref([]);
const isLoadingCampaign = ref(false);
const isLoadingParticipants = ref(false);
const participantsPage = ref(1);
const participantsPageSize = ref(20);
const participantsTotal = ref(0);
const filters = reactive({
  search: "",
  is_currently_subscribed: "",
  date_from: "",
  date_to: "",
});

let debounceTimer = null;

const deepLink = computed(() => {
  if (!campaign.value?.tag) return "";
  if (!botUsername.value) return `https://t.me/<username>?start=${campaign.value.tag}`;
  return `https://t.me/${botUsername.value}?start=${campaign.value.tag}`;
});

const qrUrl = computed(() => {
  if (!deepLink.value) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(deepLink.value)}`;
});

const loadCampaign = async () => {
  isLoadingCampaign.value = true;
  try {
    const [campaignResponse, statsResponse] = await Promise.all([
      api.get(`/api/campaign/${campaignId.value}`),
      api.get(`/api/campaign/${campaignId.value}/stats`),
    ]);
    campaign.value = campaignResponse.data?.data || null;
    stats.value = statsResponse.data?.data || {};
  } catch (error) {
    devError("Ошибка загрузки данных кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить кампанию");
  } finally {
    isLoadingCampaign.value = false;
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

const loadParticipants = async () => {
  isLoadingParticipants.value = true;
  try {
    const response = await api.get(`/api/campaign/${campaignId.value}/participants`, {
      params: {
        page: participantsPage.value,
        limit: participantsPageSize.value,
        search: filters.search || undefined,
        is_currently_subscribed: filters.is_currently_subscribed || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      },
    });
    participants.value = response.data?.data || [];
    participantsTotal.value = Number(response.data?.pagination?.total || 0);
  } catch (error) {
    devError("Ошибка загрузки участников кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить участников");
  } finally {
    isLoadingParticipants.value = false;
  }
};

const exportParticipants = async () => {
  try {
    const response = await api.get(`/api/campaign/${campaignId.value}/participants/export`, {
      params: {
        search: filters.search || undefined,
        is_currently_subscribed: filters.is_currently_subscribed || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      },
      responseType: "blob",
    });
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `subscription-campaign-${campaign.value?.tag || campaignId.value}.csv`;
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    showSuccessNotification("CSV экспортирован");
  } catch (error) {
    devError("Ошибка экспорта участников:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось экспортировать CSV");
  }
};

const copyDeepLink = async () => {
  try {
    await navigator.clipboard.writeText(deepLink.value);
    showSuccessNotification("Deep-link скопирован");
  } catch (error) {
    showErrorNotification("Не удалось скопировать ссылку");
  }
};

const openDeepLink = () => {
  if (!deepLink.value) return;
  window.open(deepLink.value, "_blank");
};

const editCampaign = () => {
  router.push({ name: "subscription-campaign-edit", params: { id: campaignId.value } });
};

const goBack = () => {
  router.push({ name: "subscription-campaigns" });
};

const onParticipantsPageChange = (nextPage) => {
  participantsPage.value = nextPage;
  loadParticipants();
};

const onParticipantsPageSizeChange = (nextPageSize) => {
  participantsPageSize.value = nextPageSize;
  participantsPage.value = 1;
  loadParticipants();
};

watch(
  () => [filters.search, filters.is_currently_subscribed, filters.date_from, filters.date_to],
  () => {
    participantsPage.value = 1;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadParticipants();
    }, 250);
  },
);

onMounted(async () => {
  await loadBotUsername();
  await loadCampaign();
  await loadParticipants();
});
</script>
