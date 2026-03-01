<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Кампании подписки" description="Кампании привлечения подписчиков в Telegram-канал">
          <template #actions>
            <Button @click="createCampaign">
              <Plus :size="16" />
              Новая кампания
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card>
      <CardContent>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
          <div class="space-y-1 xl:col-span-8">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
            <Input v-model="filters.search" placeholder="Название или тег кампании" />
          </div>
          <div class="space-y-1 xl:col-span-4">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="filters.is_active">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все</SelectItem>
                <SelectItem value="1">Активные</SelectItem>
                <SelectItem value="0">Неактивные</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-44" />
              <Skeleton class="h-3 w-32" />
              <Skeleton class="h-3 w-52" />
            </div>
          </template>
          <template v-else>
            <div v-for="campaign in campaigns" :key="`mobile-${campaign.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="font-medium text-foreground">{{ campaign.title }}</div>
              <div class="mt-1 text-xs text-muted-foreground">Тег: {{ campaign.tag }}</div>
              <div class="mt-1 text-xs text-muted-foreground">Канал: {{ campaign.channel_id }}</div>
              <div class="mt-2">
                <Badge :class="campaign.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'" variant="secondary">
                  {{ campaign.is_active ? "Активна" : "Отключена" }}
                </Badge>
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="icon" @click="openDetail(campaign.id)">
                  <Eye :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="copyCampaignLink(campaign)">
                  <Link2 :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="editCampaign(campaign.id)">
                  <Pencil :size="16" />
                </Button>
              </div>
            </div>
            <div v-if="!campaigns.length" class="py-8 text-center text-sm text-muted-foreground">Кампании не найдены</div>
          </template>
        </div>

        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тег</TableHead>
                <TableHead>Канал</TableHead>
                <TableHead>Период</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 8" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-20" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="campaign in campaigns" :key="campaign.id">
                  <TableCell>
                    <div class="font-medium">{{ campaign.title }}</div>
                  </TableCell>
                  <TableCell>{{ campaign.tag }}</TableCell>
                  <TableCell>{{ campaign.channel_id }}</TableCell>
                  <TableCell>{{ formatPeriod(campaign) }}</TableCell>
                  <TableCell>
                    <Badge :class="campaign.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'" variant="secondary">
                      {{ campaign.is_active ? "Активна" : "Отключена" }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" @click="openDetail(campaign.id)">
                        <Eye :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="copyCampaignLink(campaign)">
                        <Link2 :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="editCampaign(campaign.id)">
                        <Pencil :size="16" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="!campaigns.length">
                  <TableCell colspan="6" class="py-8 text-center text-sm text-muted-foreground">Кампании не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <TablePagination :total="total" :page="page" :page-size="pageSize" @update:page="onPageChange" @update:page-size="onPageSizeChange" />
  </div>
</template>

<script setup>
import { devError } from "@/shared/utils/logger";
import { onMounted, reactive, ref, watch } from "vue";
import { Link2, Eye, Pencil, Plus } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatDateTime } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import TablePagination from "@/shared/components/TablePagination.vue";

const router = useRouter();
const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();

const isLoading = ref(false);
const campaigns = ref([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const botUsername = ref(String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "").trim());
const filters = reactive({
  search: "",
  is_active: "",
});

let debounceTimer = null;

const loadCampaigns = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/api/campaign", {
      params: {
        page: page.value,
        limit: pageSize.value,
        search: filters.search || undefined,
        is_active: filters.is_active || undefined,
      },
    });
    campaigns.value = response.data?.data || [];
    total.value = Number(response.data?.pagination?.total || 0);
  } catch (error) {
    devError("Ошибка загрузки подписочных кампаний:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить кампании");
  } finally {
    isLoading.value = false;
  }
};

const formatPeriod = (campaign) => {
  if (campaign.is_perpetual) return "Бессрочно";
  if (!campaign.start_date && !campaign.end_date) return "—";
  return `${formatDateTime(campaign.start_date) || "—"} — ${formatDateTime(campaign.end_date) || "—"}`;
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

const buildDeepLink = (tag) => {
  const normalizedTag = String(tag || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  if (!normalizedTag) return "";
  if (!botUsername.value) return "";
  return `https://t.me/${botUsername.value}?start=${normalizedTag}`;
};

const copyCampaignLink = async (campaign) => {
  const link = buildDeepLink(campaign?.tag);
  if (!link) {
    showWarningNotification("Не удалось сформировать ссылку кампании");
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showSuccessNotification("Ссылка кампании скопирована");
  } catch (error) {
    showErrorNotification("Не удалось скопировать ссылку");
  }
};

const createCampaign = () => {
  router.push({ name: "subscription-campaign-new" });
};

const editCampaign = (id) => {
  router.push({ name: "subscription-campaign-edit", params: { id } });
};

const openDetail = (id) => {
  router.push({ name: "subscription-campaign-detail", params: { id } });
};

const onPageChange = (nextPage) => {
  page.value = nextPage;
  loadCampaigns();
};

const onPageSizeChange = (nextSize) => {
  pageSize.value = nextSize;
  page.value = 1;
  loadCampaigns();
};

watch(
  () => [filters.search, filters.is_active],
  () => {
    page.value = 1;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadCampaigns();
    }, 250);
  },
);

onMounted(() => {
  loadBotUsername();
  loadCampaigns();
});
</script>
