<template>
<<<<<<< ours
<<<<<<< ours
  <select :class="classes" :value="modelValue" v-bind="attrs" @change="onChange">
    <slot />
  </select>
=======
  <div class="relative w-full">
    <select :class="classes" :value="modelValue" v-bind="attrs" @change="onChange">
      <slot />
    </select>
    <ChevronDown class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
  </div>
>>>>>>> theirs
=======
  <select :class="classes" :value="modelValue" v-bind="attrs" @change="onChange">
    <slot />
  </select>
>>>>>>> theirs
</template>

<script setup>
import { computed, useAttrs } from "vue";
<<<<<<< ours
<<<<<<< ours
=======
import { ChevronDown } from "lucide-vue-next";
>>>>>>> theirs
=======
>>>>>>> theirs
import { cn } from "../../lib/utils.js";

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: "" },
  class: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "change"]);
const attrs = useAttrs();

const classes = computed(() =>
  cn(
<<<<<<< ours
<<<<<<< ours
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
=======
    "flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
>>>>>>> theirs
=======
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
>>>>>>> theirs
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
