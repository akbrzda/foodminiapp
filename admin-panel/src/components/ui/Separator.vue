<template>
  <div :class="classes" />
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  orientation: { type: String, default: "horizontal" },
  class: { type: String, default: "" },
});

const classes = computed(() =>
  cn(
    props.orientation === "vertical" ? "h-full w-px" : "h-px w-full",
    "bg-border",
    props.class
  )
);
</script>
