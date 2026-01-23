<template>
  <Teleport to="body">
    <div class="fixed right-4 top-4 z-[9999] flex w-[320px] flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toastItem in toasts"
          :key="toastItem.id"
          :class="['flex items-start gap-3 rounded-lg border p-4 shadow-soft', variantClasses[toastItem.variant] || variantClasses.default]"
        >
          <div class="flex-1">
            <div class="text-sm font-semibold">{{ toastItem.title }}</div>
            <div v-if="toastItem.description" class="mt-1 text-xs text-muted-foreground">{{ toastItem.description }}</div>
          </div>
          <button class="text-xs text-muted-foreground hover:text-foreground" @click="dismiss(toastItem.id)">Закрыть</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
<script setup>
import { TransitionGroup } from "vue";
import { useToast } from "../composables/useToast.js";
const { toasts, dismiss } = useToast();
const variantClasses = {
  default: "border-border bg-background text-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
};
</script>
<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
