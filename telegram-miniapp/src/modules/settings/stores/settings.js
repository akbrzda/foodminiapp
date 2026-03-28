import { defineStore } from "pinia";
import { settingsAPI } from "@/shared/api/endpoints.js";
import { devError } from "@/shared/utils/logger.js";

const DEFAULT_SETTINGS = {
  bonuses_enabled: true,
  premiumbonus_enabled: false,
  orders_enabled: true,
  delivery_enabled: true,
  pickup_enabled: true,
  menu_badges_enabled: true,
  menu_cards_layout: "horizontal",
  site_currency: "RUB",
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
const normalizeMenuLayout = (value, fallback = "horizontal") => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "vertical" ? "vertical" : fallback;
};
const normalizeSiteCurrency = (value, fallback = "RUB") => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "UZBS") return "UZS";
  if (["RUB", "USD", "TJS", "KZT", "KGS", "UZS"].includes(normalized)) return normalized;
  return fallback;
};
const CURRENCY_SYMBOLS = {
  RUB: "₽",
  USD: "$",
  TJS: "TJS",
  KZT: "₸",
  KGS: "KGS",
  UZS: "UZS",
};

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    ...DEFAULT_SETTINGS,
    loaded: false,
  }),
  getters: {
    bonusesEnabled: (state) => state.bonuses_enabled || state.premiumbonus_enabled,
    premiumbonusEnabled: (state) => state.premiumbonus_enabled,
    ordersEnabled: (state) => state.orders_enabled,
    deliveryEnabled: (state) => state.delivery_enabled,
    pickupEnabled: (state) => state.pickup_enabled,
    menuBadgesEnabled: (state) => state.menu_badges_enabled,
    menuCardsLayout: (state) => state.menu_cards_layout,
    currencyCode: (state) => normalizeSiteCurrency(state.site_currency, "RUB"),
    currencySymbol: (state) => CURRENCY_SYMBOLS[normalizeSiteCurrency(state.site_currency, "RUB")] || "₽",
  },
  actions: {
    applySettings(settings) {
      const payload = settings || {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (payload[key] !== undefined) {
          if (typeof DEFAULT_SETTINGS[key] === "boolean") {
            this[key] = normalizeBoolean(payload[key], DEFAULT_SETTINGS[key]);
          } else if (key === "menu_cards_layout") {
            this[key] = normalizeMenuLayout(payload[key], DEFAULT_SETTINGS[key]);
          } else if (key === "site_currency") {
            this[key] = normalizeSiteCurrency(payload[key], DEFAULT_SETTINGS[key]);
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
        const systemResponse = await settingsAPI.getSettings();
        this.applySettings(systemResponse.data?.settings || {});
      } catch (error) {
        devError("Не удалось загрузить настройки:", error);
        this.applySettings({});
      }
    },
  },
});
