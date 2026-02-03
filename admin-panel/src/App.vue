<template>
  <RouterView />
  <Toaster />
</template>
<script setup>
import { RouterView } from "vue-router";
import { Toaster } from "@/shared/components/ui/sonner";
import { useTheme } from "@/shared/composables/useTheme.js";

const { initTheme } = useTheme();
initTheme();
</script>
