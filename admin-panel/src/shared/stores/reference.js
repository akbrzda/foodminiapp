import { defineStore } from "pinia";
import api from "@/shared/api/client.js";
import { devError } from "@/shared/utils/logger";
export const useReferenceStore = defineStore("reference", {
  state: () => ({
    cities: [],
    allCities: [],
    branchesByCity: {},
    loading: false,
    citiesPromise: null,
    branchesLoading: {},
    branchesPromise: {},
  }),
  getters: {
    branches: (state) => {
      return Object.values(state.branchesByCity).flat();
    },
  },
  actions: {
    async loadCities({ force = false, includeInactive = false } = {}) {
      if (this.loading && this.citiesPromise) {
        await this.citiesPromise;
        return includeInactive ? this.allCities : this.cities;
      }
      if (!force) {
        if (includeInactive && this.allCities.length > 0) return this.allCities;
        if (!includeInactive && this.cities.length > 0) return this.cities;
      }
      this.loading = true;
      this.citiesPromise = api
        .get("/api/cities/admin/all")
        .then((response) => {
          const cities = Array.isArray(response.data?.cities) ? response.data.cities : [];
          this.allCities = cities;
          this.cities = cities.filter((city) => city?.is_active === true || city?.is_active === 1);
          return includeInactive ? this.allCities : this.cities;
        })
        .catch((error) => {
          devError("Ошибка загрузки городов:", error);
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
          devError("Ошибка загрузки филиалов:", error);
          return [];
        })
        .finally(() => {
          this.branchesLoading[cityId] = false;
          this.branchesPromise[cityId] = null;
        });
      return this.branchesPromise[cityId];
    },
    async fetchCitiesAndBranches() {
      await this.loadCities();
      const branchPromises = this.cities.map((city) => this.loadBranches(city.id));
      await Promise.all(branchPromises);
    },
  },
});
