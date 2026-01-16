<template>
  <th :class="classes">
    <slot />
  </th>
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  class: { type: String, default: "" },
});

const classes = computed(() =>
  cn(
    "h-11 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
    props.class
  )
);
</script>
