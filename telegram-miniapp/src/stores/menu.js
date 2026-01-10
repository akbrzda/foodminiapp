import { defineStore } from "pinia";

export const useMenuStore = defineStore("menu", {
  state: () => ({
    categories: [],
    items: [],
    loading: false,
    error: null,
  }),

  getters: {
    getCategoryById: (state) => (id) => {
      return state.categories.find((cat) => cat.id === id);
    },

    getItemsByCategory: (state) => (categoryId) => {
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

    setLoading(loading) {
      this.loading = loading;
    },

    setError(error) {
      this.error = error;
    },
  },
});
