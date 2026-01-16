<template>
  <td :class="classes">
    <slot />
  </td>
</template>

<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  class: { type: String, default: "" },
});

const classes = computed(() => cn("p-3 align-middle", props.class));
</script>
