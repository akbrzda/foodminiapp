import { defineStore } from "pinia";
import { getInitData } from "@/shared/services/telegram.js";

const SESSION_USER_KEY = "user";
const SESSION_HINT_KEY = "auth_session_hint";

const STORAGE_KEYS = [
  "cart",
  "cart_bonus_usage",
  "selectedCity",
  "selectedBranch",
  "selectedBranchByCity",
  "deliveryType",
  "deliveryAddress",
  "deliveryAddressByCity",
  "deliveryCoords",
  "deliveryCoordsByCity",
  "deliveryDetails",
  "deliveryDetailsByCity",
  "deliveryZone",
  "deliveryZoneByCity",
  "geo_permission_state",
];

const getApiBase = () => (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const readSessionUser = () => {
  const raw = sessionStorage.getItem(SESSION_USER_KEY) || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const fetchUserProfile = async () => {
  const response = await fetch(`${getApiBase()}/api/users/profile`, {
    method: "GET",
    headers: {
      Accept: "application/json; charset=utf-8",
    },
    credentials: "include",
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
};

const tryRefreshSession = async () => {
  const response = await fetch(`${getApiBase()}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json; charset=utf-8",
    },
    credentials: "include",
  });
  if (!response.ok) return false;
  const payload = await response.json();
  return payload?.ok === true;
};

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: readSessionUser(),
    isAuthenticated: Boolean(readSessionUser()),
    sessionChecked: false,
    verifySessionPromise: null,
  }),
  getters: {
    isLoggedIn: (state) => state.isAuthenticated,
    currentUser: (state) => state.user,
  },
  actions: {
    setUser(user) {
      this.user = user || null;
      this.isAuthenticated = Boolean(user);
      if (user) {
        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
        localStorage.setItem(SESSION_HINT_KEY, "1");
      } else {
        sessionStorage.removeItem(SESSION_USER_KEY);
      }
    },
    hasSessionHint() {
      return localStorage.getItem(SESSION_HINT_KEY) === "1";
    },
    clearPersistedSessionData({ clearAppState = false } = {}) {
      sessionStorage.removeItem(SESSION_USER_KEY);
      localStorage.removeItem(SESSION_HINT_KEY);

      if (clearAppState) {
        for (const key of STORAGE_KEYS) {
          localStorage.removeItem(key);
        }
      }
    },
    async verifySession() {
      if (this.verifySessionPromise) return this.verifySessionPromise;
      this.verifySessionPromise = (async () => {
        try {
          let user = await fetchUserProfile();
          if (!user) {
            const refreshed = await tryRefreshSession();
            if (refreshed) {
              user = await fetchUserProfile();
            }
          }
          if (!user && this.hasSessionHint()) {
            const reauthed = await this.loginWithTelegramInitData();
            if (reauthed) {
              user = this.user || (await fetchUserProfile());
            }
          }
          if (!user) {
            this.setUser(null);
            this.sessionChecked = true;
            return false;
          }
          this.setUser(user);
          this.sessionChecked = true;
          return true;
        } catch {
          await this.logout({ notifyServer: false, clearAppState: false });
          this.sessionChecked = true;
          return false;
        } finally {
          this.verifySessionPromise = null;
        }
      })();
      return this.verifySessionPromise;
    },
    async loginWithTelegramInitData() {
      const initData = getInitData();
      if (!initData) return false;
      const response = await fetch(`${getApiBase()}/api/auth/telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
        },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });
      if (!response.ok) return false;
      const payload = await response.json();
      this.setUser(payload?.user || null);
      return Boolean(payload?.user);
    },
    async logout({ notifyServer = true, clearAppState = true } = {}) {
      if (notifyServer) {
        try {
          await fetch(`${getApiBase()}/api/auth/logout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              Accept: "application/json; charset=utf-8",
            },
            credentials: "include",
          });
        } catch {
          // Ошибка logout на сервере не блокирует локальную очистку.
        }
      }
      this.user = null;
      this.isAuthenticated = false;
      this.sessionChecked = true;
      this.clearPersistedSessionData({ clearAppState });
    },
  },
});
