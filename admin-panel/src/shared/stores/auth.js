import { defineStore } from "pinia";
import api from "@/shared/api/client.js";
import { clearCsrfToken } from "@/shared/api/csrf.js";

const STORAGE_USER = "admin_user";
const LEGACY_STORAGE_USER = "admin_user";
const AUTH_SYNC_KEY = "admin_auth_sync_event";
let crossTabSyncAttached = false;
const LOGOUT_SERVER_TIMEOUT_MS = 1500;

const LOGIN_ERROR_MAP = {
  "Invalid credentials": "Неверный email или пароль.",
  "Account is disabled": "Аккаунт отключен. Обратитесь к администратору.",
  "Email and password are required": "Введите email и пароль.",
};

const getLoginErrorMessage = (error) => {
  const response = error?.response;
  const status = response?.status;
  const backendError = String(response?.data?.error || "").trim();
  const normalizedCode = String(error?.code || "").toUpperCase();
  const normalizedMessage = String(error?.message || "").toLowerCase();

  if (!response) {
    if (normalizedCode === "ECONNABORTED" || normalizedMessage.includes("timeout")) {
      return "Сервер долго не отвечает. Попробуйте снова.";
    }
    return "Сервер недоступен. Проверьте подключение и повторите попытку.";
  }

  if (LOGIN_ERROR_MAP[backendError]) {
    return LOGIN_ERROR_MAP[backendError];
  }
  if (status === 401) {
    return "Неверный email или пароль.";
  }
  if (status === 403) {
    return "Доступ запрещен. Обратитесь к администратору.";
  }
  if (status >= 500) {
    return "Ошибка на сервере. Попробуйте позже.";
  }
  return backendError || "Не удалось выполнить вход. Попробуйте снова.";
};

const readSessionUser = () => {
  const raw =
    sessionStorage.getItem(STORAGE_USER) || localStorage.getItem(LEGACY_STORAGE_USER) || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const notifyServerLogout = async (apiBase) => {
  try {
    await Promise.race([
      fetch(`${apiBase}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
        },
        credentials: "include",
        keepalive: true,
      }),
      wait(LOGOUT_SERVER_TIMEOUT_MS),
    ]);
  } catch {
    // Ошибка server-logout не должна влиять на уже завершенный локальный logout.
  }
};

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: readSessionUser(),
    loading: false,
    error: "",
    sessionChecked: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    role: (state) => state.user?.role || "",
    scopeRole: (state) => state.user?.scope_role || state.user?.role || "",
    permissions: (state) => (Array.isArray(state.user?.permissions) ? state.user.permissions : []),
    hasPermission: (state) => (permissionCode) => {
      if (!permissionCode) return true;
      const permissions = Array.isArray(state.user?.permissions) ? state.user.permissions : [];
      if (permissions.includes(permissionCode)) return true;

      // Backward compatibility для сессий без permissions.
      const scopeRole = state.user?.scope_role || state.user?.role;
      if (permissions.length === 0 && ["admin", "ceo"].includes(scopeRole)) {
        return true;
      }
      return false;
    },
    hasAnyPermission() {
      return (permissionCodes = []) => {
        if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) return true;
        return permissionCodes.some((permissionCode) => this.hasPermission(permissionCode));
      };
    },
  },
  actions: {
    syncAuthEvent(payload) {
      try {
        localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
        localStorage.removeItem(AUTH_SYNC_KEY);
      } catch {
        // Игнорируем ошибки синхронизации между вкладками.
      }
    },
    applySession(user) {
      this.user = user || null;
      if (user) {
        sessionStorage.setItem(STORAGE_USER, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(STORAGE_USER);
      }
      localStorage.removeItem(LEGACY_STORAGE_USER);
      this.sessionChecked = true;
    },
    initCrossTabSync({ onLogin, onLogout } = {}) {
      if (crossTabSyncAttached || typeof window === "undefined") return;
      const handler = (event) => {
        if (event.key !== AUTH_SYNC_KEY || !event.newValue) return;
        try {
          const payload = JSON.parse(event.newValue);
          if (payload?.type === "login" && payload.user) {
            this.applySession(payload.user);
            if (typeof onLogin === "function") {
              onLogin(payload);
            }
            return;
          }
          if (payload?.type === "logout") {
            void this.logout({ notifyServer: false, sync: false }).finally(() => {
              if (typeof onLogout === "function") {
                onLogout(payload);
              }
            });
          }
        } catch {
          // Игнорируем поврежденные события синхронизации.
        }
      };
      window.addEventListener("storage", handler);
      crossTabSyncAttached = true;
    },
    async restoreSession() {
      try {
        const response = await api.get("/api/auth/session");
        if (response.data?.user) {
          this.applySession(response.data.user);
          return true;
        }
      } catch {
        this.applySession(null);
      }
      this.sessionChecked = true;
      return false;
    },
    async login(payload) {
      this.loading = true;
      this.error = "";
      try {
        const response = await api.post("/api/auth/admin/login", payload);
        this.applySession(response.data.user);
        this.syncAuthEvent({
          type: "login",
          user: response.data.user,
        });
        return true;
      } catch (error) {
        this.error = getLoginErrorMessage(error);
        return false;
      } finally {
        this.loading = false;
      }
    },
    async logout({ notifyServer = true, sync = true } = {}) {
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

      clearCsrfToken();
      this.applySession(null);

      if (sync) {
        this.syncAuthEvent({ type: "logout" });
      }

      if (notifyServer) {
        await notifyServerLogout(apiBase);
      }

      clearCsrfToken();
    },
  },
});
