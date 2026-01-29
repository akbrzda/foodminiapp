<template>
  <input :class="classes" :value="modelValue" v-bind="attrs" @input="onInput" />
</template>
<script setup>
import { computed, useAttrs } from "vue";
import { cn } from "../../lib/utils.js";
const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  class: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);
const attrs = useAttrs();
const classes = computed(() =>
  cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
    props.class,
  ),
);
const onInput = (event) => {
  emit("update:modelValue", event.target.value);
};
</script>
