<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
    <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-card">
      <div class="flex items-start justify-between">
        <div>
          <p class="panel-title text-lg font-semibold text-ink">{{ title }}</p>
          <p v-if="subtitle" class="text-xs text-ink/60">{{ subtitle }}</p>
        </div>
        <button class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase tracking-widest" @click="$emit('close')">Закрыть</button>
      </div>
      <div class="mt-4">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

defineEmits(["close"]);
</script>
