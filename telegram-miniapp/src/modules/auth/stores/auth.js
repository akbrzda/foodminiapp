import { defineStore } from "pinia";
import { clearCsrfToken, setCsrfToken } from "@/shared/api/csrf.js";
import { LOCAL_STORAGE_KEYS, SESSION_STORAGE_KEYS } from "@/shared/constants/storage-keys.js";
import { getPlatformBridge, resolvePlatform } from "@/shared/platform/index.js";
import { telegramBridge } from "@/shared/platform/telegramBridge.js";
import { maxBridge } from "@/shared/platform/maxBridge.js";
import {
  readLocalString,
  readSessionJson,
  removeLocalItem,
  removeLocalItems,
  removeSessionItem,
  writeLocalString,
  writeSessionJson,
} from "@/shared/services/storage/web-storage.js";
import { devError, devWarn } from "@/shared/utils/logger.js";

const STORAGE_KEYS_TO_CLEAR = [
  LOCAL_STORAGE_KEYS.CART,
  LOCAL_STORAGE_KEYS.CART_BONUS_USAGE,
  LOCAL_STORAGE_KEYS.SELECTED_CITY,
  LOCAL_STORAGE_KEYS.SELECTED_BRANCH,
  LOCAL_STORAGE_KEYS.SELECTED_BRANCH_BY_CITY,
  LOCAL_STORAGE_KEYS.DELIVERY_TYPE,
  LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS,
  LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS_BY_CITY,
  LOCAL_STORAGE_KEYS.DELIVERY_COORDS,
  LOCAL_STORAGE_KEYS.DELIVERY_COORDS_BY_CITY,
  LOCAL_STORAGE_KEYS.DELIVERY_DETAILS,
  LOCAL_STORAGE_KEYS.DELIVERY_DETAILS_BY_CITY,
  LOCAL_STORAGE_KEYS.DELIVERY_ZONE,
  LOCAL_STORAGE_KEYS.DELIVERY_ZONE_BY_CITY,
  LOCAL_STORAGE_KEYS.GEO_PERMISSION_STATE,
];

const getApiBase = () =>
  (import.meta.env.VITE_API_URL || "").replace(/\/$/, "").replace(/\/api$/i, "");

const readSessionUser = () => readSessionJson(SESSION_STORAGE_KEYS.SESSION_USER, null);

const fetchUserProfile = async () => {
  const response = await fetch(`${getApiBase()}/api/users/profile`, {
    method: "GET",
    headers: {
      Accept: "application/json; charset=utf-8",
    },
    credentials: "include",
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload?.user || null;
};

const tryRefreshSession = async () => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json; charset=utf-8",
  };

  const response = await fetch(`${getApiBase()}/api/auth/refresh`, {
    method: "POST",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    return false;
  }

  const payload = await response.json();
  const nextCsrfToken = String(payload?.csrfToken || "").trim();
  if (nextCsrfToken) {
    setCsrfToken(nextCsrfToken);
  }

  return payload?.ok === true;
};

export const useAuthStore = defineStore("auth", {
  state: () => {
    const currentUser = readSessionUser();

    return {
      user: currentUser,
      isAuthenticated: Boolean(currentUser),
      sessionChecked: false,
      verifySessionPromise: null,
    };
  },
  getters: {
    isLoggedIn: (state) => state.isAuthenticated,
    currentUser: (state) => state.user,
  },
  actions: {
    setUser(user) {
      this.user = user || null;
      this.isAuthenticated = Boolean(user);

      if (user) {
        writeSessionJson(SESSION_STORAGE_KEYS.SESSION_USER, user);
        writeLocalString(LOCAL_STORAGE_KEYS.SESSION_HINT, "1");
        return;
      }

      removeSessionItem(SESSION_STORAGE_KEYS.SESSION_USER);
    },
    hasSessionHint() {
      return readLocalString(LOCAL_STORAGE_KEYS.SESSION_HINT, "") === "1";
    },
    clearPersistedSessionData({ clearAppState = false } = {}) {
      removeSessionItem(SESSION_STORAGE_KEYS.SESSION_USER);
      removeLocalItem(LOCAL_STORAGE_KEYS.SESSION_HINT);

      if (clearAppState) {
        removeLocalItems(STORAGE_KEYS_TO_CLEAR);
      }
    },
    async verifySession() {
      if (this.verifySessionPromise) {
        return this.verifySessionPromise;
      }

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
            const reauthed = await this.loginWithMiniAppInitData();
            if (reauthed?.ok) {
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
        } catch (error) {
          devError("Не удалось проверить сессию пользователя:", error);
          await this.logout({ notifyServer: false, clearAppState: false });
          this.sessionChecked = true;
          return false;
        } finally {
          this.verifySessionPromise = null;
        }
      })();

      return this.verifySessionPromise;
    },
    async loginWithMiniAppInitData({ phone } = {}) {
      const bridge = getPlatformBridge();
      bridge.init?.();
      let initData = String(bridge.getInitData() || "").trim();
      let platform = resolvePlatform();

      if (!initData) {
        telegramBridge.init?.();
        const telegramInitData = String(telegramBridge.getInitData() || "").trim();
        if (telegramInitData) {
          initData = telegramInitData;
          platform = "telegram";
        }
      }

      if (!initData) {
        maxBridge.init?.();
        const maxInitData = String(maxBridge.getInitData() || "").trim();
        if (maxInitData) {
          initData = maxInitData;
          platform = "max";
        }
      }

      if (!initData) {
        return {
          ok: false,
          phoneRequired: false,
          errorCode: "INIT_DATA_MISSING",
          errorMessage: "Не удалось получить данные Mini App",
        };
      }

      const headers = {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      };

      const response = await fetch(`${getApiBase()}/api/auth/miniapp`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          platform,
          initData,
          ...(phone ? { phone } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        return {
          ok: false,
          phoneRequired: payload?.code === "AUTH_PHONE_REQUIRED",
          errorCode: payload?.code || "AUTH_REQUEST_FAILED",
          errorMessage: String(payload?.error || "").trim(),
        };
      }

      const payload = await response.json();
      const nextCsrfToken = String(payload?.csrfToken || "").trim();
      if (nextCsrfToken) {
        setCsrfToken(nextCsrfToken);
      }

      this.setUser(payload?.user || null);
      return {
        ok: Boolean(payload?.user),
        phoneRequired: false,
        errorCode: null,
        errorMessage: "",
      };
    },
    async logout({ notifyServer = true, clearAppState = true } = {}) {
      if (notifyServer) {
        try {
          const headers = {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "application/json; charset=utf-8",
          };

          await fetch(`${getApiBase()}/api/auth/logout`, {
            method: "POST",
            headers,
            credentials: "include",
          });
        } catch (error) {
          devWarn("Ошибка logout на сервере, продолжаем локальную очистку:", error);
        }
      }

      clearCsrfToken();
      this.user = null;
      this.isAuthenticated = false;
      this.sessionChecked = true;
      this.clearPersistedSessionData({ clearAppState });
    },
  },
});
