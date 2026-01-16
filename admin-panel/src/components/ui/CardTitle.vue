<template>
  <h3 :class="classes">
    <slot />
  </h3>
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  class: { type: String, default: "" },
});

const classes = computed(() => cn("text-lg font-semibold leading-none tracking-tight", props.class));
</script>
