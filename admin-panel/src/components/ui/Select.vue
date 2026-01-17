<template>
  <select :class="classes" :value="modelValue" v-bind="attrs" @change="onChange">
    <slot />
  </select>
</template>

<script setup>
import { computed, useAttrs } from "vue";
import { cn } from "../../lib/utils.js";

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: "" },
  class: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "change"]);
const attrs = useAttrs();

const classes = computed(() =>
  cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    props.class
  )
);

const onChange = (event) => {
  const option = event.target.selectedOptions?.[0];
  const value = option && option._value !== undefined ? option._value : event.target.value;
  emit("update:modelValue", value);
  emit("change", value);
};
</script>
