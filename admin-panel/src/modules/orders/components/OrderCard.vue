<template>
  <article :ref="(el) => $emit('setRef', el)" class="rounded-xl border bg-card p-4 transition-all" :class="orderCardClass" @click="$emit('toggle')">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span>#{{ order.order_number }}</span>
          <span class="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock :size="14" />
            {{ formatOrderTime(order) }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin v-if="order.order_type === 'delivery'" :size="14" />
          <Store v-else :size="14" />
          <span>{{ getOrderLocation(order) }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone :size="14" />
          <a v-if="normalizePhone(order.user_phone)" class="text-foreground hover:underline" :href="`tel:${normalizePhone(order.user_phone)}`">
            {{ formatPhone(order.user_phone) }}
          </a>
          <span v-else>—</span>
        </div>
        <div v-if="order.delivery_comment || order.comment" class="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare :size="14" />
          <span>{{ order.delivery_comment || order.comment }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <CreditCard :size="14" />
          <span>{{ getPaymentSummary(order) }}</span>
        </div>
      </div>
      <Badge class="text-xs font-semibold" :class="statusBadge.class" :style="statusBadge.style">
        {{ statusBadge.label }}
      </Badge>
    </div>

    <Transition name="fade-slide">
      <div v-if="isExpanded" class="mt-4 space-y-4">
        <OrderItemsList :items="order.items || []" />

        <div v-if="Number(order.delivery_cost) > 0" class="text-sm text-muted-foreground">Доставка: {{ formatCurrency(order.delivery_cost) }}</div>
        <div v-if="discountAmount > 0" class="text-sm text-emerald-600">Скидка: -{{ formatCurrency(discountAmount) }}</div>
        <div v-if="changeFromAmount > 0" class="text-sm text-muted-foreground">
          Сдача: {{ formatCurrency(changeAmount) }} (с {{ formatCurrency(changeFromAmount) }})
        </div>

        <div class="text-sm font-semibold text-foreground">Итого: {{ formatCurrency(order.total) }}</div>

        <div class="space-y-2">
          <Button v-if="nextStatus" class="w-full" @click.stop="$emit('changeStatus')">
            {{ nextStatus.label }}
          </Button>
          <Button v-if="canCancel" variant="destructive" class="w-full" @click.stop="$emit('cancel')"> Отменить заказ </Button>
        </div>
      </div>
    </Transition>
  </article>
</template>

<script setup>
import { computed } from "vue";
import { Clock, CreditCard, MapPin, MessageSquare, Phone, Store } from "lucide-vue-next";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import { formatCurrency, formatPhone, normalizePhone } from "@/shared/utils/format.js";
import OrderItemsList from "./OrderItemsList.vue";

const props = defineProps({
  order: { type: Object, required: true },
  isExpanded: { type: Boolean, default: false },
  isRecent: { type: Boolean, default: false },
});

defineEmits(["toggle", "changeStatus", "cancel", "setRef"]);

// Парсинг даты заказа
const parseOrderDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const hasTimezone = value.includes("Z") || value.includes("T") || /[+-]\d{2}:?\d{2}$/.test(value);
    if (!hasTimezone) {
      const normalized = value.replace(" ", "T");
      const parsed = new Date(`${normalized}Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Стили карточки заказа
const orderCardClass = computed(() => {
  const desiredDate = parseOrderDate(props.order.desired_time);
  const isOverdue = Boolean(desiredDate) && desiredDate < new Date() && !["completed", "cancelled"].includes(props.order.status);

  if (props.isExpanded) {
    return ["border-primary shadow-lg"];
  }
  if (isOverdue) {
    return ["border-2 border-destructive shadow-sm"];
  }
  if (props.isRecent) {
    return ["border-border shadow-sm", "bg-primary/10"];
  }
  return ["border-border shadow-sm"];
});

// Форматирование времени заказа
const formatOrderTime = (order) => {
  const format = (value) => {
    const parsed = parseOrderDate(value);
    return parsed ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(parsed) : "—";
  };
  const start = format(order.created_at);
  const endValue = order.deadline_time || order.desired_time;
  const end = endValue ? format(endValue) : null;
  return end ? `${start} до ${end}` : start;
};

// Получение адреса заказа
const getOrderLocation = (order) => {
  if (order.order_type === "pickup") {
    return order.branch_name || "Самовывоз";
  }
  const parts = [
    order.delivery_street,
    order.delivery_house,
    order.delivery_entrance ? `подъезд ${order.delivery_entrance}` : null,
    order.delivery_floor ? `этаж ${order.delivery_floor}` : null,
    order.delivery_apartment ? `кв. ${order.delivery_apartment}` : null,
    order.delivery_intercom ? `домофон ${order.delivery_intercom}` : null,
  ].filter(Boolean);
  return parts.join(", ") || "Адрес доставки";
};

// Информация об оплате
const getPaymentSummary = (order) => {
  const method = order.payment_method === "cash" ? "наличными" : "картой";
  const itemsCount = order.items?.length || 0;
  const total = Number(order.total) || 0;
  const changeFromAmount = Number(order.change_from) || 0;
  const hasChange = order.payment_method === "cash" && changeFromAmount > 0;
  const changePart = hasChange ? `, сдача ${formatCurrency(Math.max(0, changeFromAmount - total))} (с ${formatCurrency(changeFromAmount)})` : "";
  return `К оплате: ${formatCurrency(order.total)} ${method} (${itemsCount}шт)${changePart}`;
};

const discountAmount = computed(() => Math.max(0, Number(props.order.bonus_spent) || 0));
const changeFromAmount = computed(() => {
  if (props.order.payment_method !== "cash") return 0;
  return Math.max(0, Number(props.order.change_from) || 0);
});
const changeAmount = computed(() => Math.max(0, changeFromAmount.value - (Number(props.order.total) || 0)));

// Бейдж статуса
const statusBadge = computed(() => {
  const labels = {
    pending: "Новый",
    confirmed: "Принят",
    preparing: "Готовится",
    ready: props.order.order_type === "pickup" ? "Готов к выдаче" : "Готов",
    delivering: "В пути",
    completed: props.order.order_type === "pickup" ? "Выдан" : "Доставлен",
    cancelled: "Отменен",
  };
  const colors = {
    pending: { backgroundColor: "#3B82F6", color: "#FFFFFF" },
    confirmed: { backgroundColor: "#10B981", color: "#FFFFFF" },
    preparing: { backgroundColor: "#F59E0B", color: "#FFFFFF" },
    ready: { backgroundColor: "#8B5CF6", color: "#FFFFFF" },
    delivering: { backgroundColor: "#FFD200", color: "#000000" },
    completed: { backgroundColor: "#6B7280", color: "#FFFFFF" },
    cancelled: { backgroundColor: "#EF4444", color: "#FFFFFF" },
  };
  return {
    label: labels[props.order.status] || props.order.status,
    class: "",
    style: colors[props.order.status] || { backgroundColor: "#E0E0E0", color: "#666666" },
  };
});

// Следующий статус заказа
const nextStatus = computed(() => {
  const flowDelivery = {
    pending: { status: "confirmed", label: "Принять заказ" },
    confirmed: { status: "preparing", label: "Отправить в готовку" },
    preparing: { status: "ready", label: "Готов к выдаче" },
    ready: { status: "delivering", label: "Передать курьеру" },
    delivering: { status: "completed", label: "Заказ доставлен" },
  };
  const flowPickup = {
    pending: { status: "confirmed", label: "Принять заказ" },
    confirmed: { status: "preparing", label: "Отправить в готовку" },
    preparing: { status: "ready", label: "Готов к выдаче" },
    ready: { status: "completed", label: "Выдать заказ" },
  };
  const flow = props.order.order_type === "pickup" ? flowPickup : flowDelivery;
  return flow[props.order.status] || null;
});

// Возможность отмены
const canCancel = computed(() => props.order.status !== "cancelled");
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease-out;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
