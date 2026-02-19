<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <div
    :class="
      cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-x-2 [&>button]:w-full sm:[&>button]:w-auto',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
