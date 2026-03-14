<template>
  <div class="space-y-3">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div class="space-y-1.5">
        <div class="text-lg font-semibold text-foreground">{{ title }}</div>
        <div v-if="description" class="text-sm text-muted-foreground">{{ description }}</div>
      </div>
      <div v-if="$slots.actions" class="flex w-full flex-wrap items-center gap-2 md:w-auto">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.filters" class="rounded-xl border border-border bg-background p-2.5 sm:p-3">
      <div class="grid gap-2.5 sm:flex sm:flex-wrap sm:items-end sm:gap-2.5 [&>*]:w-full sm:[&>*]:w-auto">
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
