import { defineStore } from "pinia";

const SESSION_TOKEN_KEY = "token";
const SESSION_USER_KEY = "user";
const LEGACY_TOKEN_KEY = "token";
const LEGACY_USER_KEY = "user";
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
const SESSION_STORAGE_KEYS = ["tg_init_data", "tg_init_data_unsafe"];
const readSessionToken = () => sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || null;
const readSessionUser = () => {
  const raw = sessionStorage.getItem(SESSION_USER_KEY) || localStorage.getItem(LEGACY_USER_KEY) || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const migrateLegacyAuthState = () => {
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  const legacyUser = localStorage.getItem(LEGACY_USER_KEY);
  if (legacyToken && !sessionStorage.getItem(SESSION_TOKEN_KEY)) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, legacyToken);
  }
  if (legacyUser && !sessionStorage.getItem(SESSION_USER_KEY)) {
    sessionStorage.setItem(SESSION_USER_KEY, legacyUser);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
};
const clearAccessibleCookies = () => {
  if (typeof document === "undefined") return;
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const cookie of cookies) {
    const cookieName = cookie.split("=")[0]?.trim();
    if (!cookieName) continue;
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
  }
};
migrateLegacyAuthState();

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: readSessionToken(),
    user: readSessionUser(),
    isAuthenticated: !!readSessionToken(),
    sessionChecked: false,
  }),
  getters: {
    isLoggedIn: (state) => state.isAuthenticated,
    currentUser: (state) => state.user,
  },
  actions: {
    setToken(token) {
      this.token = token;
      this.isAuthenticated = !!token;
      if (token) {
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    },
    setUser(user) {
      this.user = user;
      if (user) {
        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(SESSION_USER_KEY);
      }
      localStorage.removeItem(LEGACY_USER_KEY);
    },
    clearPersistedSessionData() {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_USER_KEY);
      for (const key of STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
      for (const key of SESSION_STORAGE_KEYS) {
        sessionStorage.removeItem(key);
      }
      clearAccessibleCookies();
    },
    async verifySession() {
      if (!this.token) {
        this.sessionChecked = true;
        return false;
      }
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      try {
        const response = await fetch(`${apiBase}/api/users/profile`, {
          method: "GET",
          headers: {
            Accept: "application/json; charset=utf-8",
            Authorization: `Bearer ${this.token}`,
          },
          credentials: "include",
        });
        if (!response.ok) {
          await this.logout({ notifyServer: true });
          this.sessionChecked = true;
          return false;
        }
        const payload = await response.json();
        if (!payload?.user) {
          await this.logout({ notifyServer: true });
          this.sessionChecked = true;
          return false;
        }
        this.setUser(payload.user);
        this.sessionChecked = true;
        return true;
      } catch (error) {
        await this.logout({ notifyServer: true });
        this.sessionChecked = true;
        return false;
      }
    },
    async logout({ notifyServer = true } = {}) {
      const currentToken = this.token;
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      if (notifyServer) {
        try {
          await fetch(`${apiBase}/api/auth/logout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              Accept: "application/json; charset=utf-8",
              ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
            },
            credentials: "include",
          });
        } catch (error) {
          // Ошибка logout на сервере не блокирует локальную очистку.
        }
      }
      this.token = null;
      this.user = null;
      this.isAuthenticated = false;
      this.sessionChecked = true;
      this.clearPersistedSessionData();
    },
  },
});
