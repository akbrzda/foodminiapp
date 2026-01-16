<template>
  <span :class="badgeClass" class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest">
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  status: { type: String, default: "" },
});

const labels = {
  pending: "Новый",
  confirmed: "Принят",
  preparing: "Готовится",
  ready: "Готов",
  delivering: "В пути",
  completed: "Завершен",
  cancelled: "Отменен",
};

const colors = {
  pending: "bg-accent text-ink",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-violet-100 text-violet-700",
  delivering: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

const label = computed(() => labels[props.status] || props.status || "—");
const badgeClass = computed(() => colors[props.status] || "bg-ink/10 text-ink");
</script>
