import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Дашборд рассылок" description="Сводная аналитика по кампаниям">
          <template #filters>
            <div class="min-w-[180px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</label>
              <Select v-model="period" @update:modelValue="loadStats">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
                  <SelectItem value="quarter">Квартал</SelectItem>
                  <SelectItem value="year">Год</SelectItem>
                  <SelectItem value="all">Все время</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Всего рассылок</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_campaigns || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Активных триггеров</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.active_triggers || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Отправлено сообщений</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_sent || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Конверсий</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_conversions || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Выручка</div>
          <div class="text-2xl font-semibold">{{ formatCurrency(stats.total_revenue || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div class="text-xs text-muted-foreground">Средний CR</div>
          <div class="text-2xl font-semibold">{{ stats.avg_conversion_rate || 0 }}%</div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
<script setup>
import { onMounted, ref, watch } from "vue";
import api from "@/shared/api/client.js";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatCurrency, formatNumber } from "@/shared/utils/format.js";

const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();
const period = ref("month");
const stats = ref({});

const loadStats = async () => {
  try {
    const response = await api.get("/api/broadcasts/dashboard", { params: { period: period.value } });
    stats.value = response.data?.data || {};
  } catch (error) {
    devError("Ошибка загрузки дашборда:", error);
    showErrorNotification("Не удалось загрузить дашборд");
  }
};

onMounted(loadStats);

watch(
  () => ordersStore.lastBroadcastEvent,
  (event) => {
    if (!event) return;
    loadStats();
  },
);
</script>
