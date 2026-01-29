<template>
  <div class="min-h-screen bg-background text-foreground">
    <main class="min-h-screen">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterView } from "vue-router";
</script>
