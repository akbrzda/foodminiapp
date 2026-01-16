<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Аналитика</CardTitle>
        <CardDescription>Сводка по заказам и клиентам</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Период</label>
            <Select v-model="filters.period" @change="loadDashboard">
              <option value="today">Сегодня</option>
              <option value="yesterday">Вчера</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
            <Select v-model="filters.city_id" @change="onCityChange">
              <option value="">Все города</option>
              <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                {{ city.name }}
              </option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиал</label>
            <Select v-model="filters.branch_id" :disabled="!filters.city_id" @change="loadDashboard">
              <option value="">Все филиалы</option>
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.name }}
              </option>
            </Select>
          </div>
          <div class="flex items-end">
            <Button class="w-full lg:w-auto" @click="loadDashboard">
              <RefreshCcw :size="16" />
              Обновить
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardContent class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Заказов
            <ClipboardList :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatNumber(stats?.orders?.total_orders || 0) }}</div>
          <div class="flex gap-3 text-xs text-muted-foreground">
            <span class="flex items-center gap-1 text-emerald-600"><CheckCircle2 :size="14" /> {{ formatNumber(stats?.orders?.completed_orders || 0) }}</span>
            <span class="flex items-center gap-1 text-red-600"><XCircle :size="14" /> {{ formatNumber(stats?.orders?.cancelled_orders || 0) }}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Выручка
            <Wallet :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatCurrency(stats?.orders?.total_revenue) }}</div>
          <div class="text-xs text-muted-foreground">Средний чек: {{ formatCurrency(stats?.orders?.avg_order_value) }}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Клиентов
            <Users :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">{{ formatNumber(stats?.customers?.total_customers || 0) }}</div>
          <div class="flex gap-3 text-xs text-muted-foreground">
            <span class="text-blue-600">Новые: {{ formatNumber(stats?.customers?.new_customers || 0) }}</span>
            <span class="text-purple-600">Повтор: {{ formatNumber(stats?.customers?.returning_customers || 0) }}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Активные заказы
            <Activity :size="16" />
          </div>
          <div class="text-3xl font-semibold text-foreground">
            {{ formatNumber((stats?.orders?.pending_orders || 0) + (stats?.orders?.preparing_orders || 0) + (stats?.orders?.delivering_orders || 0)) }}
          </div>
          <div class="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Ожидают: {{ formatNumber(stats?.orders?.pending_orders || 0) }}</span>
            <span>Готовятся: {{ formatNumber(stats?.orders?.preparing_orders || 0) }}</span>
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Типы заказов</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div v-for="type in stats?.orderTypes" :key="type.order_type" class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Truck v-if="type.order_type === 'delivery'" :size="18" />
                <Store v-else :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-foreground">
                  {{ type.order_type === "delivery" ? "Доставка" : "Самовывоз" }}
                </p>
                <p class="text-xs text-muted-foreground">{{ formatNumber(type.count) }} заказов</p>
              </div>
            </div>
            <p class="text-sm font-semibold text-foreground">{{ formatCurrency(type.revenue) }}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Способы оплаты</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div v-for="method in stats?.paymentMethods" :key="method.payment_method" class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Banknote v-if="method.payment_method === 'cash'" :size="18" />
                <CreditCard v-else :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-foreground">
                  {{ method.payment_method === "cash" ? "Наличные" : "Карта" }}
                </p>
                <p class="text-xs text-muted-foreground">{{ formatNumber(method.count) }} заказов</p>
              </div>
            </div>
            <p class="text-sm font-semibold text-foreground">{{ formatCurrency(method.revenue) }}</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Топ филиалов</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div v-for="(branch, index) in stats?.branches?.slice(0, 5)" :key="branch.id" class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {{ index + 1 }}
            </div>
            <div>
              <p class="text-sm font-medium text-foreground">{{ branch.name }}</p>
              <p class="text-xs text-muted-foreground">{{ branch.city_name }} · {{ formatNumber(branch.orders_count) }} заказов</p>
            </div>
          </div>
          <p class="text-sm font-semibold text-foreground">{{ formatCurrency(branch.revenue) }}</p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Популярные позиции</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div v-for="(item, index) in stats?.topItems?.slice(0, 10)" :key="item.name" class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
              {{ index + 1 }}
            </div>
            <div>
              <p class="text-sm font-medium text-foreground">{{ item.name }}</p>
              <p class="text-xs text-muted-foreground">Продано: {{ formatNumber(item.total_quantity) }} шт.</p>
            </div>
          </div>
          <p class="text-sm font-semibold text-foreground">{{ formatCurrency(item.revenue) }}</p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Динамика за последние 30 дней</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div v-for="day in stats?.dailyStats?.slice(-10)" :key="day.date" class="flex items-center gap-3">
          <p class="w-24 text-xs text-muted-foreground">{{ formatDate(day.date) }}</p>
          <div class="flex-1">
            <div class="h-7 rounded-lg bg-muted">
              <div class="h-7 rounded-lg bg-primary/20" :style="{ width: calculateBarWidth(day.revenue) + '%' }">
                <p class="px-2 text-xs leading-7 text-foreground">{{ formatCurrency(day.revenue) }}</p>
              </div>
            </div>
          </div>
          <p class="w-16 text-right text-xs text-muted-foreground">{{ formatNumber(day.orders_count) }} зак.</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import {
  Activity,
  Banknote,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  RefreshCcw,
  Store,
  Truck,
  Users,
  Wallet,
  XCircle,
} from "lucide-vue-next";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { formatCurrency, formatNumber } from "../utils/format.js";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Select from "../components/ui/Select.vue";

const referenceStore = useReferenceStore();
const stats = ref(null);
const branches = ref([]);
const branchesRequestId = ref(0);
const filters = ref({
  period: "today",
  city_id: "",
  branch_id: "",
});

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
};

const calculateBarWidth = (revenue) => {
  if (!stats.value?.dailyStats || stats.value.dailyStats.length === 0) return 0;
  const maxRevenue = Math.max(...stats.value.dailyStats.map((d) => d.revenue));
  return maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;
};

const loadDashboard = async () => {
  try {
    const params = { period: filters.value.period };
    if (filters.value.city_id) params.city_id = filters.value.city_id;
    if (filters.value.branch_id) params.branch_id = filters.value.branch_id;

    const response = await api.get("/api/analytics/dashboard", { params });
    stats.value = response.data;
  } catch (error) {
    console.error("Ошибка загрузки дашборда:", error);
  }
};

const onCityChange = async () => {
  const requestId = ++branchesRequestId.value;
  filters.value.branch_id = "";
  if (filters.value.city_id) {
    try {
      const response = await api.get(`/api/cities/${filters.value.city_id}/branches`);
      if (requestId === branchesRequestId.value) {
        branches.value = response.data.branches || [];
      }
    } catch (error) {
      console.error("Ошибка загрузки филиалов:", error);
      if (requestId === branchesRequestId.value) {
        branches.value = [];
      }
    }
  } else {
    branches.value = [];
  }
  loadDashboard();
};

onMounted(() => {
  referenceStore.loadCities();
  loadDashboard();
});
</script>
