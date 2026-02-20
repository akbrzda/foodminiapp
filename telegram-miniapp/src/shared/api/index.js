import axios from "axios";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const api = axios.create({
  baseURL: `${apiBase}/api`,
  withCredentials: true,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json; charset=utf-8",
  },
});
const normalizeErrorMessage = (message) => {
  if (!message) return "Произошла ошибка";
  const hasLatin = /[A-Za-z]/.test(message);
  return hasLatin ? "Произошла ошибка" : message;
};
let refreshPromise = null;
const refreshToken = async () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axios
    .post(`${apiBase}/api/auth/refresh`, null, {
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
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === "object") {
      response.data = JSON.parse(JSON.stringify(response.data));
    }
    return response;
  },
  async (error) => {
    const authStore = useAuthStore();
    if (error.response) {
      const status = error.response.status;
      const originalRequest = error.config;
      const isRefreshRequest = originalRequest?.url?.includes("/auth/refresh");
      const isAuthRequest = originalRequest?.url?.includes("/auth/telegram");
      if (status === 401 && !isAuthRequest && !isRefreshRequest && !originalRequest?._retry) {
        originalRequest._retry = true;
        try {
          const data = await refreshToken();
          if (data?.ok) {
            return api(originalRequest);
          }
        } catch (refreshError) {
          await authStore.logout({ notifyServer: false, clearAppState: false });
        }
      } else if (status === 401) {
        await authStore.logout({ notifyServer: false, clearAppState: false });
      }
      return Promise.reject({
        message: normalizeErrorMessage(error.response.data?.message || "Произошла ошибка"),
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.request) {
      return Promise.reject({
        message: "Нет связи с сервером",
        status: 0,
      });
    } else {
      return Promise.reject({
        message: normalizeErrorMessage(error.message || "Неизвестная ошибка"),
        status: -1,
      });
    }
  },
);
export default api;
