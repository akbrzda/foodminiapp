<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <div data-slot="field-group" :class="cn('group/field-group @container/field-group flex w-full flex-col gap-3', props.class)">
    <slot />
  </div>
</template>
