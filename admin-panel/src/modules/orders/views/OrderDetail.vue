<template>
  <div class="space-y-6">
    <PageHeader title="Детали заказа" description="Управление заказом и составом">
      <template #actions>
        <Button variant="outline" size="sm" @click="router.push('/orders')">
          <ArrowLeft :size="16" />
          Назад к заказам
        </Button>
      </template>
    </PageHeader>
    <Card v-if="!order">
      <CardContent class="py-10">
        <div class="space-y-2">
          <Skeleton class="h-6 w-full" />
          <Skeleton class="h-6 w-3/4" />
          <Skeleton class="h-6 w-1/2" />
        </div>
      </CardContent>
    </Card>
    <div v-else class="space-y-6">
      <Card>
        <CardContent class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div class="text-sm text-muted-foreground">Заказ</div>
            <div class="panel-title text-2xl font-semibold text-foreground">#{{ order.order_number }}</div>
            <div class="text-xs text-muted-foreground">{{ formatDateTime(order.created_at, { timeZone: orderTimeZone }) }}</div>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</Badge>
            <Badge variant="secondary" :class="getStatusBadge(order.status).class" :style="getStatusBadge(order.status).style">
              {{ getStatusBadge(order.status).label }}
            </Badge>
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
              <a
                v-if="normalizePhone(order.user_phone)"
                class="text-foreground hover:underline"
                :href="`tel:${normalizePhone(order.user_phone)}`"
              >
                {{ formatPhone(order.user_phone) }}
              </a>
              <span v-else>—</span>
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
      <Card>
        <CardHeader>
          <CardTitle>История статусов</CardTitle>
        </CardHeader>
        <CardContent class="pt-0">
          <div v-if="statusHistory.length === 0" class="py-6 text-center text-sm text-muted-foreground">История статусов пока пуста</div>
          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>Статус</TableHead>
                <TableHead>Изменение</TableHead>
                <TableHead>Время</TableHead>
                <TableHead>Кем</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="entry in statusHistory" :key="entry.id">
                <TableCell>
                  <div class="font-medium text-foreground">{{ getStatusBadge(entry.new_status).label }}</div>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground">
                  {{ getStatusBadge(entry.old_status).label }} → {{ getStatusBadge(entry.new_status).label }}
                </TableCell>
                <TableCell class="text-xs text-muted-foreground">{{ formatDateTime(entry.changed_at, { timeZone: orderTimeZone }) }}</TableCell>
                <TableCell class="text-xs text-muted-foreground">{{ formatChangedBy(entry) }}</TableCell>
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
            <div v-if="order.bonus_spent > 0" class="flex items-center justify-between text-red-600">
              <span>Списано бонусов</span>
              <span>-{{ formatNumber(order.bonus_spent) }}</span>
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
        <Card>
          <CardHeader>
            <CardTitle>Бонусы по заказу</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            <div v-if="order.bonus_spent > 0" class="flex items-center justify-between">
              <span class="text-muted-foreground">Статус списания</span>
              <Badge variant="secondary">
                {{ formatBonusTransactionStatus(order.bonus_spend_status) }}
              </Badge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Статус начисления</span>
              <Badge variant="secondary">
                {{ formatBonusTransactionStatus(bonusEarnStatus) }}
              </Badge>
            </div>
            <div v-if="order.bonus_earn_amount" class="flex items-center justify-between">
              <span class="text-muted-foreground">Сумма начисления</span>
              <span class="font-medium text-emerald-600">+{{ formatNumber(order.bonus_earn_amount) }}</span>
            </div>
            <div v-if="order.bonus_earn_expires_at" class="flex items-center justify-between">
              <span class="text-muted-foreground">Срок действия</span>
              <span>{{ formatDateTime(order.bonus_earn_expires_at, { timeZone: orderTimeZone }) }}</span>
            </div>
            <div v-if="order.bonus_spent > 0" class="flex items-center justify-between">
              <span class="text-muted-foreground">Использовано</span>
              <span class="font-medium text-red-600">-{{ formatNumber(order.bonus_spent) }}</span>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <div class="font-semibold text-foreground">Детали расчета</div>
              <div class="mt-2 space-y-1">
                <div>База начисления: {{ formatNumber(order.bonus_base_amount || 0) }}</div>
                <div>Уровень: {{ order.bonus_level_name || "—" }}</div>
                <div>Процент начисления: {{ order.bonus_earn_percent ? `${order.bonus_earn_percent}%` : "—" }}</div>
              </div>
            </div>
            <div class="text-xs text-muted-foreground">
              <div v-if="!order.bonus_earn_locked">Начисление будет зафиксировано при переводе в статус "Доставлен"</div>
              <div v-else-if="order.bonus_earn_amount && order.bonus_earn_amount > 0">Бонусы начислены и зафиксированы</div>
            </div>
          </CardContent>
        </Card>
      </div>
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
      <Card>
        <CardHeader>
          <CardTitle>Управление заказом</CardTitle>
          <CardDescription>Изменение статуса заказа</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="statusUpdate">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Выберите статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Выберите статус</SelectItem>
                <SelectItem v-for="option in availableStatuses" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
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
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, CircleCheck } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { formatCurrency, formatDateTime, formatNumber, formatPhone, normalizePhone } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Separator } from "@/shared/components/ui/separator";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const ordersStore = useOrdersStore();
const order = ref(null);
const statusUpdate = ref("");
const orderTimeZone = computed(() => order.value?.city_timezone || "Europe/Moscow");
const orderTitle = computed(() => {
  if (order.value?.order_number) return `Заказ #${order.value.order_number}`;
  return `Заказ #${route.params.id}`;
});
const orderSubtitle = computed(() => {
  if (order.value?.created_at) return formatDateTime(order.value.created_at, { timeZone: orderTimeZone.value });
  return "Детали заказа";
});
const updateBreadcrumbs = () => {
  const orderNumber = order.value?.order_number || route.params.id;
  ordersStore.setBreadcrumbs([{ label: "Заказы", to: "/orders" }, { label: `Заказ #${orderNumber}` }], route.name);
};
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const statusOrder = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivering: 4,
  completed: 5,
  cancelled: -1,
};
const formatBonusTransactionStatus = (status) => {
  const labels = {
    pending: "Ожидает",
    completed: "Завершено",
    cancelled: "Отменено",
  };
  return labels[status] || "—";
};
const bonusEarnStatus = computed(() => {
  if (!order.value) return null;
  if (order.value.bonus_earn_status) return order.value.bonus_earn_status;
  if (order.value.bonus_earn_locked) return "completed";
  return order.value.status === "cancelled" ? "cancelled" : "pending";
});
const statusHistory = computed(() => order.value?.status_history || []);
const getStatusBadge = (status) => {
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
    class: "",
    style: styles[status] || { backgroundColor: "#E0E0E0", color: "#666666" },
  };
};
const formatChangedBy = (entry) => {
  if (!entry) return "—";
  if (entry.changed_by_type === "system") return "Система";
  const parts = [entry.admin_first_name, entry.admin_last_name].filter(Boolean).join(" ").trim();
  return parts || "Администратор";
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
  try {
    await loadOrder();
  } catch (error) {
    console.error("Ошибка загрузки заказа:", error);
    showErrorNotification("Ошибка загрузки заказа");
  }
});
watch(
  () => [orderTitle.value, ordersStore.newOrdersCount],
  () => {
    updateDocumentTitle(orderTitle.value || "Заказ");
  },
  { immediate: true },
);
const loadOrder = async () => {
  try {
    const response = await api.get(`/api/orders/admin/${route.params.id}`);
    order.value = response.data.order;
    updateBreadcrumbs();
  } catch (error) {
    console.error("Failed to load order:", error);
    showErrorNotification("Ошибка при загрузке заказа");
  }
};
watch(
  () => order.value?.order_number,
  () => {
    updateBreadcrumbs();
  },
);
const updateStatus = async () => {
  if (!statusUpdate.value) return;
  try {
    if (statusUpdate.value === "cancelled") {
      await api.put(`/api/orders/admin/${order.value.id}/cancel`);
    } else {
      await api.put(`/api/orders/admin/${order.value.id}/status`, {
        status: statusUpdate.value,
      });
    }
    await loadOrder();
    statusUpdate.value = "";
    showSuccessNotification("Статус заказа обновлен");
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
