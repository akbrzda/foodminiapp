<template>
  <div :class="classes">
    <slot />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  class: { type: String, default: "" },
});

const classes = computed(() => cn("p-5 pt-0", props.class));
</script>
