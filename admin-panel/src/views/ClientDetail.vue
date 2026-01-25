<template>
  <div class="space-y-6">
    <PageHeader :title="`Клиент #${clientId}`" :description="clientTitle">
      <template #actions>
        <Button variant="outline" size="sm" @click="goBack">
          <ArrowLeft :size="16" />
          Назад к клиентам
        </Button>
        <Badge variant="secondary">ID: {{ clientId }}</Badge>
      </template>
    </PageHeader>
    <Card>
      <CardHeader>
        <CardTitle>Данные клиента</CardTitle>
        <CardDescription>Регистрация: {{ formatDateTime(client?.created_at) || "—" }} · Город: {{ client?.city_name || "—" }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Имя</label>
            <Input v-model="form.first_name" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Фамилия</label>
            <Input v-model="form.last_name" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Телефон</label>
            <Input v-model="form.phone" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
            <Input v-model="form.email" />
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm text-muted-foreground">
            Бонусный баланс: <strong class="text-foreground">{{ formatNumber(client?.loyalty_balance) }}</strong>
          </div>
          <Button @click="saveClient" :disabled="saving">
            <Save :size="16" />
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
        <Button variant="secondary" @click="openAdjustModal">
          Корректировка баланса
        </Button>
      </CardHeader>
      <CardContent class="space-y-6">
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
          <div class="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              class="h-2 rounded-full bg-primary"
              :style="{ width: `${Math.round((loyaltyStats?.progress_to_next_level || 0) * 100)}%` }"
            ></div>
          </div>
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
      <CardHeader>
        <CardTitle>История заказов</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <div v-if="ordersLoading" class="text-sm text-muted-foreground">Загрузка...</div>
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
      <CardHeader>
        <CardTitle>История бонусов</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <div v-if="bonusesLoading" class="text-sm text-muted-foreground">Загрузка...</div>
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
    <BaseModal v-if="showAdjustModal" title="Корректировка баланса" subtitle="Изменение бонусов пользователя" @close="closeAdjustModal">
      <form class="space-y-4" @submit.prevent="submitAdjustment">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип операции</label>
          <Select v-model="adjustForm.type">
            <option value="earn">Начисление</option>
            <option value="spend">Списание</option>
          </Select>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Сумма</label>
          <Input v-model.number="adjustForm.amount" type="number" min="1" step="1" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина</label>
          <Input v-model="adjustForm.reason" type="text" required />
        </div>
        <Button class="w-full" type="submit" :disabled="adjustSaving">
          {{ adjustSaving ? "Сохранение..." : "Сохранить" }}
        </Button>
      </form>
    </BaseModal>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Save } from "lucide-vue-next";
import api from "../api/client.js";
import { useNotifications } from "../composables/useNotifications.js";
import { formatCurrency, formatDateTime, formatNumber } from "../utils/format.js";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import Badge from "../components/ui/Badge.vue";
import PageHeader from "../components/PageHeader.vue";
import BaseModal from "../components/BaseModal.vue";
const route = useRoute();
const router = useRouter();
const { showErrorNotification } = useNotifications();
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
const clientTitle = computed(() => {
  if (!client.value) return "Данные профиля и лояльность";
  const parts = [client.value.first_name, client.value.last_name].filter(Boolean).join(" ");
  const phone = client.value.phone ? `· ${client.value.phone}` : "";
  return `${parts || "Данные профиля"} ${phone}`.trim();
});
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
  try {
    await Promise.all([loadClient(), loadOrders(), loadLoyalty()]);
  } catch (error) {
    console.error("Ошибка загрузки клиента:", error);
    showErrorNotification("Ошибка загрузки клиента");
  }
});
</script>
