import { defineStore } from "pinia";
import { settingsAPI } from "../api/endpoints";

const DEFAULT_SETTINGS = {
  bonuses_enabled: true,
  orders_enabled: true,
  delivery_enabled: true,
  pickup_enabled: true,
};
const normalizeBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
};

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    ...DEFAULT_SETTINGS,
    loaded: false,
  }),
  getters: {
    bonusesEnabled: (state) => state.bonuses_enabled,
    ordersEnabled: (state) => state.orders_enabled,
    deliveryEnabled: (state) => state.delivery_enabled,
    pickupEnabled: (state) => state.pickup_enabled,
  },
  actions: {
    applySettings(settings) {
      const payload = settings || {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (payload[key] !== undefined) {
          this[key] = normalizeBoolean(payload[key], DEFAULT_SETTINGS[key]);
        } else {
          this[key] = DEFAULT_SETTINGS[key];
        }
      }
      this.loaded = true;
    },
    async loadSettings() {
      try {
        const response = await settingsAPI.getSettings();
        this.applySettings(response.data?.settings || {});
      } catch (error) {
        console.error("Failed to load settings:", error);
        this.applySettings({});
      }
    },
  },
});
