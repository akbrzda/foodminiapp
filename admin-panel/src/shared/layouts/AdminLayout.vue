<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="flex min-h-screen overflow-x-clip">
      <SidebarNav v-if="!isMobile" class="flex" :is-open="true" :is-collapsed="sidebarCollapsed" />
      <div class="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar :title="pageTitle" :subtitle="pageSubtitle" @toggle-menu="handleSidebarToggle" />
        <main :class="mainClasses">
          <RouterView />
        </main>
      </div>
    </div>
    <Transition name="fade">
      <div v-if="isMobile && mobileMenuOpen" class="fixed inset-0 z-40 bg-black/40" @click="mobileMenuOpen = false"></div>
    </Transition>
    <Transition name="slide">
      <SidebarNav
        v-if="isMobile && mobileMenuOpen"
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
import SidebarNav from "@/shared/components/SidebarNav.vue";
import TopBar from "@/shared/components/TopBar.vue";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
const route = useRoute();
const authStore = useAuthStore();
const ordersStore = useOrdersStore();
const mobileMenuOpen = ref(false);
const sidebarCollapsed = ref(false);
const isMobile = ref(window.innerWidth < 1024);
const pageTitle = computed(() => route.meta.title || "Админ-панель");
const pageSubtitle = computed(() => route.meta.subtitle || "Операционная панель");
const mainClasses = computed(() =>
  route.meta.fullBleed ? "flex-1 min-w-0" : "flex-1 min-w-0 px-3 pb-8 pt-4 sm:px-4 sm:pt-5 lg:px-6 lg:pb-12 lg:pt-6",
);
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
const updateIsMobile = () => {
  isMobile.value = window.innerWidth < 1024;
};
const handleSidebarToggle = () => {
  if (isMobile.value) {
    mobileMenuOpen.value = !mobileMenuOpen.value;
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }
};
onMounted(() => {
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);
  if (authStore.token) {
    ordersStore.refreshNewOrdersCount();
    ordersStore.connectWebSocket();
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIsMobile);
  document.body.style.overflow = "";
  ordersStore.disconnectWebSocket();
});
watch(mobileMenuOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
});
watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
  },
);
watch(isMobile, (mobile) => {
  if (!mobile) {
    mobileMenuOpen.value = false;
  }
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
