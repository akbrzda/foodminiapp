<template>
  <div id="app">
    <router-view />
  </div>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useLoyaltyStore } from "@/modules/loyalty/stores/loyalty.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { citiesAPI, userStateAPI } from "@/shared/api/endpoints.js";
import { wsService } from "@/shared/services/websocket.js";
import { getWebApp, isDesktop } from "@/shared/services/telegram.js";
import { devLog } from "@/shared/utils/logger.js";
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const loyaltyStore = useLoyaltyStore();
const locationStore = useLocationStore();
const settingsStore = useSettingsStore();
const isHydrated = ref(false);
const lastSyncedPayload = ref("");
let syncTimer = null;
let blurListenersAttached = false;
let blurScrollHandler = null;
let blurTouchHandler = null;
let viewportChangedHandler = null;
let resizeHandler = null;
let appOrderStatusHandler = null;
let appBonusHandler = null;
let stopAuthTokenWatch = null;
const stateToSync = computed(() => ({
  selected_city_id: locationStore.selectedCity?.id || null,
  selected_branch_id: locationStore.selectedBranch?.id || null,
  delivery_type: locationStore.deliveryType || "delivery",
  delivery_address: locationStore.deliveryAddress || "",
  delivery_coords: locationStore.deliveryCoords || null,
  delivery_details: locationStore.deliveryDetails || null,
  cart: cartStore.items || [],
}));
async function loadRemoteState() {
  if (!authStore.isAuthenticated) return;
  try {
    const response = await userStateAPI.getState();
    const state = response.data?.state;
    if (!state) {
      isHydrated.value = true;
      return;
    }
    if (state.selected_city_id && (!locationStore.selectedCity || locationStore.selectedCity.id !== state.selected_city_id)) {
      const citiesResponse = await citiesAPI.getCities();
      const city = (citiesResponse.data.cities || []).find((c) => c.id === state.selected_city_id);
      if (city) {
        locationStore.setCity(city);
      }
    }
    if (state.selected_branch_id && state.selected_city_id) {
      const branchesResponse = await citiesAPI.getBranches(state.selected_city_id);
      const branch = (branchesResponse.data.branches || []).find((b) => b.id === state.selected_branch_id);
      if (branch) {
        locationStore.setBranch(branch);
      }
    }
    if (state.delivery_type) {
      locationStore.setDeliveryType(state.delivery_type);
    }
    if (state.delivery_address !== undefined) {
      locationStore.setDeliveryAddress(state.delivery_address || "");
    }
    if (state.delivery_coords !== undefined) {
      locationStore.setDeliveryCoords(state.delivery_coords || null);
    }
    if (state.delivery_details !== undefined) {
      locationStore.setDeliveryDetails(state.delivery_details || null);
    }
    if (Array.isArray(state.cart)) {
      cartStore.replaceItems(state.cart);
    }
    lastSyncedPayload.value = JSON.stringify(stateToSync.value);
  } catch (error) {
    console.error("Не удалось загрузить состояние пользователя:", error);
  } finally {
    isHydrated.value = true;
  }
}
function scheduleSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(async () => {
    if (!authStore.isAuthenticated || !isHydrated.value) return;
    const payload = stateToSync.value;
    const payloadString = JSON.stringify(payload);
    if (payloadString === lastSyncedPayload.value) return;
    try {
      await userStateAPI.updateState(payload);
      lastSyncedPayload.value = payloadString;
    } catch (error) {
      console.error("Не удалось синхронизировать состояние пользователя:", error);
    }
  }, 600);
}
onMounted(async () => {
  const isSessionValid = await authStore.verifySession();
  if (!isSessionValid && router.currentRoute.value.meta?.requiresAuth) {
    await router.replace("/login");
  }
  await settingsStore.loadSettings();
  if (settingsStore.bonusesEnabled && authStore.isAuthenticated) {
    await loyaltyStore.refreshFromProfile();
  }
  applyDeliveryTypeSettings();
  try {
    await loadRemoteState();
  } catch (error) {
    console.error("Не удалось инициализировать состояние приложения:", error);
  }
  applyDeliveryTypeSettings();
  setupWebSocket();
  attachBlurListeners();
  attachRuntimeLayoutClasses();
});
onUnmounted(() => {
  wsService.disconnect();
  if (appOrderStatusHandler) {
    wsService.off("order-status-updated", appOrderStatusHandler);
    appOrderStatusHandler = null;
  }
  if (appBonusHandler) {
    wsService.off("bonus-updated", appBonusHandler);
    appBonusHandler = null;
  }
  if (stopAuthTokenWatch) {
    stopAuthTokenWatch();
    stopAuthTokenWatch = null;
  }
  detachBlurListeners();
  detachRuntimeLayoutClasses();
});
function setupWebSocket() {
  if (authStore.isAuthenticated) {
    wsService.connect();
  }
  if (!appOrderStatusHandler) {
    appOrderStatusHandler = (data) => {
      devLog("Order status updated:", data);
    };
    wsService.on("order-status-updated", appOrderStatusHandler);
  }
  if (!appBonusHandler) {
    appBonusHandler = (data) => {
      devLog("Bonus updated:", data);
    };
    wsService.on("bonus-updated", appBonusHandler);
  }
  if (!stopAuthTokenWatch) {
    stopAuthTokenWatch = watch(
      () => authStore.isAuthenticated,
      (isAuthenticated) => {
        if (isAuthenticated) {
          wsService.connect();
        } else {
          wsService.disconnect();
        }
      },
    );
  }
}
function getStatusText(status) {
  const statuses = {
    pending: "Ожидает подтверждения",
    confirmed: "Подтверждён",
    preparing: "Готовится",
    ready: "Готов к выдаче",
    delivering: "В пути",
    completed: "Доставлен",
    cancelled: "Отменён",
  };
  return statuses[status] || status;
}
function shouldBlurOnEvent(event) {
  const target = event?.target;
  if (!target) return true;
  if (target.closest?.("[data-keep-focus='true']")) {
    return false;
  }
  const isEditable = target.closest?.("input, textarea, [contenteditable='true']");
  return !isEditable;
}
function blurActiveElement() {
  const active = document.activeElement;
  if (!active) return;
  if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable) {
    active.blur();
  }
}
function attachBlurListeners() {
  if (blurListenersAttached || typeof window === "undefined") return;
  const handleScroll = () => {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
      return;
    }
    blurActiveElement();
  };
  window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
  blurScrollHandler = handleScroll;
  blurListenersAttached = true;
}
function detachBlurListeners() {
  if (!blurListenersAttached || typeof window === "undefined") return;
  if (blurScrollHandler) {
    window.removeEventListener("scroll", blurScrollHandler, { capture: true });
  }
  blurTouchHandler = null;
  blurScrollHandler = null;
  blurListenersAttached = false;
}
function applyDeliveryTypeSettings() {
  if (!settingsStore.ordersEnabled) return;
  if (settingsStore.deliveryEnabled && settingsStore.pickupEnabled) return;
  if (!settingsStore.deliveryEnabled && settingsStore.pickupEnabled) {
    if (locationStore.deliveryType === "delivery") {
      locationStore.setDeliveryType("pickup");
    }
  } else if (settingsStore.deliveryEnabled && !settingsStore.pickupEnabled) {
    if (locationStore.deliveryType === "pickup") {
      locationStore.setDeliveryType("delivery");
    }
  }
}

function syncRuntimeLayoutClasses() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const body = document.body;
  const webApp = getWebApp();
  const desktopMode = webApp ? isDesktop() : window.matchMedia("(min-width: 768px)").matches;
  const expandedMode = typeof webApp?.isExpanded === "boolean" ? webApp.isExpanded : false;
  const fullscreenMode = typeof webApp?.isFullscreen === "boolean" ? webApp.isFullscreen : false;
  const fullsizeMode = expandedMode && !fullscreenMode;

  const targets = [root, body];
  for (const target of targets) {
    target.classList.toggle("desktop", desktopMode);
    target.classList.toggle("mobile", !desktopMode);
    target.classList.toggle("fullsize", fullsizeMode);
    target.classList.toggle("fullscreen", fullscreenMode);
  }
}

function attachRuntimeLayoutClasses() {
  if (typeof window === "undefined") return;
  syncRuntimeLayoutClasses();
  viewportChangedHandler = () => syncRuntimeLayoutClasses();
  resizeHandler = () => syncRuntimeLayoutClasses();
  window.addEventListener("telegram-viewport-changed", viewportChangedHandler);
  window.addEventListener("resize", resizeHandler, { passive: true });
}

function detachRuntimeLayoutClasses() {
  if (typeof window === "undefined") return;
  if (viewportChangedHandler) {
    window.removeEventListener("telegram-viewport-changed", viewportChangedHandler);
  }
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }
  viewportChangedHandler = null;
  resizeHandler = null;
}
watch(
  stateToSync,
  () => {
    if (!isHydrated.value) return;
    scheduleSync();
  },
  { deep: true },
);
watch(
  () => [settingsStore.ordersEnabled, settingsStore.deliveryEnabled, settingsStore.pickupEnabled],
  () => {
    applyDeliveryTypeSettings();
  },
);
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      loadRemoteState();
    } else {
      isHydrated.value = false;
    }
  },
);
</script>
<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: var(--font-family);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--color-background);
}
#app {
  width: 100%;
  min-height: 100vh;
}
button {
  font-family: inherit;
}
/* Скрываем скроллбар, но оставляем функциональность */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
</style>
