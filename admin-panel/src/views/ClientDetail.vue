<template>
  <div class="space-y-6">
    <PageHeader :title="clientNameForTitle" description="Данные профиля и лояльность">
      <template #actions>
        <Button variant="outline" size="sm" @click="goBack">
          <ArrowLeft :size="16" />
          Назад к клиентам
        </Button>
      </template>
    </PageHeader>
    <Card>
      <CardHeader>
        <CardTitle>Данные клиента</CardTitle>
        <CardDescription>Регистрация: {{ formatDateTime(client?.created_at) || "—" }} · Город: {{ client?.city_name || "—" }}</CardDescription>
      </CardHeader>
      <CardContent class="p-3 space-y-4">
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Имя</FieldLabel>
            <FieldContent>
              <Input v-model="form.first_name" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Фамилия</FieldLabel>
            <FieldContent>
              <Input v-model="form.last_name" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Телефон</FieldLabel>
            <FieldContent>
              <Input v-model="form.phone" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</FieldLabel>
            <FieldContent>
              <Input v-model="form.email" />
            </FieldContent>
          </Field>
        </FieldGroup>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm text-muted-foreground">
            Бонусный баланс: <strong class="text-foreground">{{ formatNumber(client?.loyalty_balance) }}</strong>
          </div>
          <Button @click="saveClient" :disabled="saving">
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
        <Button variant="secondary" @click="openAdjustModal"> Корректировка баланса </Button>
      </CardHeader>
      <CardContent class="p-3 space-y-6">
        <div class="grid gap-4 md:grid-cols-3">
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">Текущий уровень</div>
            <div class="text-base font-semibold text-foreground">{{ loyaltyStats?.current_level?.name || "—" }}</div>
          </div>
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">Сумма за 60 дней</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(loyaltyStats?.total_spent_60_days || 0) }}</div>
          </div>
          <div class="rounded-xl border border-border/60 bg-background px-4 py-3">
            <div class="text-xs text-muted-foreground">До следующего уровня</div>
            <div class="text-base font-semibold text-foreground">{{ formatNumber(loyaltyStats?.amount_to_next_level || 0) }}</div>
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
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
        <div class="border-b border-border/60 px-4 py-3 text-sm font-semibold text-foreground">История заказов</div>
        <div v-if="ordersLoading" class="p-4">
          <div class="space-y-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
          </div>
        </div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Заказ</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Позиции</TableHead>
              <TableHead class="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="order in orders" :key="order.id" class="cursor-pointer" @click="openOrder(order.id)">
              <TableCell class="font-medium">#{{ order.order_number }}</TableCell>
              <TableCell class="text-muted-foreground">{{ formatDateTime(order.created_at) }}</TableCell>
              <TableCell>{{ formatNumber(order.items_count || 0) }}</TableCell>
              <TableCell class="text-right">{{ formatCurrency(order.total) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
    <Dialog v-if="showAdjustModal" :open="showAdjustModal" @update:open="(value) => (value ? null : closeAdjustModal())">
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
          <Button class="w-full" type="submit" :disabled="adjustSaving">
            <Spinner v-if="adjustSaving" class="h-4 w-4" />
            <span>{{ adjustSaving ? "Сохранение..." : "Сохранить" }}</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Save } from "lucide-vue-next";
import api from "../api/client.js";
import { useNotifications } from "../composables/useNotifications.js";
import { useOrdersStore } from "../stores/orders.js";
import { formatCurrency, formatDateTime, formatNumber } from "../utils/format.js";
import Button from "../components/ui/button/Button.vue";
import Card from "../components/ui/card/Card.vue";
import CardContent from "../components/ui/card/CardContent.vue";
import CardDescription from "../components/ui/card/CardDescription.vue";
import CardHeader from "../components/ui/card/CardHeader.vue";
import CardTitle from "../components/ui/card/CardTitle.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog/index.js";
import Input from "../components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import Table from "../components/ui/table/Table.vue";
import TableBody from "../components/ui/table/TableBody.vue";
import TableCell from "../components/ui/table/TableCell.vue";
import TableHead from "../components/ui/table/TableHead.vue";
import TableHeader from "../components/ui/table/TableHeader.vue";
import TableRow from "../components/ui/table/TableRow.vue";
import Badge from "../components/ui/badge/Badge.vue";
import PageHeader from "../components/PageHeader.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "../components/ui/field";
import Progress from "../components/ui/progress/Progress.vue";
import Skeleton from "../components/ui/skeleton/Skeleton.vue";
import Spinner from "../components/ui/spinner/Spinner.vue";
const route = useRoute();
const router = useRouter();
const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();
const clientId = route.params.id;
const client = ref(null);
const orders = ref([]);
const bonuses = ref([]);
const loyaltyStats = ref(null);
const loyaltyHistory = ref([]);
const ordersLoading = ref(false);
const bonusesLoading = ref(false);
const saving = ref(false);
const showAdjustModal = ref(false);
const adjustSaving = ref(false);
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
const loadClient = async () => {
  const response = await api.get(`/api/admin/clients/${clientId}`);
  client.value = response.data.user;
  Object.assign(form, {
    first_name: client.value.first_name || "",
    last_name: client.value.last_name || "",
    phone: client.value.phone || "",
    email: client.value.email || "",
  });
  updateBreadcrumbs();
};
const loadOrders = async () => {
  ordersLoading.value = true;
  try {
    const response = await api.get(`/api/admin/clients/${clientId}/orders`);
    orders.value = response.data.orders || [];
  } finally {
    ordersLoading.value = false;
  }
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
  saving.value = true;
  try {
    const response = await api.put(`/api/admin/clients/${clientId}`, form);
    client.value = response.data.user;
  } finally {
    saving.value = false;
  }
};
const openAdjustModal = () => {
  adjustForm.type = "earn";
  adjustForm.amount = 0;
  adjustForm.reason = "";
  showAdjustModal.value = true;
};
const closeAdjustModal = () => {
  showAdjustModal.value = false;
};
const submitAdjustment = async () => {
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
  router.push(`/orders/${orderId}`);
};
const goBack = () => {
  router.push("/clients");
};
onMounted(async () => {
  const [clientResult, ordersResult, loyaltyResult] = await Promise.allSettled([loadClient(), loadOrders(), loadLoyalty()]);
  if (clientResult.status === "rejected") {
    console.error("Ошибка загрузки клиента:", clientResult.reason);
    showErrorNotification("Ошибка загрузки клиента");
  }
  if (ordersResult.status === "rejected") {
    console.error("Ошибка загрузки заказов:", ordersResult.reason);
    showErrorNotification("Ошибка загрузки заказов");
  }
  if (loyaltyResult.status === "rejected") {
    console.error("Ошибка загрузки бонусов:", loyaltyResult.reason);
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
</script>
