import { devError } from "@/shared/utils/logger";
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
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[180px] space-y-1">
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
          <div class="min-w-[180px] space-y-1">
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
          <div class="min-w-[220px] space-y-1">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
            <Input v-model="filters.search" placeholder="Название или описание" />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="!p-0">
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
          </TableBody>
        </Table>
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
import { computed, onMounted, ref, watch } from "vue";
import { ChartLine, Eye, Pencil, Plus, Users } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
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
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatDateTime, formatNumber } from "@/shared/utils/format.js";

const router = useRouter();
const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();
const campaigns = ref([]);
const page = ref(1);
const pageSize = ref(20);
const filters = ref({
  type: "",
  status: "",
  search: "",
});

const loadCampaigns = async () => {
  try {
    const response = await api.get("/api/broadcasts");
    campaigns.value = response.data?.data?.items || [];
    page.value = 1;
  } catch (error) {
    devError("Ошибка загрузки рассылок:", error);
    showErrorNotification("Не удалось загрузить рассылки");
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
  router.push({ name: "broadcast-new" });
};
const editCampaign = (campaign) => {
  router.push({ name: "broadcast-edit", params: { id: campaign.id } });
};
const openDetail = (campaign) => {
  router.push({ name: "broadcast-detail", params: { id: campaign.id } });
};
const openSegments = () => {
  router.push({ name: "broadcast-segments" });
};
const openDashboard = () => {
  router.push({ name: "broadcast-dashboard" });
};

onMounted(loadCampaigns);

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
