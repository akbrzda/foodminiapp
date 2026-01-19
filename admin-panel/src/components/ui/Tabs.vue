<template>
  <div class="space-y-4">
    <div class="flex gap-2 border-b border-border overflow-x-auto">
      <button
        v-for="(tab, index) in tabs"
        :key="index"
        @click="$emit('update:modelValue', index)"
        :class="[
          'px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
          modelValue === index ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        {{ tab }}
      </button>
    </div>
    <div>
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  tabs: {
    type: Array,
    required: true,
  },
  modelValue: {
    type: Number,
    default: 0,
  },
});

defineEmits(["update:modelValue"]);
</script>
