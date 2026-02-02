<template>
  <RouterView />
  <Toaster />
</template>
<script setup>
import { RouterView } from "vue-router";
import { Toaster } from "./components/ui/sonner";
import { useTheme } from "./composables/useTheme.js";

const { initTheme } = useTheme();
initTheme();
</script>
