import axios from "axios";
import { useAuthStore } from "@/shared/stores/auth.js";
import { fetchCsrfToken, setCsrfToken, withCsrfHeader } from "@/shared/api/csrf.js";
import { runLogoutFlow } from "@/shared/services/auth/authUiFlow.js";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let refreshPromise = null;
const AUTH_ERRORS = new Set([
  "Authentication required",
  "Token has been revoked",
  "Invalid or expired token",
  "Refresh token required",
  "Refresh token has been revoked",
  "Invalid or expired refresh token",
  "Invalid refresh token payload",
  "User account not found",
  "Admin account not found or inactive",
]);

const isUnauthorizedStatus = (error) => {
  const status = error?.response?.status;
  return status === 401 || status === 403;
};

const isAuthErrorResponse = (error) => {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.error || "").trim();
  if (status === 401 && AUTH_ERRORS.has(message)) return true;
  if (status === 403 && message === "Invalid or expired token") return true;
  const normalizedMessage = message.toLowerCase();
  if (status === 429 && normalizedMessage.includes("слишком много попыток")) {
    return true;
  }
  return false;
};

const refreshToken = async () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axios
    .post(
      `${(import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "")}/api/auth/refresh`,
      null,
      {
        headers: await withCsrfHeader({
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
        }),
        withCredentials: true,
        timeout: 10000,
      }
    )
    .then((response) => {
      const nextCsrfToken = String(response?.data?.csrfToken || "").trim();
      if (nextCsrfToken) {
        setCsrfToken(nextCsrfToken);
      }
      return response.data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};
api.interceptors.request.use(async (config) => {
  const method = String(config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    config.headers = await withCsrfHeader(config.headers || {});
  }
  return config;
});
api.interceptors.response.use(
  (response) => {
    const nextCsrfToken = String(response?.data?.csrfToken || "").trim();
    if (nextCsrfToken) {
      setCsrfToken(nextCsrfToken);
    }
    return response;
  },
  async (error) => {
    const authStore = useAuthStore();
    const status = error.response?.status;
    const originalRequest = error.config;
    const isRefreshRequest = originalRequest?.url?.includes("/api/auth/refresh");
    const errorMessage = String(error?.response?.data?.error || "").trim();
    const isCsrfError = status === 403 && errorMessage.startsWith("CSRF validation failed");

    if (isCsrfError && !originalRequest?._csrfRetry) {
      originalRequest._csrfRetry = true;
      await fetchCsrfToken({ force: true });
      return api(originalRequest);
    }

    if (status === 401 && !isRefreshRequest && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const data = await refreshToken();
        if (data?.ok) {
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Любой 401/403 на refresh означает, что сессию безопасно продолжать нельзя.
        if (isUnauthorizedStatus(refreshError) || isAuthErrorResponse(refreshError)) {
          runLogoutFlow(authStore);
        }
      }
    } else if ((status === 401 || status === 403) && isAuthErrorResponse(error)) {
      runLogoutFlow(authStore);
    }
    return Promise.reject(error);
  }
);
export default api;
