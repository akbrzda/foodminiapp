<template>
  <div class="space-y-4">
    <div class="flex gap-2 border-b border-border">
      <button
        v-for="(tab, index) in tabs"
        :key="index"
        @click="emit('update:modelValue', index)"
        :class="[
          'px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
          modelValue === index ? 'tab-active relative text-primary' : 'text-muted-foreground hover:text-foreground',
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

const emit = defineEmits(["update:modelValue"]);
</script>
<style>
.tab-active::after {
  position: absolute;
  width: 100%;
  height: 1px;
  background: hsl(var(--primary));
  bottom: -1px;
  content: "";
  left: 0;
}
</style>
