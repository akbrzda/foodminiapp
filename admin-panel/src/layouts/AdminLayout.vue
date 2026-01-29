<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="flex min-h-screen">
      <SidebarNav class="hidden lg:flex" :is-open="true" :is-collapsed="sidebarCollapsed" @toggle-collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="flex min-h-screen flex-1 flex-col">
        <TopBar :title="pageTitle" :subtitle="pageSubtitle" @toggle-menu="mobileMenuOpen = true" />
        <main :class="mainClasses">
          <RouterView />
        </main>
      </div>
    </div>
    <Transition name="fade">
      <div v-if="mobileMenuOpen" class="fixed inset-0 z-40 bg-black/40" @click="mobileMenuOpen = false"></div>
    </Transition>
    <Transition name="slide">
      <SidebarNav
        v-if="mobileMenuOpen"
        class="lg:hidden"
        :is-open="mobileMenuOpen"
        :is-collapsed="false"
        @close="mobileMenuOpen = false"
        @navigate="mobileMenuOpen = false"
      />
    </Transition>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import SidebarNav from "../components/SidebarNav.vue";
import TopBar from "../components/TopBar.vue";
import { useAuthStore } from "../stores/auth.js";
import { useOrdersStore } from "../stores/orders.js";
const route = useRoute();
const authStore = useAuthStore();
const ordersStore = useOrdersStore();
const mobileMenuOpen = ref(false);
const sidebarCollapsed = ref(false);
const pageTitle = computed(() => route.meta.title || "Админ-панель");
const pageSubtitle = computed(() => route.meta.subtitle || "Операционная панель");
const mainClasses = computed(() => (route.meta.fullBleed ? "flex-1" : "flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-10"));
const syncDocumentTitle = () => {
  const baseTitle = pageTitle.value || "Админ-панель";
  const count = ordersStore.newOrdersCount;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const syncSidebarState = () => {
  if (Object.prototype.hasOwnProperty.call(route.meta, "sidebarCollapsed")) {
    sidebarCollapsed.value = Boolean(route.meta.sidebarCollapsed);
  } else {
    sidebarCollapsed.value = false;
  }
};
onMounted(() => {
  if (authStore.token) {
    ordersStore.refreshNewOrdersCount();
    ordersStore.connectWebSocket();
  }
});
onBeforeUnmount(() => {
  ordersStore.disconnectWebSocket();
});
watch(
  () => authStore.token,
  (token) => {
    if (token) {
      ordersStore.refreshNewOrdersCount();
      ordersStore.connectWebSocket();
    } else {
      ordersStore.disconnectWebSocket();
    }
  },
  { immediate: true },
);
watch(() => route.fullPath, syncSidebarState, { immediate: true });
watch([pageTitle, () => ordersStore.newOrdersCount], syncDocumentTitle, { immediate: true });
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
