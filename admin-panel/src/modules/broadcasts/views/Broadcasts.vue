<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Рассылки" description="Управление маркетинговыми рассылками">
          <template #actions>
            <Badge variant="secondary">Показано: {{ paginatedCampaigns.length }} / {{ filteredCampaigns.length }}</Badge>
            <Button @click="createCampaign">
              <Plus :size="16" />
              Создать рассылку
            </Button>
            <Button variant="secondary" @click="openDashboard">
              <ChartLine :size="16" />
              Дашборд
            </Button>
            <Button variant="secondary" @click="openSegments">
              <Users :size="16" />
              Сегменты
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
          <div class="min-w-0 space-y-1 xl:col-span-3">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип</label>
            <Select v-model="filters.type">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Все типы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все</SelectItem>
                <SelectItem value="manual">Ручные</SelectItem>
                <SelectItem value="trigger">Триггерные</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="min-w-0 space-y-1 xl:col-span-3">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="filters.status">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="scheduled">Запланирована</SelectItem>
                <SelectItem value="sending">Отправляется</SelectItem>
                <SelectItem value="completed">Завершена</SelectItem>
                <SelectItem value="cancelled">Отменена</SelectItem>
                <SelectItem value="failed">С ошибкой</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="min-w-0 space-y-1 sm:col-span-2 xl:col-span-6">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
            <Input v-model="filters.search" placeholder="Название или описание" />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-40" />
              <Skeleton class="h-3 w-48" />
              <div class="flex items-center justify-between">
                <Skeleton class="h-5 w-24" />
                <Skeleton class="h-4 w-16" />
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="campaign in paginatedCampaigns" :key="`mobile-${campaign.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="font-medium text-foreground">{{ campaign.name }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ campaign.description || "—" }}</div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{{ campaign.type === "trigger" ? "Триггерная" : "Ручная" }}</Badge>
                <Badge :class="statusClass(campaign.status)" variant="secondary">{{ statusLabel(campaign.status) }}</Badge>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Получатели: {{ formatNumber(campaign.stats?.total_recipients || 0) }}</div>
                <div>Отправлено: {{ formatNumber(campaign.stats?.sent_count || 0) }}</div>
                <div>Клики: {{ formatNumber(campaign.stats?.click_count || 0) }}</div>
                <div>Конверсии: {{ formatNumber(campaign.stats?.conversion_count || 0) }}</div>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">Создана: {{ formatDateTime(campaign.created_at) || "—" }}</div>
              <div class="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="icon" @click="openDetail(campaign)">
                  <Eye :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="editCampaign(campaign)">
                  <Pencil :size="16" />
                </Button>
              </div>
            </div>
            <div v-if="filteredCampaigns.length === 0" class="py-8 text-center text-sm text-muted-foreground">Рассылки не найдены</div>
          </template>
        </div>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Получателей</TableHead>
                <TableHead>Отправлено</TableHead>
                <TableHead>Клики</TableHead>
                <TableHead>Конверсии</TableHead>
                <TableHead>Создана</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 6" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-52" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="campaign in paginatedCampaigns" :key="campaign.id">
                  <TableCell>
                    <div class="font-medium text-foreground">{{ campaign.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ campaign.description || "—" }}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ campaign.type === "trigger" ? "Триггерная" : "Ручная" }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge :class="statusClass(campaign.status)" variant="secondary">{{ statusLabel(campaign.status) }}</Badge>
                  </TableCell>
                  <TableCell>{{ formatNumber(campaign.stats?.total_recipients || 0) }}</TableCell>
                  <TableCell>{{ formatNumber(campaign.stats?.sent_count || 0) }}</TableCell>
                  <TableCell>{{ formatNumber(campaign.stats?.click_count || 0) }}</TableCell>
                  <TableCell>{{ formatNumber(campaign.stats?.conversion_count || 0) }}</TableCell>
                  <TableCell>{{ formatDateTime(campaign.created_at) || "—" }}</TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" @click="openDetail(campaign)">
                        <Eye :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="editCampaign(campaign)">
                        <Pencil :size="16" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="filteredCampaigns.length === 0">
                  <TableCell colspan="9" class="py-8 text-center text-sm text-muted-foreground">Рассылки не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <TablePagination
      :total="filteredCampaigns.length"
      :page="page"
      :page-size="pageSize"
      @update:page="page = $event"
      @update:page-size="onPageSizeChange"
    />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref, watch } from "vue";
import { ChartLine, Eye, Pencil, Plus, Users } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatDateTime, formatNumber } from "@/shared/utils/format.js";
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
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";

const router = useRouter();
const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();

// Навигационный контекст
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("broadcasts");

const campaigns = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const filters = ref({
  type: "",
  status: "",
  search: "",
});

const loadCampaigns = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const response = await api.get("/api/broadcasts");
    campaigns.value = response.data?.data?.items || [];
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Ошибка загрузки рассылок:", error);
    showErrorNotification("Не удалось загрузить рассылки");
  } finally {
    isLoading.value = false;
  }
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const filteredCampaigns = computed(() => {
  const search = String(filters.value.search || "").toLowerCase();
  return campaigns.value.filter((item) => {
    const matchType = filters.value.type ? item.type === filters.value.type : true;
    const matchStatus = filters.value.status ? item.status === filters.value.status : true;
    const matchSearch = search
      ? String(item.name || "")
          .toLowerCase()
          .includes(search) ||
        String(item.description || "")
          .toLowerCase()
          .includes(search)
      : true;
    return matchType && matchStatus && matchSearch;
  });
});
const paginatedCampaigns = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredCampaigns.value.slice(start, start + pageSize.value);
});

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

const statusClass = (status) => {
  if (status === "completed") return "bg-emerald-100 text-emerald-700 border-transparent";
  if (status === "sending") return "bg-blue-100 text-blue-700 border-transparent";
  if (status === "scheduled") return "bg-amber-100 text-amber-700 border-transparent";
  if (status === "cancelled" || status === "failed") return "bg-muted text-muted-foreground border-transparent";
  return "bg-muted text-muted-foreground border-transparent";
};

const createCampaign = () => {
  saveContext(filters.value, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "broadcast-new" });
};

const editCampaign = (campaign) => {
  saveContext(filters.value, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "broadcast-edit", params: { id: campaign.id } });
};

const openDetail = (campaign) => {
  saveContext(filters.value, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "broadcast-detail", params: { id: campaign.id } });
};
const openSegments = () => {
  router.push({ name: "broadcast-segments" });
};
const openDashboard = () => {
  router.push({ name: "broadcast-dashboard" });
};

onMounted(async () => {
  if (shouldRestore.value) {
    const context = restoreContext();

    if (context) {
      filters.value = { ...filters.value, ...context.filters };
      if (context.page) page.value = context.page;
      if (context.pageSize) pageSize.value = context.pageSize;

      await loadCampaigns({ preservePage: true });
      restoreScroll(context.scroll);
    }
  } else {
    await loadCampaigns();
  }
});

watch(
  () => ordersStore.lastBroadcastEvent,
  (event) => {
    if (!event) return;
    loadCampaigns();
  },
);
watch(
  () => [filters.value.type, filters.value.status, filters.value.search],
  () => {
    page.value = 1;
  },
);
</script>
