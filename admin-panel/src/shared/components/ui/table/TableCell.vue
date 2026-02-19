<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <td
    :class="cn('p-3 align-middle text-sm sm:p-4 [&:has([role=checkbox])]:pr-0', props.class)"
  >
    <slot />
  </td>
</template>
