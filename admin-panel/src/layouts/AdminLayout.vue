<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="flex">
      <aside class="sticky top-0 hidden h-screen w-72 border-r border-border/60 bg-card/80 backdrop-blur lg:flex">
        <SidebarNav />
      </aside>

      <div class="flex min-h-screen flex-1 flex-col">
        <TopBar :title="pageTitle" :subtitle="pageSubtitle" @toggle-menu="mobileMenuOpen = true" />

        <main class="flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-10">
          <RouterView />
        </main>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="mobileMenuOpen" class="fixed inset-0 z-40 bg-black/40" @click="mobileMenuOpen = false"></div>
    </Transition>
    <Transition name="slide">
      <aside
        v-if="mobileMenuOpen"
        class="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card/95 p-6 shadow-soft backdrop-blur lg:hidden"
      >
        <SidebarNav @navigate="mobileMenuOpen = false" />
      </aside>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import SidebarNav from "../components/SidebarNav.vue";
import TopBar from "../components/TopBar.vue";

const route = useRoute();
const mobileMenuOpen = ref(false);

const pageTitle = computed(() => route.meta.title || "Админ-панель");
const pageSubtitle = computed(() => route.meta.subtitle || "Операционная панель");
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
