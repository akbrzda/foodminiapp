import { defineStore } from "pinia";
import api from "../api/client.js";
const STORAGE_TOKEN = "admin_token";
const STORAGE_USER = "admin_user";
export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem(STORAGE_TOKEN) || "",
    user: JSON.parse(localStorage.getItem(STORAGE_USER) || "null"),
    loading: false,
    error: "",
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token) && Boolean(state.user),
    role: (state) => state.user?.role || "",
  },
  actions: {
    isTokenExpired(token) {
      if (!token) return true;
      const parts = token.split(".");
      if (parts.length !== 3) return true;
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (!payload?.exp) return false;
        return payload.exp * 1000 <= Date.now();
      } catch (error) {
        return true;
      }
    },
    validateToken() {
      if (this.isTokenExpired(this.token)) {
        this.logout();
        return false;
      }
      return Boolean(this.token);
    },
    async login(payload) {
      this.loading = true;
      this.error = "";
      try {
        const response = await api.post("/api/auth/admin/login", payload);
        this.token = response.data.token;
        this.user = response.data.user;
        localStorage.setItem(STORAGE_TOKEN, this.token);
        localStorage.setItem(STORAGE_USER, JSON.stringify(this.user));
        return true;
      } catch (error) {
        this.error = error.response?.data?.error || "Login failed";
        return false;
      } finally {
        this.loading = false;
      }
    },
    logout({ redirect = true } = {}) {
      this.token = "";
      this.user = null;
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USER);
      if (redirect && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    },
  },
});
