<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useAuthStore } from "./stores/auth";
import { useCartStore } from "./stores/cart";
import { useLocationStore } from "./stores/location";
import { citiesAPI, userStateAPI } from "./api/endpoints";

const authStore = useAuthStore();
const cartStore = useCartStore();
const locationStore = useLocationStore();

const isHydrated = ref(false);
const lastSyncedPayload = ref("");
let syncTimer = null;

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
      console.error("Failed to sync user state:", error);
    }
  }, 600);
}

onMounted(() => {
  loadRemoteState();
});

watch(stateToSync, () => {
  if (!isHydrated.value) return;
  scheduleSync();
}, { deep: true });

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      loadRemoteState();
    } else {
      isHydrated.value = false;
    }
  }
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
  background: var(--color-background-secondary);
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
