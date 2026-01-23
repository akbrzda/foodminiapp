<template>
  <span data-slot="badge" :class="classes" v-bind="attrs">
    <slot />
  </span>
</template>
<script setup>
import { computed, useAttrs } from "vue";
import { cn } from "../../lib/utils.js";
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const props = defineProps({
  variant: { type: String, default: "default" },
});

const variants = {
  default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
  outline: "text-foreground",
};

const classes = computed(() =>
  cn(
    "inline-flex w-fit items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    variants[props.variant] || variants.default,
    attrs.class,
  ),
);
</script>
