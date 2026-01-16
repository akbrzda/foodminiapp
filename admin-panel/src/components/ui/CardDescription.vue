<template>
  <p :class="classes">
    <slot />
  </p>
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  class: { type: String, default: "" },
});

const classes = computed(() => cn("text-sm text-muted-foreground", props.class));
</script>
