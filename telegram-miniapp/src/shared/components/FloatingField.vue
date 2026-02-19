<template>
  <div class="floating-input" :class="{ 'has-value': hasValue, 'is-focused': isFocused, 'is-floating': isFloating }">
    <label class="floating-label" :for="id">{{ label }}</label>
    <component
      :is="isTextarea ? 'textarea' : 'input'"
      :id="id"
      :name="name"
      :type="isTextarea ? undefined : type"
      :rows="isTextarea ? rows : undefined"
      :value="modelValue"
      :placeholder="currentPlaceholder"
      :disabled="disabled"
      :min="isTextarea ? undefined : min"
      :max="isTextarea ? undefined : max"
      :step="isTextarea ? undefined : step"
      :autocomplete="autocomplete"
      class="floating-control"
      :class="controlClass"
      v-bind="attrs"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <slot name="suffix" />
  </div>
</template>

<script setup>
import { computed, ref, useAttrs } from "vue";

const props = defineProps({
  modelValue: {
    default: "",
  },
  label: {
    type: String,
    required: true,
  },
  placeholder: {
    type: String,
    default: "",
  },
  id: {
    type: String,
    default: "",
  },
  name: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    default: "text",
  },
  as: {
    type: String,
    default: "input",
  },
  rows: {
    type: [String, Number],
    default: 4,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  min: {
    type: [String, Number],
    default: undefined,
  },
  max: {
    type: [String, Number],
    default: undefined,
  },
  step: {
    type: [String, Number],
    default: undefined,
  },
  autocomplete: {
    type: String,
    default: undefined,
  },
  number: {
    type: Boolean,
    default: false,
  },
  controlClass: {
    type: [String, Array, Object],
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "input", "focus", "blur"]);
const attrs = useAttrs();
const isFocused = ref(false);

const isTextarea = computed(() => props.as === "textarea");
const hasValue = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined) return false;
  return String(props.modelValue).trim().length > 0;
});
const isFloating = computed(() => hasValue.value || isFocused.value);
const currentPlaceholder = computed(() => (isFloating.value ? "" : props.placeholder));

const onInput = (event) => {
  const value = event?.target?.value ?? "";
  if (props.number) {
    emit("update:modelValue", value === "" ? "" : Number(value));
  } else {
    emit("update:modelValue", value);
  }
  emit("input", event);
};

const onFocus = (event) => {
  isFocused.value = true;
  emit("focus", event);
};

const onBlur = (event) => {
  isFocused.value = false;
  emit("blur", event);
};
</script>

<style scoped>
.floating-input {
  position: relative;
  width: 100%;
  max-width: 100%;
}

.floating-label {
  position: absolute;
  left: 14px;
  top: 8px;
  font-size: 12px;
  line-height: 1;
  color: var(--color-text-muted);
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity var(--transition-duration) var(--transition-easing),
    transform var(--transition-duration) var(--transition-easing);
}

.floating-input.is-floating .floating-label {
  opacity: 1;
  transform: translateY(0);
}

.floating-control {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  transition:
    padding-top var(--transition-duration) var(--transition-easing),
    padding-bottom var(--transition-duration) var(--transition-easing);
}

.floating-input:not(.is-floating) .floating-control {
  padding-top: 17px !important;
  padding-bottom: 17px !important;
}

.floating-input.is-floating .floating-control {
  padding-top: 26px !important;
  padding-bottom: 8px !important;
}

.floating-input.is-floating .floating-control::placeholder {
  color: transparent;
}

.floating-control[type="date"] {
  width: 100%;
  max-width: 100%;
  text-align: left !important;
  -webkit-appearance: none;
  appearance: none;
}

.floating-control[type="date"]::-webkit-date-and-time-value,
.floating-control[type="date"]::-webkit-datetime-edit {
  display: block;
  width: 100%;
  min-width: 0;
  text-align: left;
  padding: 0;
  margin: 0;
}
</style>
