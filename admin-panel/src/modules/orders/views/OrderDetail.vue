<template>
  <div class="space-y-6">
    <PageHeader title="Детали заказа" description="Управление заказом и составом">
      <template #actions>
        <div class="flex items-center gap-2">
          <BackButton :label="backButtonLabel" @click="goBack" />
          <Button v-if="canDeleteOrder" variant="destructive" size="sm" :disabled="deletingOrder" @click="deleteDialogOpen = true">
            <Trash2 :size="16" />
            Удалить заказ
          </Button>
        </div>
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
      <Tabs v-model="activeTab">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="general">Общая информация</TabsTrigger>
          <TabsTrigger value="details">Детали заказа</TabsTrigger>
          <TabsTrigger value="history">История статусов</TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="space-y-6">
          <div class="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Общая информация</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Номер заказа</span>
                  <span class="font-medium text-foreground">#{{ order.order_number }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Время создания</span>
                  <span>{{ formatStatusTime(order.created_at) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Время принятия</span>
                  <span>{{ formatStatusTime(acceptedAt) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Время приготовления</span>
                  <span>{{ formatStatusTime(preparingAt) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">{{ deliveryOrPickupTimeLabel }}</span>
                  <span>{{ formatStatusTime(completedAt) }}</span>
                </div>
                <div v-if="order.status === 'cancelled'" class="flex items-center justify-between">
                  <span class="text-muted-foreground">Время отмены</span>
                  <span>{{ formatStatusTime(cancelledAt || order.updated_at) }}</span>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-muted-foreground">Текущий статус</span>
                  <Badge variant="secondary" :class="getStatusBadge(order.status).class" :style="getStatusBadge(order.status).style">
                    {{ getStatusBadge(order.status).label }}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Канал и клиент</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-muted-foreground">Канал заказа</span>
                  <span>{{ order.order_type === "delivery" ? "Доставка" : "Самовывоз" }}</span>
                </div>
                <template v-if="order.order_type === 'delivery'">
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Улица</span>
                    <span>{{ order.delivery_street || "—" }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Дом</span>
                    <span>{{ order.delivery_house || "—" }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Квартира</span>
                    <span>{{ order.delivery_apartment || "—" }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Подъезд</span>
                    <span>{{ order.delivery_entrance || "—" }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Этаж</span>
                    <span>{{ order.delivery_floor || "—" }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Код двери</span>
                    <span>{{ order.delivery_intercom || "—" }}</span>
                  </div>
                </template>
                <div v-else class="flex items-center justify-between">
                  <span class="text-muted-foreground">Филиал</span>
                  <span>{{ order.branch_name || "—" }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Клиент</span>
                  <span class="font-medium text-foreground">{{ customerName }}</span>
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
                <div v-if="orderComment" class="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                  Комментарий: {{ orderComment }}
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
        </TabsContent>

        <TabsContent value="details" class="space-y-6">
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
              <CardTitle>Оплата</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Способ оплаты</span>
                <span>{{ paymentMethodLabel }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Сумма без скидок</span>
                <span>{{ formatCurrency(order.subtotal) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Сумма скидки</span>
                <span>{{ formatCurrency(discountAmount) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Сумма начисления бонусов</span>
                <span>{{ formatNumber(accrualBonusesAmount) }}</span>
              </div>
              <div v-if="order.delivery_cost > 0" class="flex items-center justify-between">
                <span class="text-muted-foreground">Доставка</span>
                <span>{{ formatCurrency(order.delivery_cost) }}</span>
              </div>
              <Separator class="my-2" />
              <div class="flex items-center justify-between text-base font-semibold text-foreground">
                <span>Итоговая сумма</span>
                <span>{{ formatCurrency(order.total) }}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" class="space-y-6">
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
        </TabsContent>
      </Tabs>
    </div>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent class="w-[calc(100%-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Удалить заказ #{{ order?.order_number }}?</DialogTitle>
          <DialogDescription>Действие необратимо. Заказ будет удален из системы.</DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" :disabled="deletingOrder" @click="deleteDialogOpen = false">Отмена</Button>
          <Button type="button" variant="destructive" :disabled="deletingOrder" @click="deleteOrder">
            {{ deletingOrder ? "Удаление..." : "Удалить" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CircleCheck, Trash2 } from "lucide-vue-next";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BackButton from "@/shared/components/BackButton.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { useAuthStore } from "@/shared/stores/auth.js";
const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const ordersStore = useOrdersStore();
const authStore = useAuthStore();
const order = ref(null);
const activeTab = ref("general");
const statusUpdate = ref("");
const deleteDialogOpen = ref(false);
const deletingOrder = ref(false);
const canDeleteOrder = computed(() => authStore.role === "admin");
const orderTimeZone = computed(() => order.value?.city_timezone || "Europe/Moscow");
const paymentMethodLabel = computed(() => {
  if (order.value?.payment_method === "cash") return "Наличные";
  if (order.value?.payment_method === "card") return "Карта";
  return "—";
});
const deliveryOrPickupTimeLabel = computed(() => (order.value?.order_type === "delivery" ? "Время доставки" : "Время выдачи"));
const customerName = computed(() => {
  const parts = [order.value?.user_first_name, order.value?.user_last_name].map((value) => String(value || "").trim()).filter(Boolean);
  return parts.join(" ") || "—";
});
const discountAmount = computed(() => Number(order.value?.bonus_spent || 0));
const accrualBonusesAmount = computed(() => Number(order.value?.bonus_earn_amount || order.value?.bonuses_earned || 0));
const orderComment = computed(() => {
  const value = order.value?.comment || "";
  return String(value).trim();
});
const orderTitle = computed(() => {
  if (order.value?.order_number) return `Заказ #${order.value.order_number}`;
  return `Заказ #${route.params.id}`;
});
const returnFromClientId = computed(() => {
  const from = String(route.query?.from || "").trim();
  const clientId = String(route.query?.client_id || "").trim();
  if (from !== "client" || !clientId) return null;
  return clientId;
});
const backButtonLabel = computed(() => (returnFromClientId.value ? "Назад к клиенту" : "Назад к заказам"));
const updateBreadcrumbs = () => {
  const orderNumber = order.value?.order_number || route.params.id;
  if (returnFromClientId.value) {
    ordersStore.setBreadcrumbs(
      [{ label: "Клиенты", to: "/clients" }, { label: "Клиент", to: `/clients/${returnFromClientId.value}` }, { label: `Заказ #${orderNumber}` }],
      route.name,
    );
    return;
  }

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
const statusHistory = computed(() => order.value?.status_history || []);
const getStatusChangedAt = (status) => statusHistory.value.find((entry) => entry?.new_status === status)?.changed_at || null;
const acceptedAt = computed(() => getStatusChangedAt("confirmed"));
const preparingAt = computed(() => getStatusChangedAt("preparing"));
const completedAt = computed(() => getStatusChangedAt("completed"));
const cancelledAt = computed(() => getStatusChangedAt("cancelled"));
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
    devError("Ошибка загрузки заказа:", error);
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
    devError("Failed to load order:", error);
    showErrorNotification("Ошибка при загрузке заказа");
  }
};
watch(
  () => order.value?.order_number,
  () => {
    updateBreadcrumbs();
  },
);
watch(
  () => [route.query?.from, route.query?.client_id],
  () => {
    updateBreadcrumbs();
  },
);
const goBack = () => {
  if (returnFromClientId.value) {
    router.push(`/clients/${returnFromClientId.value}`);
    return;
  }
  router.push("/orders");
};
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
    devError("Failed to update status:", error);
    showErrorNotification("Ошибка при обновлении статуса");
  }
};
const deleteOrder = async () => {
  if (!order.value?.id || !canDeleteOrder.value || deletingOrder.value) return;
  deletingOrder.value = true;
  try {
    await api.delete(`/api/orders/admin/${order.value.id}`);
    deleteDialogOpen.value = false;
    showSuccessNotification("Заказ удален");
    router.push("/orders");
  } catch (error) {
    devError("Failed to delete order:", error);
    showErrorNotification(error?.response?.data?.error || "Ошибка при удалении заказа");
  } finally {
    deletingOrder.value = false;
  }
};
const formatStatusTime = (value) => {
  if (!value) return "—";
  return formatDateTime(value, { timeZone: orderTimeZone.value });
};
</script>
