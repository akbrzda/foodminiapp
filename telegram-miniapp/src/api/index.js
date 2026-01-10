import axios from "axios";
import { useAuthStore } from "../stores/auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

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
  (response) => response,
  (error) => {
    const authStore = useAuthStore();

    if (error.response) {
      // Если 401 - токен невалиден, разлогиниваем
      if (error.response.status === 401) {
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
