<script setup>
import { computed } from "vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/shared/components/ui/select";

const props = defineProps({
  modelValue: { type: Object, required: true },
  fields: { type: Array, default: () => [] },
  gridClass: { type: String, default: "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-12" },
  resetLabel: { type: String, default: "Сбросить" },
  showReset: { type: Boolean, default: true },
  resetColClass: { type: String, default: "sm:col-span-2 xl:col-span-12" },
  withCard: { type: Boolean, default: true },
});

const emit = defineEmits(["update:modelValue", "reset"]);

const normalizedFields = computed(() =>
  props.fields.map((field) => ({
    type: "text",
    ...field,
  })),
);

const resolveFieldClass = (field) => {
  if (field.colClass) return field.colClass;

  if (field.type === "text" && (field.key === "search" || String(field.key || "").includes("search"))) {
    return "space-y-1 sm:col-span-2 xl:col-span-4 2xl:col-span-3";
  }

  return "space-y-1 xl:col-span-2 xl:max-w-[320px]";
};

const defaultModelValue = computed(() => {
  const defaults = {};
  for (const field of normalizedFields.value) {
    defaults[field.key] = field.defaultValue ?? "";
  }
  return defaults;
});

const hasActiveFilters = computed(() => {
  for (const [key, defaultValue] of Object.entries(defaultModelValue.value)) {
    if ((props.modelValue?.[key] ?? "") !== defaultValue) {
      return true;
    }
  }
  return false;
});

const updateField = (key, value) => {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
};

const normalizeValue = (value) => String(value ?? "");
const isSearchField = (field) => field.type === "text" && (field.key === "search" || String(field.key || "").includes("search"));

const getTextPlaceholder = (field) => {
  if (isSearchField(field) && field.placeholder) return field.placeholder;
  return field.placeholder || field.label || "";
};

const findSelectedOption = (field) => {
  const currentValue = normalizeValue(props.modelValue?.[field.key]);
  return (field.options || []).find((option) => normalizeValue(option.value) === currentValue) || null;
};

const isAllLikeLabel = (label) => /^все\b/i.test(String(label || "").trim());

const getOptionLabel = (field, option, index = -1) => {
  if (index === 0 && isAllLikeLabel(option?.label)) return "Все";
  return option?.label || "—";
};

const isAllOptionSelected = (field) => {
  const selected = findSelectedOption(field);
  if (!selected) return false;
  const selectedIndex = (field.options || []).findIndex((option) => normalizeValue(option.value) === normalizeValue(selected.value));
  return selectedIndex === 0 && isAllLikeLabel(selected.label);
};

const shouldShowFieldLabelInTrigger = (field) => {
  if (field.type !== "select") return false;
  const selected = findSelectedOption(field);
  if (!selected) return true;
  return isAllOptionSelected(field);
};

const getSelectTriggerText = (field) => {
  const baseLabel = field.label || field.placeholder || "Выберите значение";
  const selected = findSelectedOption(field);
  if (!selected) return baseLabel;
  const selectedIndex = (field.options || []).findIndex((option) => normalizeValue(option.value) === normalizeValue(selected.value));
  return `${baseLabel}: ${getOptionLabel(field, selected, selectedIndex)}`;
};

const resetFilters = () => {
  const nextValue = { ...props.modelValue };
  for (const field of normalizedFields.value) {
    const defaultValue = field.defaultValue ?? "";
    nextValue[field.key] = defaultValue;
  }
  emit("update:modelValue", nextValue);
  emit("reset", nextValue);
};
</script>

<template>
  <Card v-if="withCard">
    <CardContent class="px-3 py-3 sm:px-4">
      <div :class="gridClass">
        <slot name="before" :model-value="modelValue" :update-field="updateField" :has-active-filters="hasActiveFilters" :reset-filters="resetFilters" />

        <div v-for="field in normalizedFields" :key="field.key" :class="resolveFieldClass(field)">
          <slot :name="`field-${field.key}`" :field="field" :value="modelValue[field.key]" :update-field="(value) => updateField(field.key, value)">
            <Input
              v-if="field.type === 'text'"
              :model-value="modelValue[field.key] ?? ''"
              :type="field.inputType || 'text'"
              :placeholder="getTextPlaceholder(field)"
              @update:model-value="(value) => updateField(field.key, value)"
            />

            <Select v-else-if="field.type === 'select'" :model-value="modelValue[field.key] ?? ''" @update:model-value="(value) => updateField(field.key, value)">
              <SelectTrigger class="w-full">
                <span class="truncate text-start" :class="shouldShowFieldLabelInTrigger(field) ? 'text-muted-foreground' : ''">
                  {{ getSelectTriggerText(field) }}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(option, index) in field.options || []" :key="`${field.key}-${option.value}`" :value="String(option.value)">
                  {{ getOptionLabel(field, option, index) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </slot>
        </div>

        <slot name="after" :model-value="modelValue" :update-field="updateField" :has-active-filters="hasActiveFilters" :reset-filters="resetFilters" />

        <div v-if="showReset && hasActiveFilters" class="flex justify-end" :class="resetColClass">
          <slot name="reset" :reset-filters="resetFilters" :has-active-filters="hasActiveFilters">
            <Button class="w-auto px-2 text-muted-foreground hover:text-foreground" size="sm" variant="ghost" @click="resetFilters">
              {{ resetLabel }}
            </Button>
          </slot>
        </div>
      </div>
    </CardContent>
  </Card>
  <div v-else :class="gridClass">
    <slot name="before" :model-value="modelValue" :update-field="updateField" :has-active-filters="hasActiveFilters" :reset-filters="resetFilters" />

    <div v-for="field in normalizedFields" :key="field.key" :class="resolveFieldClass(field)">
      <slot :name="`field-${field.key}`" :field="field" :value="modelValue[field.key]" :update-field="(value) => updateField(field.key, value)">
        <Input
          v-if="field.type === 'text'"
          :model-value="modelValue[field.key] ?? ''"
          :type="field.inputType || 'text'"
          :placeholder="getTextPlaceholder(field)"
          @update:model-value="(value) => updateField(field.key, value)"
        />

        <Select v-else-if="field.type === 'select'" :model-value="modelValue[field.key] ?? ''" @update:model-value="(value) => updateField(field.key, value)">
          <SelectTrigger class="w-full">
            <span class="truncate text-start" :class="shouldShowFieldLabelInTrigger(field) ? 'text-muted-foreground' : ''">
              {{ getSelectTriggerText(field) }}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="(option, index) in field.options || []" :key="`${field.key}-${option.value}`" :value="String(option.value)">
              {{ getOptionLabel(field, option, index) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </slot>
    </div>

    <slot name="after" :model-value="modelValue" :update-field="updateField" :has-active-filters="hasActiveFilters" :reset-filters="resetFilters" />

    <div v-if="showReset && hasActiveFilters" class="flex justify-end" :class="resetColClass">
      <slot name="reset" :reset-filters="resetFilters" :has-active-filters="hasActiveFilters">
        <Button class="w-auto px-2 text-muted-foreground hover:text-foreground" size="sm" variant="ghost" @click="resetFilters">
          {{ resetLabel }}
        </Button>
      </slot>
    </div>
  </div>
</template>
