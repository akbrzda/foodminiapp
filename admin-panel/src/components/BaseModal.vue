<template>
  <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" @click.self="close">
    <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-soft">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="panel-title text-lg font-semibold text-foreground">{{ title }}</p>
          <p v-if="subtitle" class="text-xs text-muted-foreground">{{ subtitle }}</p>
        </div>
        <button class="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent" @click="close">
          <X :size="14" />
        </button>
      </div>
      <div class="mt-5">
        <slot />
      </div>
      <div v-if="$slots.footer" class="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps({
  open: { type: Boolean, default: null },
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

const emit = defineEmits(["update:open", "close"]);

const isOpen = computed(() => (props.open === null ? true : props.open));

const close = () => {
  emit("update:open", false);
  emit("close");
};
</script>
