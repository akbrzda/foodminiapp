import { defineStore } from "pinia";
import { settingsAPI } from "../api/endpoints";

const DEFAULT_SETTINGS = {
  bonuses_enabled: true,
  orders_enabled: true,
  delivery_enabled: true,
  pickup_enabled: true,
  loyalty_level_1_name: "Бронза",
  loyalty_level_2_name: "Серебро",
  loyalty_level_3_name: "Золото",
  bonus_max_redeem_percent: 0.2,
  loyalty_level_1_redeem_percent: 0.2,
  loyalty_level_2_redeem_percent: 0.25,
  loyalty_level_3_redeem_percent: 0.3,
  loyalty_level_1_rate: 0.03,
  loyalty_level_2_rate: 0.05,
  loyalty_level_3_rate: 0.07,
  loyalty_level_2_threshold: 10000,
  loyalty_level_3_threshold: 20000,
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
const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
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
          if (typeof DEFAULT_SETTINGS[key] === "boolean") {
            this[key] = normalizeBoolean(payload[key], DEFAULT_SETTINGS[key]);
          } else if (typeof DEFAULT_SETTINGS[key] === "string") {
            this[key] = typeof payload[key] === "string" ? payload[key] : DEFAULT_SETTINGS[key];
          } else {
            this[key] = normalizeNumber(payload[key], DEFAULT_SETTINGS[key]);
          }
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
