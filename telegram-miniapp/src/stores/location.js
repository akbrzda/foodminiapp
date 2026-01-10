import { defineStore } from "pinia";

export const useLocationStore = defineStore("location", {
  state: () => ({
    selectedCity: JSON.parse(localStorage.getItem("selectedCity") || "null"),
    selectedBranch: JSON.parse(localStorage.getItem("selectedBranch") || "null"),
    cities: [],
    branches: [],
  }),

  getters: {
    hasCitySelected: (state) => !!state.selectedCity,
    hasBranchSelected: (state) => !!state.selectedBranch,
  },

  actions: {
    setCity(city) {
      this.selectedCity = city;
      this.selectedBranch = null; // Сбросить филиал при смене города
      if (city) {
        localStorage.setItem("selectedCity", JSON.stringify(city));
      } else {
        localStorage.removeItem("selectedCity");
      }
      localStorage.removeItem("selectedBranch");
    },

    setBranch(branch) {
      this.selectedBranch = branch;
      if (branch) {
        localStorage.setItem("selectedBranch", JSON.stringify(branch));
      } else {
        localStorage.removeItem("selectedBranch");
      }
    },

    setCities(cities) {
      this.cities = cities;
    },

    setBranches(branches) {
      this.branches = branches;
    },
  },
});
