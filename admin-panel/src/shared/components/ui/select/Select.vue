<script setup>
import { computed } from "vue";
import { SelectRoot } from "reka-ui";

const EMPTY_VALUE = "__empty__";

const props = defineProps({
  open: { type: Boolean, required: false, default: undefined },
  defaultOpen: { type: Boolean, required: false, default: undefined },
  defaultValue: { type: null, required: false },
  modelValue: { type: null, required: false },
  by: { type: [String, Function], required: false },
  dir: { type: String, required: false },
  multiple: { type: Boolean, required: false },
  autocomplete: { type: String, required: false },
  disabled: { type: Boolean, required: false },
  name: { type: String, required: false },
  required: { type: Boolean, required: false },
});

const emit = defineEmits(["update:modelValue", "update:open"]);

const internalModel = computed(() => (props.modelValue === "" ? EMPTY_VALUE : props.modelValue));
const internalDefault = computed(() => (props.defaultValue === "" ? EMPTY_VALUE : props.defaultValue));

const selectProps = computed(() => {
  const result = {
    by: props.by,
    dir: props.dir,
    multiple: props.multiple,
    autocomplete: props.autocomplete,
    disabled: props.disabled,
    name: props.name,
    required: props.required,
  };

  if (props.open !== undefined) result.open = props.open;
  if (props.defaultOpen !== undefined) result.defaultOpen = props.defaultOpen;
  if (props.modelValue !== undefined) result.modelValue = internalModel.value;
  if (props.defaultValue !== undefined) result.defaultValue = internalDefault.value;

  return result;
});

const handleUpdateModel = (value) => {
  emit("update:modelValue", value === EMPTY_VALUE ? "" : value);
};
</script>

<template>
  <SelectRoot v-bind="selectProps" @update:open="(value) => emit('update:open', value)" @update:modelValue="handleUpdateModel">
    <slot />
  </SelectRoot>
</template>
