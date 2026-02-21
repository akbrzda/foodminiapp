import { defineStore } from "pinia";
import api from "@/shared/api/client.js";
import { useNavigationContextStore } from "./navigationContext.js";

const STORAGE_USER = "admin_user";
const LEGACY_STORAGE_USER = "admin_user";
const AUTH_SYNC_KEY = "admin_auth_sync_event";
const POST_LOGIN_REDIRECT_KEY = "admin_post_login_redirect";
let crossTabSyncAttached = false;
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
  const raw = sessionStorage.getItem(STORAGE_USER) || localStorage.getItem(LEGACY_STORAGE_USER) || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
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
    rememberPostLoginRedirect() {
      if (typeof window === "undefined") return;
      const currentPath = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`;
      if (!currentPath || currentPath === "/login" || currentPath.startsWith("/login?")) return;
      try {
        sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, currentPath);
      } catch {
        // Игнорируем ошибки сохранения redirect.
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
    initCrossTabSync() {
      if (crossTabSyncAttached || typeof window === "undefined") return;
      const handler = (event) => {
        if (event.key !== AUTH_SYNC_KEY || !event.newValue) return;
        try {
          const payload = JSON.parse(event.newValue);
          if (payload?.type === "login" && payload.user) {
            this.applySession(payload.user);
            if (window.location.pathname === "/login") {
              window.location.assign("/");
            }
            return;
          }
          if (payload?.type === "logout") {
            this.logout({ redirect: true, notifyServer: false, sync: false });
          }
        } catch {
          // Игнорируем поврежденные события синхронизации.
        }
      };
      window.addEventListener("storage", handler);
      crossTabSyncAttached = true;
    },
    async restoreSession() {
      if (this.user) {
        this.sessionChecked = true;
        return true;
      }
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
    logout({ redirect = true, notifyServer = true, sync = true } = {}) {
      this.rememberPostLoginRedirect();
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      if (notifyServer) {
        fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "application/json; charset=utf-8",
          },
          credentials: "include",
          keepalive: true,
        }).catch(() => {
          // Ошибка server-logout не блокирует локальную очистку.
        });
      }
      this.applySession(null);

      // Очищаем все сохраненные контексты навигации при logout
      const navigationStore = useNavigationContextStore();
      navigationStore.clearAllContexts();

      if (sync) {
        this.syncAuthEvent({ type: "logout" });
      }
      if (redirect && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    },
  },
});
