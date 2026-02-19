<template>
  <div class="h-dvh min-h-screen overflow-hidden bg-background text-foreground">
    <main class="h-full min-h-0">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterView } from "vue-router";
</script>
