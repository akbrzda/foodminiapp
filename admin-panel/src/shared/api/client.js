import axios from "axios";
import { useAuthStore } from "@/shared/stores/auth.js";
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
let refreshPromise = null;
const AUTH_ERRORS = new Set(["Authentication required", "Token has been revoked", "Invalid or expired token", "Refresh token required"]);

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
    .post(`${(import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "")}/api/auth/refresh`, null, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
      withCredentials: true,
      timeout: 10000,
    })
    .then((response) => response.data)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};
api.interceptors.request.use((config) => {
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const authStore = useAuthStore();
    const status = error.response?.status;
    const originalRequest = error.config;
    const isRefreshRequest = originalRequest?.url?.includes("/api/auth/refresh");
    if (status === 401 && !isRefreshRequest && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const data = await refreshToken();
        if (data?.ok) {
          return api(originalRequest);
        }
      } catch (refreshError) {
        if (isAuthErrorResponse(refreshError)) {
          authStore.logout({ redirect: true });
        }
      }
    } else if ((status === 401 || status === 403) && isAuthErrorResponse(error)) {
      authStore.logout({ redirect: true });
    }
    return Promise.reject(error);
  },
);
export default api;
