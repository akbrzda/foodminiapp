import { defineStore } from "pinia";
import api from "../api/client.js";

export const useReferenceStore = defineStore("reference", {
  state: () => ({
    cities: [],
    branchesByCity: {},
    loading: false,
    citiesPromise: null,
    branchesLoading: {},
    branchesPromise: {},
  }),
  actions: {
    async loadCities({ force = false } = {}) {
      if (this.loading && this.citiesPromise) return this.citiesPromise;
      if (this.cities.length > 0 && !force) return;
      this.loading = true;
      this.citiesPromise = api
        .get("/api/cities/admin/all")
        .then((response) => {
          this.cities = response.data.cities || [];
          return this.cities;
        })
        .catch((error) => {
          console.error("Ошибка загрузки городов:", error);
          return [];
        })
        .finally(() => {
          this.loading = false;
          this.citiesPromise = null;
        });
      return this.citiesPromise;
    },
    async loadBranches(cityId, { force = false } = {}) {
      if (!cityId) return [];
      if (this.branchesByCity[cityId] && !force) return this.branchesByCity[cityId];
      if (this.branchesLoading[cityId] && this.branchesPromise[cityId]) return this.branchesPromise[cityId];
      this.branchesLoading[cityId] = true;
      this.branchesPromise[cityId] = api
        .get(`/api/cities/${cityId}/branches`)
        .then((response) => {
          const branches = response.data.branches || [];
          this.branchesByCity[cityId] = branches;
          return branches;
        })
        .catch((error) => {
          console.error("Ошибка загрузки филиалов:", error);
          return [];
        })
        .finally(() => {
          this.branchesLoading[cityId] = false;
          this.branchesPromise[cityId] = null;
        });
      return this.branchesPromise[cityId];
    },
  },
});
