<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <h3 :class="cn('text-xl font-semibold leading-none tracking-tight', props.class)">
    <slot />
  </h3>
</template>
