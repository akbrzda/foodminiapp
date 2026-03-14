<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader :title="clientNameForTitle" description="Данные профиля и лояльность">
          <template #actions>
            <div class="header-actions">
              <BackButton label="Назад" @click="goBack" />
              <Button v-if="canManageClient" variant="destructive" size="sm" :disabled="deletingClient" @click="deleteClient">
                <Trash2 :size="16" />
                {{ deletingClient ? "Удаление..." : "Удалить клиента" }}
              </Button>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Данные клиента</CardTitle>
        <CardDescription>
          Регистрация: {{ formatDateTime(client?.created_at) || "—" }} · День рождения: {{ formatBirthday(client?.date_of_birth) }} · Город:
          {{ client?.city_name || "—" }}
        </CardDescription>
      </CardHeader>
      <CardContent class="p-3 space-y-3.5">
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Имя</FieldLabel>
            <FieldContent>
              <Input v-model="form.first_name" :disabled="!canManageClient" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Фамилия</FieldLabel>
            <FieldContent>
              <Input v-model="form.last_name" :disabled="!canManageClient" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Телефон</FieldLabel>
            <FieldContent>
              <Input v-model="form.phone" :disabled="!canManageClient" @input="handlePhoneInput" placeholder="+7 (900) 909-22-22" />
              <p v-if="phoneError" class="text-xs text-red-500">{{ phoneError }}</p>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</FieldLabel>
            <FieldContent>
              <Input v-model="form.email" :disabled="!canManageClient" />
            </FieldContent>
          </Field>
        </FieldGroup>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1 text-sm text-muted-foreground">
            <div>
              Бонусный баланс: <strong class="text-foreground">{{ formatNumber(client?.loyalty_balance) }}</strong>
            </div>
            <div>
              Средний чек: <strong class="text-foreground">{{ formatCurrency(client?.avg_check) }}</strong>
            </div>
            <div>
              ID PremiumBonus: <strong class="text-foreground">{{ client?.pb_client_id || "—" }}</strong>
            </div>
          </div>
          <Button v-if="canManageClient" @click="saveClient" :disabled="saving">
            <Spinner v-if="saving" class="h-4 w-4" />
            <Save v-else :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Лояльность</CardTitle>
          <CardDescription>Уровень, статистика и история</CardDescription>
        </div>
        <Button v-if="canAdjustLoyalty" variant="secondary" @click="openAdjustModal"> Корректировка баланса </Button>
      </CardHeader>
      <CardContent class="p-3 space-y-4">
        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">Текущий уровень</div>
            <div class="text-base font-semibold text-foreground">{{ loyaltyStats?.current_level?.name || "—" }}</div>
          </div>
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">{{ totalSpentLabel }}</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(totalSpentValue) }}</div>
          </div>
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">До следующего уровня</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(loyaltyStats?.amount_to_next_level || 0) }}</div>
          </div>
        </div>
        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">Начислено</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(loyaltyStats?.total_earned || 0) }}</div>
          </div>
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">Списано</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(loyaltyStats?.total_spent || 0) }}</div>
          </div>
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">Сгорело</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(loyaltyStats?.total_expired || 0) }}</div>
          </div>
        </div>
        <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>Прогресс до следующего уровня</span>
            <span>{{ Math.round((loyaltyStats?.progress_to_next_level || 0) * 100) }}%</span>
          </div>
          <Progress class="mt-2" :model-value="Math.round((loyaltyStats?.progress_to_next_level || 0) * 100)" />
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">История уровней</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Уровень</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Причина</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="level in loyaltyHistory" :key="level.id">
                <TableCell>{{ level.level_name }}</TableCell>
                <TableCell class="text-muted-foreground">{{ formatDateTime(level.created_at) }}</TableCell>
                <TableCell class="text-muted-foreground">{{ formatLevelReason(level.reason) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <div class="border-b border-border/60 px-4 py-3">
          <div class="text-sm font-semibold text-foreground">История заказов</div>
        </div>
        <div class="p-4 pb-0">
          <Tabs v-model="ordersTab">
            <div class="overflow-x-auto pb-1">
              <TabsList class="inline-flex min-w-max whitespace-nowrap">
                <TabsTrigger value="completed">Завершенные ({{ ordersSummary.completed }})</TabsTrigger>
                <TabsTrigger value="active">Активные ({{ ordersSummary.active }})</TabsTrigger>
                <TabsTrigger value="cancelled">Отмененные ({{ ordersSummary.cancelled }})</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
        </div>
        <div v-if="ordersLoading" class="p-4">
          <div class="space-y-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
          </div>
        </div>
        <div v-else-if="orders.length === 0" class="p-4">
          <div class="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            В этой вкладке пока нет заказов.
          </div>
        </div>
        <div v-else>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заказ</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Позиции</TableHead>
                <TableHead class="text-right">Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="order in orders" :key="order.id" class="cursor-pointer" @click="openOrder(order.id)">
                <TableCell class="font-medium">#{{ order.order_number }}</TableCell>
                <TableCell class="text-muted-foreground">{{ formatDateTime(order.created_at) }}</TableCell>
                <TableCell>
                  <Badge variant="secondary" :style="getOrderStatusBadge(order.status).style">
                    {{ getOrderStatusBadge(order.status).label }}
                  </Badge>
                </TableCell>
                <TableCell>{{ formatNumber(order.items_count || 0) }}</TableCell>
                <TableCell class="text-right">{{ formatCurrency(order.total) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-if="ordersPagination.total > ordersPagination.limit" class="p-4 pt-0">
          <TablePagination
            :total="ordersPagination.total"
            :page="ordersPagination.page"
            :page-size="ordersPagination.limit"
            :page-size-options="[10]"
            @update:page="onOrdersPageChange"
          />
        </div>
      </CardContent>
    </Card>
    <div class="grid gap-4 lg:grid-cols-2">
      <Card class="min-h-[280px]">
        <CardHeader>
          <CardTitle>Любимые категории</CardTitle>
          <CardDescription>Категории, которые клиент заказывает чаще всего</CardDescription>
        </CardHeader>
        <CardContent class="p-3">
          <div v-if="clientLoading" class="space-y-3">
            <Skeleton class="h-20 w-full rounded-xl" />
            <Skeleton class="h-20 w-full rounded-xl" />
            <Skeleton class="h-20 w-full rounded-xl" />
          </div>
          <div v-else-if="favoriteCategories.length" class="space-y-3">
            <div
              v-for="category in favoriteCategories"
              :key="category.id || category.name"
              class="rounded-xl border border-border/60 bg-background px-4 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-foreground">{{ category.name }}</div>
                  <div class="mt-1 text-xs text-muted-foreground">{{ formatFavoriteLastOrdered(category.last_ordered_at) }}</div>
                </div>
                <Badge variant="secondary">{{ formatNumber(category.total_quantity || 0) }} шт.</Badge>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">{{ formatFavoriteOrdersCount(category.orders_count) }}</div>
            </div>
          </div>
          <div
            v-else
            class="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground"
          >
            Пока нет данных
          </div>
        </CardContent>
      </Card>
      <Card class="min-h-[280px]">
        <CardHeader>
          <CardTitle>Любимые блюда</CardTitle>
          <CardDescription>Топ позиций по количеству в заказах</CardDescription>
        </CardHeader>
        <CardContent class="p-3">
          <div v-if="clientLoading" class="space-y-3">
            <Skeleton class="h-20 w-full rounded-xl" />
            <Skeleton class="h-20 w-full rounded-xl" />
            <Skeleton class="h-20 w-full rounded-xl" />
          </div>
          <div v-else-if="favoriteDishes.length" class="space-y-3">
            <div
              v-for="dish in favoriteDishes"
              :key="`${dish.name}-${dish.last_ordered_at || 'none'}`"
              class="rounded-xl border border-border/60 bg-background px-4 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-foreground">{{ dish.name }}</div>
                  <div class="mt-1 text-xs text-muted-foreground">{{ formatFavoriteLastOrdered(dish.last_ordered_at) }}</div>
                </div>
                <Badge variant="secondary">{{ formatNumber(dish.total_quantity || 0) }} шт.</Badge>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">{{ formatFavoriteOrdersCount(dish.orders_count) }}</div>
            </div>
          </div>
          <div
            v-else
            class="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground"
          >
            Пока нет данных
          </div>
        </CardContent>
      </Card>
    </div>
    <Card>
      <CardContent class="!p-0">
        <div class="border-b border-border/60 px-4 py-3 text-sm font-semibold text-foreground">История бонусов</div>
        <div v-if="bonusesLoading" class="p-4">
          <div class="space-y-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
          </div>
        </div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Тип</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Заказ</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead class="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="bonus in bonuses" :key="bonus.id">
              <TableCell>{{ formatBonusStatus(bonus.type) }}</TableCell>
              <TableCell class="text-muted-foreground">{{ formatDateTime(bonus.created_at) }}</TableCell>
              <TableCell>{{ bonus.order_number ? `#${bonus.order_number}` : "—" }}</TableCell>
              <TableCell>{{ formatBonusTransactionStatus(bonus.status) }}</TableCell>
              <TableCell>{{ bonus.expires_at ? formatDateTime(bonus.expires_at) : "—" }}</TableCell>
              <TableCell class="text-right">
                <span :class="isSpendType(bonus.type) ? 'text-red-600' : 'text-emerald-600'">{{ formatNumber(bonus.amount) }}</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <Dialog v-if="showAdjustModal && canAdjustLoyalty" :open="showAdjustModal" @update:open="(value) => (value ? null : closeAdjustModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Корректировка баланса</DialogTitle>
          <DialogDescription>Изменение бонусов пользователя</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitAdjustment">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип операции</FieldLabel>
              <FieldContent>
                <Select v-model="adjustForm.type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earn">Начисление</SelectItem>
                    <SelectItem value="spend">Списание</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Сумма</FieldLabel>
              <FieldContent>
                <Input v-model.number="adjustForm.amount" type="number" min="1" step="1" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина</FieldLabel>
              <FieldContent>
                <Input v-model="adjustForm.reason" type="text" required />
              </FieldContent>
            </Field>
          </FieldGroup>
          <div class="form-actions">
            <Button type="submit" :disabled="adjustSaving">
              <Spinner v-if="adjustSaving" class="h-4 w-4" />
              <span>{{ adjustSaving ? "Сохранение..." : "Сохранить" }}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Save, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { devError } from "@/shared/utils/logger";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { formatCurrency, formatDateTime, formatNumber, formatPhoneInput, isValidPhone, normalizePhone } from "@/shared/utils/format.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select/index.js";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import Input from "@/shared/components/ui/input/Input.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Progress from "@/shared/components/ui/progress/Progress.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import Spinner from "@/shared/components/ui/spinner/Spinner.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import BackButton from "@/shared/components/BackButton.vue";
const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const ordersStore = useOrdersStore();
const authStore = useAuthStore();
const clientId = route.params.id;
const client = ref(null);
const clientLoading = ref(false);
const favoriteDishes = ref([]);
const favoriteCategories = ref([]);
const orders = ref([]);
const ordersTab = ref("completed");
const ordersSummary = reactive({
  active: 0,
  completed: 0,
  cancelled: 0,
});
const ordersPagination = reactive({
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
});
const bonuses = ref([]);
const loyaltyStats = ref(null);
const loyaltyHistory = ref([]);
const ordersLoading = ref(false);
const bonusesLoading = ref(false);
const saving = ref(false);
const showAdjustModal = ref(false);
const adjustSaving = ref(false);
const deletingClient = ref(false);
const phoneError = ref("");
const adjustForm = reactive({
  type: "earn",
  amount: 0,
  reason: "",
});
const clientNameForTitle = computed(() => {
  if (!client.value) return "Клиент";
  const parts = [client.value.first_name, client.value.last_name].filter(Boolean).join(" ");
  return parts ? `Клиент: ${parts}` : "Клиент";
});
const totalSpentValue = computed(() => loyaltyStats.value?.total_spent_all_time || 0);
const totalSpentLabel = computed(() => "Сумма заказов за всё время");
const canManageClient = computed(() => authStore.hasPermission("clients.manage"));
const canAdjustLoyalty = computed(() => authStore.hasPermission("clients.loyalty.adjust"));
const updateBreadcrumbs = () => {
  const name = [client.value?.first_name, client.value?.last_name].filter(Boolean).join(" ").trim();
  ordersStore.setBreadcrumbs([{ label: "Клиенты", to: "/clients" }, { label: name || "Клиент" }], route.name);
};
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const form = reactive({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
});
const formatBonusStatus = (type) => {
  if (type === "earn" || type === "earned") return "Начислено";
  if (type === "spend" || type === "used") return "Списано";
  if (type === "expire") return "Сгорело";
  if (type === "registration") return "Бонус за регистрацию";
  if (type === "birthday") return "Бонус ко дню рождения";
  return "Корректировка";
};
const isSpendType = (type) => type === "spend" || type === "used";
const formatBonusTransactionStatus = (status) => {
  if (status === "pending") return "Ожидает";
  if (status === "completed") return "Выполнено";
  if (status === "cancelled") return "Отменено";
  return "—";
};
const formatLevelReason = (reason) => {
  if (reason === "registration") return "Регистрация";
  if (reason === "threshold_reached") return "Повышение";
  return "—";
};
const getOrderStatusBadge = (status) => {
  const labels = {
    pending: "Новый",
    confirmed: "Принят",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В пути",
    completed: "Завершен",
    cancelled: "Отменен",
  };
  const styles = {
    pending: { backgroundColor: "#3B82F6", color: "#FFFFFF" },
    confirmed: { backgroundColor: "#10B981", color: "#FFFFFF" },
    preparing: { backgroundColor: "#F59E0B", color: "#FFFFFF" },
    ready: { backgroundColor: "#8B5CF6", color: "#FFFFFF" },
    delivering: { backgroundColor: "#FFD200", color: "#000000" },
    completed: { backgroundColor: "#6B7280", color: "#FFFFFF" },
    cancelled: { backgroundColor: "#EF4444", color: "#FFFFFF" },
  };

  return {
    label: labels[status] || status || "—",
    style: styles[status] || { backgroundColor: "#E0E0E0", color: "#666666" },
  };
};
const formatFavoriteOrdersCount = (count) => {
  const normalizedCount = Number(count) || 0;
  if (normalizedCount === 1) return "1 заказ";
  if (normalizedCount >= 2 && normalizedCount <= 4) return `${normalizedCount} заказа`;
  return `${normalizedCount} заказов`;
};
const formatFavoriteLastOrdered = (value) => {
  if (!value) return "Дата последнего заказа неизвестна";
  return `Последний заказ: ${formatDateTime(value)}`;
};
const formatBirthday = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};
const loadClient = async () => {
  clientLoading.value = true;
  try {
    const response = await api.get(`/api/admin/clients/${clientId}`);
    client.value = response.data.user;
    favoriteDishes.value = response.data.favorites?.dishes || [];
    favoriteCategories.value = response.data.favorites?.categories || [];
    Object.assign(form, {
      first_name: client.value.first_name || "",
      last_name: client.value.last_name || "",
      phone: client.value.phone ? formatPhoneInput(client.value.phone) : "",
      email: client.value.email || "",
    });
    updateBreadcrumbs();
  } finally {
    clientLoading.value = false;
  }
};
const loadOrders = async () => {
  ordersLoading.value = true;
  try {
    const response = await api.get(`/api/admin/clients/${clientId}/orders`, {
      params: {
        status_group: ordersTab.value,
        page: ordersPagination.page,
        limit: ordersPagination.limit,
      },
    });
    orders.value = response.data.orders || [];
    ordersSummary.active = Number(response.data.summary?.active || 0);
    ordersSummary.completed = Number(response.data.summary?.completed || 0);
    ordersSummary.cancelled = Number(response.data.summary?.cancelled || 0);
    ordersPagination.total = Number(response.data.pagination?.total || 0);
    ordersPagination.page = Number(response.data.pagination?.page || 1);
    ordersPagination.limit = Number(response.data.pagination?.limit || 10);
    ordersPagination.totalPages = Number(response.data.pagination?.totalPages || 1);
  } finally {
    ordersLoading.value = false;
  }
};
const reloadOrdersWithNotification = async () => {
  try {
    await loadOrders();
  } catch (error) {
    devError("Ошибка загрузки заказов:", error);
    showErrorNotification("Ошибка загрузки заказов");
  }
};
const onOrdersPageChange = (page) => {
  ordersPagination.page = page;
  reloadOrdersWithNotification();
};
const loadLoyalty = async () => {
  bonusesLoading.value = true;
  try {
    const response = await api.get(`/api/admin/loyalty/users/${clientId}/loyalty`);
    const stats = response.data.stats || {};
    const user = response.data.user || {};
    loyaltyStats.value = { ...stats, ...user };
    loyaltyHistory.value = response.data.level_history || [];
    bonuses.value = response.data.transactions || [];
  } finally {
    bonusesLoading.value = false;
  }
};
const saveClient = async () => {
  if (!canManageClient.value) return;
  saving.value = true;
  try {
    phoneError.value = "";
    const phoneDigits = String(form.phone || "").replace(/\D/g, "");
    if (phoneDigits.length > 1 && !isValidPhone(form.phone)) {
      phoneError.value = "Некорректный номер телефона";
      return;
    }
    const payload = {
      ...form,
      phone: phoneDigits.length > 1 ? normalizePhone(form.phone) : "",
    };
    const response = await api.put(`/api/admin/clients/${clientId}`, payload);
    client.value = response.data.user;
  } finally {
    saving.value = false;
  }
};
const handlePhoneInput = (event) => {
  form.phone = formatPhoneInput(event.target?.value || form.phone);
  if (phoneError.value) {
    phoneError.value = "";
  }
};
const openAdjustModal = () => {
  if (!canAdjustLoyalty.value) return;
  adjustForm.type = "earn";
  adjustForm.amount = 0;
  adjustForm.reason = "";
  showAdjustModal.value = true;
};
const closeAdjustModal = () => {
  showAdjustModal.value = false;
};
const submitAdjustment = async () => {
  if (!canAdjustLoyalty.value) return;
  adjustSaving.value = true;
  try {
    await api.post("/api/admin/loyalty/adjust", {
      user_id: Number(clientId),
      amount: Number(adjustForm.amount),
      reason: adjustForm.reason,
      type: adjustForm.type,
    });
    await loadClient();
    await loadLoyalty();
    showAdjustModal.value = false;
  } catch (error) {
    const message = error.response?.data?.error || "Ошибка корректировки баланса";
    showErrorNotification(message);
  } finally {
    adjustSaving.value = false;
  }
};
const openOrder = (orderId) => {
  router.push({
    path: `/orders/${orderId}`,
    query: {
      from: "client",
      client_id: String(clientId),
    },
  });
};
const goBack = () => {
  router.push("/clients");
};
const deleteClient = async () => {
  if (!canManageClient.value) return;
  if (deletingClient.value) return;
  const confirmed = window.confirm("Удалить клиента и все связанные данные? Действие необратимо.");
  if (!confirmed) return;
  deletingClient.value = true;
  try {
    await api.delete(`/api/admin/clients/${clientId}`);
    showSuccessNotification("Клиент удален");
    router.push("/clients");
  } catch (error) {
    devError("Ошибка удаления клиента:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось удалить клиента");
  } finally {
    deletingClient.value = false;
  }
};
onMounted(async () => {
  const [clientResult, ordersResult, loyaltyResult] = await Promise.allSettled([loadClient(), loadOrders(), loadLoyalty()]);
  if (clientResult.status === "rejected") {
    devError("Ошибка загрузки клиента:", clientResult.reason);
    showErrorNotification("Ошибка загрузки клиента");
  }
  if (ordersResult.status === "rejected") {
    devError("Ошибка загрузки заказов:", ordersResult.reason);
    showErrorNotification("Ошибка загрузки заказов");
  }
  if (loyaltyResult.status === "rejected") {
    devError("Ошибка загрузки бонусов:", loyaltyResult.reason);
    showErrorNotification("Ошибка загрузки бонусов");
  }
});
watch(
  () => [clientNameForTitle.value, ordersStore.newOrdersCount],
  () => {
    updateDocumentTitle(clientNameForTitle.value);
  },
  { immediate: true },
);
watch(
  () => [client.value?.first_name, client.value?.last_name],
  () => {
    updateBreadcrumbs();
  },
);
watch(ordersTab, async () => {
  ordersPagination.page = 1;
  await reloadOrdersWithNotification();
});
</script>
