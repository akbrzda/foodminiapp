<template>
  <div class="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
    <SidebarNav />
    <main class="flex flex-col gap-6 p-8">
      <TopBar :title="pageTitle" :subtitle="pageSubtitle" />
      <div class="flex-1">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import SidebarNav from "../components/SidebarNav.vue";
import TopBar from "../components/TopBar.vue";

const route = useRoute();

const pageTitle = computed(() => route.meta.title || "Админ-панель");
const pageSubtitle = computed(() => route.meta.subtitle || "Операционная панель");
</script>
