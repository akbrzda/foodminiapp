<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <div class="relative w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
    <table :class="cn('w-full min-w-[560px] caption-bottom text-sm sm:min-w-full', props.class)">
      <slot />
    </table>
  </div>
</template>
