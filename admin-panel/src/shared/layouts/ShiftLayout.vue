<template>
  <div class="h-dvh min-h-screen overflow-hidden bg-background text-foreground">
    <main v-if="authStore.isAuthenticated" class="h-full min-h-0">
      <RouterView />
    </main>
    <main v-else class="h-full min-h-0" aria-hidden="true"></main>
  </div>
</template>

<script setup>
import { RouterView } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth.js";

const authStore = useAuthStore();
</script>
