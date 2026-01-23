<template>
  <div class="w-full overflow-auto">
    <table :class="classes">
      <slot />
    </table>
  </div>
</template>
<script setup>
import { computed } from "vue";
import { cn } from "../../lib/utils.js";
const props = defineProps({
  class: { type: String, default: "" },
});
const classes = computed(() => cn("w-full caption-bottom text-sm", props.class));
</script>
