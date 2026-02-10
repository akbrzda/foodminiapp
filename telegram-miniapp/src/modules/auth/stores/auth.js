import { defineStore } from "pinia";
import { getInitData, getCloudStorageItem, setCloudStorageItem, removeCloudStorageItem } from "@/shared/services/telegram.js";

const ACCESS_TOKEN_KEY = "access_token";
const SESSION_USER_KEY = "user";
const SESSION_HINT_KEY = "auth_session_hint";
const CLOUD_ACCESS_TOKEN_KEY = "miniapp_access_token";
const CLOUD_SESSION_HINT_KEY = "miniapp_session_hint";

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
const SESSION_STORAGE_KEYS = [];

const getApiBase = () => (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const parseJwtPayload = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4 || 4)) % 4), "=");
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const isTokenExpired = (token) => {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() >= payload.exp * 1000;
};

const readSessionUser = () => {
  const raw = sessionStorage.getItem(SESSION_USER_KEY) || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readPersistedAccessToken = () => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;
  if (isTokenExpired(token)) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    return null;
  }
  return token;
};

const migrateLegacyAuthState = () => {
  const legacyUser = localStorage.getItem("user");
  if (legacyUser && !sessionStorage.getItem(SESSION_USER_KEY)) {
    sessionStorage.setItem(SESSION_USER_KEY, legacyUser);
  }
  const legacyToken = localStorage.getItem("token");
  if (legacyToken && !localStorage.getItem(ACCESS_TOKEN_KEY) && !isTokenExpired(legacyToken)) {
    localStorage.setItem(ACCESS_TOKEN_KEY, legacyToken);
  }
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

const fetchUserProfile = async (token) => {
  if (!token) return null;
  const response = await fetch(`${getApiBase()}/api/users/profile`, {
    method: "GET",
    headers: {
      Accept: "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
};

const tryRefreshSessionToken = async () => {
  const refreshResponse = await fetch(`${getApiBase()}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json; charset=utf-8",
    },
    credentials: "include",
  });
  if (!refreshResponse.ok) return null;
  const refreshPayload = await refreshResponse.json();
  return refreshPayload?.token || null;
};

migrateLegacyAuthState();
const initialToken = readPersistedAccessToken();

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: initialToken,
    user: readSessionUser(),
    isAuthenticated: !!initialToken,
    sessionChecked: false,
    verifySessionPromise: null,
  }),
  getters: {
    isLoggedIn: (state) => state.isAuthenticated,
    currentUser: (state) => state.user,
  },
  actions: {
    async restoreTokenFromStorage() {
      if (this.token && !isTokenExpired(this.token)) {
        return this.token;
      }
      const localToken = readPersistedAccessToken();
      if (localToken) {
        this.token = localToken;
        this.isAuthenticated = true;
        return localToken;
      }
      const cloudToken = await getCloudStorageItem(CLOUD_ACCESS_TOKEN_KEY);
      if (cloudToken && !isTokenExpired(cloudToken)) {
        localStorage.setItem(ACCESS_TOKEN_KEY, cloudToken);
        this.token = cloudToken;
        this.isAuthenticated = true;
        return cloudToken;
      }
      return null;
    },
    setToken(token) {
      this.token = token || null;
      this.isAuthenticated = !!token;

      if (token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
        setCloudStorageItem(CLOUD_ACCESS_TOKEN_KEY, token).catch(() => {});
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        removeCloudStorageItem(CLOUD_ACCESS_TOKEN_KEY).catch(() => {});
      }
    },
    setUser(user) {
      this.user = user || null;
      if (user) {
        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
        localStorage.setItem(SESSION_HINT_KEY, "1");
        setCloudStorageItem(CLOUD_SESSION_HINT_KEY, "1").catch(() => {});
      } else {
        sessionStorage.removeItem(SESSION_USER_KEY);
      }
    },
    async hasSessionHint() {
      if (localStorage.getItem(SESSION_HINT_KEY) === "1") {
        return true;
      }
      const cloudHint = await getCloudStorageItem(CLOUD_SESSION_HINT_KEY);
      if (cloudHint === "1") {
        localStorage.setItem(SESSION_HINT_KEY, "1");
        return true;
      }
      return false;
    },
    clearPersistedSessionData({ clearAppState = false } = {}) {
      sessionStorage.removeItem(SESSION_USER_KEY);
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(SESSION_HINT_KEY);
      removeCloudStorageItem(CLOUD_ACCESS_TOKEN_KEY).catch(() => {});
      removeCloudStorageItem(CLOUD_SESSION_HINT_KEY).catch(() => {});

      if (clearAppState) {
        for (const key of STORAGE_KEYS) {
          localStorage.removeItem(key);
        }
        for (const key of SESSION_STORAGE_KEYS) {
          sessionStorage.removeItem(key);
        }
      }
    },
    async verifySession() {
      if (this.verifySessionPromise) return this.verifySessionPromise;

      this.verifySessionPromise = (async () => {
        try {
          let token = await this.restoreTokenFromStorage();
          let user = token ? await fetchUserProfile(token) : null;

          if (!user) {
            const refreshedToken = await tryRefreshSessionToken();
            if (refreshedToken) {
              token = refreshedToken;
              this.setToken(refreshedToken);
              user = await fetchUserProfile(refreshedToken);
            }
          }

          // Для ранее авторизованных пользователей используем тихий fallback через initData.
          if (!user) {
            const hadSession = await this.hasSessionHint();
            if (hadSession) {
              const reauthed = await this.loginWithTelegramInitData();
              if (reauthed) {
                token = this.token;
                user = this.user || (token ? await fetchUserProfile(token) : null);
              }
            }
          }

          if (!user) {
            this.setToken(null);
            this.setUser(null);
            this.isAuthenticated = false;
            this.sessionChecked = true;
            return false;
          }

          this.setUser(user);
          this.isAuthenticated = true;
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
      if (!payload?.token) return false;

      this.setToken(payload.token);
      this.setUser(payload.user || null);
      this.isAuthenticated = true;
      return true;
    },
    async logout({ notifyServer = true, clearAppState = true } = {}) {
      const currentToken = this.token;
      const apiBase = getApiBase();

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
        } catch {
          // Ошибка logout на сервере не блокирует локальную очистку.
        }
      }

      this.token = null;
      this.user = null;
      this.isAuthenticated = false;
      this.sessionChecked = true;
      this.clearPersistedSessionData({ clearAppState });
    },
  },
});
