import axios from "axios";
import { useAuthStore } from "@/shared/stores/auth.js";
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
});
let refreshPromise = null;
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
  const authStore = useAuthStore();
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`;
  }
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const authStore = useAuthStore();
    const status = error.response?.status;
    const originalRequest = error.config;
    const isRefreshRequest = originalRequest?.url?.includes("/api/auth/refresh");
    if ((status === 401 || status === 403) && !isRefreshRequest && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const data = await refreshToken();
        if (data?.token) {
          authStore.applySession(data.token, authStore.user);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${data.token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        authStore.logout({ redirect: true });
      }
    } else if (status === 401) {
      authStore.logout({ redirect: true });
    }
    return Promise.reject(error);
  },
);
export default api;
