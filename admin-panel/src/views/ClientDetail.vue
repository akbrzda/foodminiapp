<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" size="sm" @click="goBack">
        <ArrowLeft :size="16" />
        Назад к клиентам
      </Button>
      <Badge variant="secondary">ID: {{ clientId }}</Badge>
    </div>

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
            Бонусный баланс: <strong class="text-foreground">{{ formatNumber(client?.bonus_balance) }}</strong>
          </div>
          <Button @click="saveClient" :disabled="saving">
            <Save :size="16" />
            {{ saving ? "Сохранение..." : "Сохранить" }}
          </Button>
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
              <TableHead>Статус</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead class="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="bonus in bonuses" :key="bonus.id">
              <TableCell>{{ formatBonusStatus(bonus.type) }}</TableCell>
              <TableCell class="text-muted-foreground">{{ formatDateTime(bonus.created_at) }}</TableCell>
              <TableCell class="text-right">
                <span :class="bonus.type === 'used' ? 'text-red-600' : 'text-emerald-600'">{{ formatNumber(bonus.amount) }}</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Save } from "lucide-vue-next";
import api from "../api/client.js";
import { formatCurrency, formatDateTime, formatNumber } from "../utils/format.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id;

const client = ref(null);
const orders = ref([]);
const bonuses = ref([]);
const ordersLoading = ref(false);
const bonusesLoading = ref(false);
const saving = ref(false);

const form = reactive({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
});

const formatBonusStatus = (type) => {
  if (type === "earned") return "Начислено";
  if (type === "used") return "Списано";
  if (type === "expired") return "Сгорело";
  return "Корректировка";
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

const loadBonuses = async () => {
  bonusesLoading.value = true;
  try {
    const response = await api.get(`/api/admin/clients/${clientId}/bonuses`);
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

const openOrder = (orderId) => {
  router.push(`/orders/${orderId}`);
};

const goBack = () => {
  router.push("/clients");
};

onMounted(async () => {
  await Promise.all([loadClient(), loadOrders(), loadBonuses()]);
});
</script>
