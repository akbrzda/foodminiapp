<template>
  <Button :variant="variant" :size="size" :class="buttonClass" @click="$emit('click')">
    <ArrowLeft :size="16" />
    {{ label }}
  </Button>
</template>

<script setup>
import { ArrowLeft } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";

defineProps({
  label: { type: String, default: "Назад" },
  variant: { type: String, default: "outline" },
  size: { type: String, default: "sm" },
  buttonClass: { type: [String, Array, Object], default: "" },
});

defineEmits(["click"]);
</script>
