<template>
  <tr :class="classes">
    <slot />
  </tr>
</template>
<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";
const props = defineProps({
  class: { type: String, default: "" },
});
const classes = computed(() => cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", props.class));
</script>
