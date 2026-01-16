import { defineStore } from "pinia";
import api from "../api/client.js";

export const useReferenceStore = defineStore("reference", {
  state: () => ({
    cities: [],
    branchesByCity: {},
    loading: false,
  }),
  actions: {
    async loadCities() {
      if (this.loading || this.cities.length > 0) return;
      this.loading = true;
      try {
        const response = await api.get("/api/cities/admin/all");
        this.cities = response.data.cities || [];
      } finally {
        this.loading = false;
      }
    },
    async loadBranches(cityId) {
      if (!cityId) return [];
      if (this.branchesByCity[cityId]) return this.branchesByCity[cityId];
      const response = await api.get(`/api/cities/${cityId}/branches`);
      const branches = response.data.branches || [];
      this.branchesByCity[cityId] = branches;
      return branches;
    },
  },
});
