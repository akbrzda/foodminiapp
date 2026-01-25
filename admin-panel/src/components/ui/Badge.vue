<template>
  <span class="badge" :class="variantClass" v-bind="$attrs">
    <slot />
  </span>
</template>
<script setup>
import { computed } from "vue";
defineOptions({ inheritAttrs: false });

const props = defineProps({
  variant: { type: String, default: "default" },
});

const variantClass = computed(() => {
  const map = {
    default: "badge--default",
    secondary: "badge--secondary",
    destructive: "badge--destructive",
    outline: "badge--outline",
  };
  return map[props.variant] || map.default;
});
</script>
<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  user-select: none;
  white-space: nowrap;
}
.badge--default {
  background: #111827;
  color: #ffffff;
}
.badge--secondary {
  background: #f3f4f6;
  color: #111827;
  border-color: #e5e7eb;
}
.badge--destructive {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}
.badge--outline {
  background: transparent;
  color: #111827;
  border-color: #d1d5db;
}
</style>
