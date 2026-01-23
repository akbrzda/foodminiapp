<template>
  <button :class="classes" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>
<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";
const props = defineProps({
  variant: { type: String, default: "default" },
  size: { type: String, default: "default" },
  type: { type: String, default: "button" },
  disabled: { type: Boolean, default: false },
  class: { type: String, default: "" },
});
const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60";
const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  link: "text-primary underline-offset-4 hover:underline",
};
const sizes = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-6",
  icon: "h-9 w-9",
  "icon-sm": "h-7 w-7",
};
const classes = computed(() => cn(base, variants[props.variant], sizes[props.size], props.class));
</script>
