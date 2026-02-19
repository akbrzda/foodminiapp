<script setup>
import { reactiveOmit } from "@vueuse/core";
import { computed } from "vue";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-vue-next";
import { Toaster as Sonner } from "vue-sonner";

const props = defineProps({
  id: { type: String, required: false },
  invert: { type: Boolean, required: false },
  theme: { type: String, required: false },
  position: { type: String, required: false },
  closeButtonPosition: { type: String, required: false },
  hotkey: { type: Array, required: false },
  richColors: { type: Boolean, required: false },
  expand: { type: Boolean, required: false },
  duration: { type: Number, required: false },
  gap: { type: Number, required: false },
  visibleToasts: { type: Number, required: false },
  closeButton: { type: Boolean, required: false },
  toastOptions: { type: Object, required: false },
  class: { type: String, required: false },
  style: { type: Object, required: false },
  offset: { type: [Object, String, Number], required: false },
  mobileOffset: { type: [Object, String, Number], required: false },
  dir: { type: String, required: false },
  swipeDirections: { type: Array, required: false },
  icons: { type: Object, required: false },
  containerAriaLabel: { type: String, required: false },
});
const delegatedProps = reactiveOmit(props, "toastOptions");
const toasterPosition = computed(() => props.position || "top-right");
const toasterOffset = computed(() => props.offset ?? "16px");
const toasterMobileOffset = computed(() => props.mobileOffset ?? "12px");
const mergedToastOptions = computed(() => {
  const userOptions = props.toastOptions || {};
  const userClasses = userOptions.classes || {};

  return {
    ...userOptions,
    classes: {
      toast:
        "group toast w-[calc(100vw-1rem)] rounded-lg group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg sm:w-auto",
      title: "text-sm leading-5",
      description: "group-[.toast]:text-muted-foreground text-xs leading-4 sm:text-sm",
      actionButton: "w-full justify-center group-[.toast]:bg-primary group-[.toast]:text-primary-foreground sm:w-auto",
      cancelButton: "w-full justify-center group-[.toast]:bg-muted group-[.toast]:text-muted-foreground sm:w-auto",
      ...userClasses,
    },
  };
});
</script>

<template>
  <Sonner
    class="toaster group z-[200]"
    :position="toasterPosition"
    :offset="toasterOffset"
    :mobile-offset="toasterMobileOffset"
    :toast-options="mergedToastOptions"
    v-bind="delegatedProps"
  >
    <template #success-icon>
      <CircleCheckIcon class="size-4" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-4" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-4" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-4" />
    </template>
    <template #loading-icon>
      <div>
        <Loader2Icon class="size-4 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <XIcon class="size-4" />
    </template>
  </Sonner>
</template>
