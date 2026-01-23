<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" size="sm" @click="router.push('/orders')">
        <ArrowLeft :size="16" />
        Назад к заказам
      </Button>
      <Badge variant="secondary">ID: {{ route.params.id }}</Badge>
    </div>
    <Card v-if="!order">
      <CardContent class="py-10 text-center text-sm text-muted-foreground">Загрузка...</CardContent>
    </Card>
    <div v-else class="space-y-6">
      <Card>
        <CardContent class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div class="text-sm text-muted-foreground">Заказ</div>
            <div class="panel-title text-2xl font-semibold text-foreground">#{{ order.order_number }}</div>
            <div class="text-xs text-muted-foreground">{{ formatDateTime(order.created_at) }}</div>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</Badge>
            <StatusBadge :status="order.status" />
          </div>
        </CardContent>
      </Card>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Клиент</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Имя</span>
              <span class="font-medium text-foreground">{{ order.user_first_name }} {{ order.user_last_name }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Телефон</span>
              <span>{{ formatPhone(order.user_phone) }}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Город</span>
              <span>{{ order.city_name }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Филиал</span>
              <span>{{ order.branch_name }}</span>
            </div>
            <div v-if="order.order_type === 'delivery'" class="space-y-2">
              <div v-if="order.delivery_street" class="flex items-center justify-between">
                <span class="text-muted-foreground">Улица</span>
                <span>{{ order.delivery_street }}</span>
              </div>
              <div v-if="order.delivery_house" class="flex items-center justify-between">
                <span class="text-muted-foreground">Дом</span>
                <span>{{ order.delivery_house }}</span>
              </div>
              <div v-if="order.delivery_apartment" class="flex items-center justify-between">
                <span class="text-muted-foreground">Квартира</span>
                <span>{{ order.delivery_apartment }}</span>
              </div>
              <div v-if="order.delivery_entrance" class="flex items-center justify-between">
                <span class="text-muted-foreground">Подъезд</span>
                <span>{{ order.delivery_entrance }}</span>
              </div>
              <div v-if="order.delivery_floor" class="flex items-center justify-between">
                <span class="text-muted-foreground">Этаж</span>
                <span>{{ order.delivery_floor }}</span>
              </div>
              <div v-if="order.delivery_intercom" class="flex items-center justify-between">
                <span class="text-muted-foreground">Код двери</span>
                <span>{{ order.delivery_intercom }}</span>
              </div>
              <div v-if="order.delivery_comment" class="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                {{ order.delivery_comment }}
              </div>
            </div>
            <div v-else class="flex items-center justify-between">
              <span class="text-muted-foreground">Адрес филиала</span>
              <span>{{ order.branch_address || "—" }}</span>
            </div>
            <div v-if="order.comment" class="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              {{ order.comment }}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Состав заказа</CardTitle>
        </CardHeader>
        <CardContent class="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Позиция</TableHead>
                <TableHead>Кол-во</TableHead>
                <TableHead>Цена</TableHead>
                <TableHead class="text-right">Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in order.items" :key="item.id">
                <TableCell>
                  <div class="font-medium text-foreground">
                    {{ item.item_name }}
                    <span v-if="item.variant_name" class="text-xs text-muted-foreground">({{ item.variant_name }})</span>
                  </div>
                  <div v-if="item.modifiers && item.modifiers.length" class="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div v-for="mod in item.modifiers" :key="mod.id">+ {{ mod.modifier_name }} (+{{ formatCurrency(mod.modifier_price) }})</div>
                  </div>
                </TableCell>
                <TableCell>{{ formatNumber(item.quantity) }}</TableCell>
                <TableCell>{{ formatCurrency(item.item_price) }}</TableCell>
                <TableCell class="text-right font-semibold text-foreground">{{ formatCurrency(item.subtotal) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Итого</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Сумма без скидок</span>
              <span>{{ formatCurrency(order.subtotal) }}</span>
            </div>
            <div v-if="order.delivery_cost > 0" class="flex items-center justify-between">
              <span class="text-muted-foreground">Доставка</span>
              <span>{{ formatCurrency(order.delivery_cost) }}</span>
            </div>
            <div v-if="order.bonus_used > 0" class="flex items-center justify-between text-red-600">
              <span>Списано бонусов</span>
              <span>-{{ formatNumber(order.bonus_used) }}</span>
            </div>
            <div v-if="order.bonuses_earned > 0" class="flex items-center justify-between text-emerald-600">
              <span>Начислено бонусов</span>
              <span>{{ formatNumber(order.bonuses_earned) }}</span>
            </div>
            <Separator class="my-2" />
            <div class="flex items-center justify-between text-base font-semibold text-foreground">
              <span>К оплате</span>
              <span>{{ formatCurrency(order.total) }}</span>
            </div>
          </CardContent>
        </Card>
        <Card v-if="order.payment_method === 'cash' && order.change_from">
          <CardHeader>
            <CardTitle>Оплата наличными</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Сдача с</span>
              <span>{{ formatCurrency(order.change_from) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Сдача</span>
              <span>{{ formatCurrency(getChangeAmount(order)) }}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Управление заказом</CardTitle>
          <CardDescription>Изменение статуса заказа</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="statusUpdate">
              <option value="">Выберите статус</option>
              <option v-for="option in availableStatuses" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </Select>
          </div>
          <Button :disabled="!statusUpdate" @click="updateStatus">
            <CircleCheck :size="16" />
            Применить
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, CircleCheck } from "lucide-vue-next";
import api from "../api/client.js";
import StatusBadge from "../components/StatusBadge.vue";
import { formatCurrency, formatDateTime, formatNumber, formatPhone } from "../utils/format.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Select from "../components/ui/Select.vue";
import Separator from "../components/ui/Separator.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import { useNotifications } from "../composables/useNotifications.js";
const route = useRoute();
const router = useRouter();
const { showErrorNotification } = useNotifications();
const order = ref(null);
const statusUpdate = ref("");
const statusOrder = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivering: 4,
  completed: 5,
  cancelled: -1,
};
const availableStatuses = computed(() => {
  if (!order.value) return [];
  const currentStatusIndex = statusOrder[order.value.status];
  const isDelivery = order.value.order_type === "delivery";
  let allStatuses;
  if (isDelivery) {
    allStatuses = [
      { value: "pending", label: "Новый", index: 0 },
      { value: "confirmed", label: "Принят", index: 1 },
      { value: "preparing", label: "Готовится", index: 2 },
      { value: "ready", label: "Готов", index: 3 },
      { value: "delivering", label: "В пути", index: 4 },
      { value: "completed", label: "Доставлен", index: 5 },
      { value: "cancelled", label: "Отменен", index: -1 },
    ];
  } else {
    allStatuses = [
      { value: "pending", label: "Новый", index: 0 },
      { value: "confirmed", label: "Принят", index: 1 },
      { value: "preparing", label: "Готовится", index: 2 },
      { value: "ready", label: "Готов к выдаче", index: 3 },
      { value: "completed", label: "Выдан", index: 5 },
      { value: "cancelled", label: "Отменен", index: -1 },
    ];
  }
  return allStatuses.filter((status) => {
    if (status.value === "cancelled") return true;
    if (order.value.status === "completed") return false;
    return status.index >= currentStatusIndex;
  });
});
onMounted(async () => {
  await loadOrder();
});
const loadOrder = async () => {
  try {
    const response = await api.get(`/api/orders/admin/${route.params.id}`);
    order.value = response.data.order;
  } catch (error) {
    console.error("Failed to load order:", error);
  }
};
const updateStatus = async () => {
  if (!statusUpdate.value) return;
  try {
    await api.put(`/api/orders/admin/${order.value.id}/status`, {
      status: statusUpdate.value,
    });
    await loadOrder();
    statusUpdate.value = "";
  } catch (error) {
    console.error("Failed to update status:", error);
    showErrorNotification("Ошибка при обновлении статуса");
  }
};
const getChangeAmount = (orderData) => {
  if (!orderData) return 0;
  const changeFrom = Number(orderData.change_from || 0);
  const total = Number(orderData.total || 0);
  if (!Number.isFinite(changeFrom) || !Number.isFinite(total)) return 0;
  return Math.max(0, changeFrom - total);
};
</script>
