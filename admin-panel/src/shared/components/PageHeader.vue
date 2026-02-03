<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div class="space-y-2">
        <div class="text-lg font-semibold text-foreground">{{ title }}</div>
        <div v-if="description" class="text-sm text-muted-foreground">{{ description }}</div>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.filters" class="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div class="flex flex-wrap items-end gap-3">
        <slot name="filters" />
      </div>
    </div>
  </div>
</template>
<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: "" },
});
</script>
