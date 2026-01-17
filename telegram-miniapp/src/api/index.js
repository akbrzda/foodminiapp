import axios from "axios";
import { useAuthStore } from "../stores/auth";
import { getInitData } from "../services/telegram";

const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const api = axios.create({
  baseURL: `${apiBase}/api`,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json; charset=utf-8",
  },
});

let refreshPromise = null;

const refreshToken = async () => {
  if (refreshPromise) return refreshPromise;
  const initData = getInitData();
  if (!initData) {
    return Promise.reject(new Error("Missing Telegram initData"));
  }

  refreshPromise = axios
    .post(
      `${apiBase}/api/auth/telegram`,
      { initData },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
        },
        timeout: 10000,
      }
    )
    .then((response) => response.data)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};

// Request interceptor - добавляем токен к каждому запросу
api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - обработка ошибок
api.interceptors.response.use(
  (response) => {
    // Ensure response data is properly decoded
    if (response.data && typeof response.data === "object") {
      response.data = JSON.parse(JSON.stringify(response.data));
    }
    return response;
  },
  async (error) => {
    const authStore = useAuthStore();

    if (error.response) {
      // Если 401 - токен невалиден, разлогиниваем
      const status = error.response.status;
      const originalRequest = error.config;
      const isAuthRequest = originalRequest?.url?.includes("/auth/telegram");
      if ((status === 401 || status === 403) && !isAuthRequest && !originalRequest?._retry) {
        originalRequest._retry = true;
        try {
          const data = await refreshToken();
          if (data?.token) {
            authStore.setToken(data.token);
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${data.token}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          authStore.logout();
        }
      } else if (status === 401) {
        authStore.logout();
      }

      // Возвращаем понятную ошибку
      return Promise.reject({
        message: error.response.data?.message || "Произошла ошибка",
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.request) {
      // Ошибка сети
      return Promise.reject({
        message: "Нет связи с сервером",
        status: 0,
      });
    } else {
      return Promise.reject({
        message: error.message || "Неизвестная ошибка",
        status: -1,
      });
    }
  }
);

export default api;
