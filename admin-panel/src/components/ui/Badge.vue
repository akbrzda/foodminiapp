<template>
  <span :class="classes">
    <slot />
  </span>
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  variant: { type: String, default: "default" },
  class: { type: String, default: "" },
});

const variants = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  destructive: "bg-red-100 text-red-700",
};

const classes = computed(() =>
  cn(
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
    variants[props.variant] || variants.default,
    props.class
  )
);
</script>
