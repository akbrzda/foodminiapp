import { defineStore } from "pinia";
export const useMenuStore = defineStore("menu", {
  state: () => ({
    categories: [],
    items: [],
    loading: false,
    error: null,
    cityId: null,
    fulfillmentType: null,
    branchId: null,
    loadedAt: null,
  }),
  getters: {
    getCategoryById: (state) => (id) => {
      return state.categories.find((cat) => cat.id === id);
    },
    getItemsByCategory: (state) => (categoryId) => {
      const category = state.categories.find((cat) => cat.id === categoryId);
      if (category?.items) return category.items;
      return state.items.filter((item) => item.category_id === categoryId);
    },
    getItemById: (state) => (id) => {
      return state.items.find((item) => item.id === id);
    },
  },
  actions: {
    setCategories(categories) {
      this.categories = categories;
    },
    setItems(items) {
      this.items = items;
    },
    setMenuData({ cityId, fulfillmentType, branchId, categories, items }) {
      this.cityId = cityId;
      this.fulfillmentType = fulfillmentType || null;
      this.branchId = branchId || null;
      this.categories = categories;
      this.items = items;
      this.loadedAt = Date.now();
    },
    setLoading(loading) {
      this.loading = loading;
    },
    setError(error) {
      this.error = error;
    },
    clearMenu() {
      this.categories = [];
      this.items = [];
      this.error = null;
      this.cityId = null;
      this.fulfillmentType = null;
      this.branchId = null;
      this.loadedAt = null;
    },
  },
});
