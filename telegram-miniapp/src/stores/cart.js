import { defineStore } from "pinia";

export const useCartStore = defineStore("cart", {
  state: () => ({
    items: JSON.parse(localStorage.getItem("cart") || "[]"),
  }),

  getters: {
    itemsCount: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),

    totalPrice: (state) =>
      state.items.reduce((sum, item) => {
        const itemTotal = item.price * item.quantity;
        const modifiersTotal = (item.modifiers || []).reduce((modSum, mod) => modSum + mod.price * item.quantity, 0);
        return sum + itemTotal + modifiersTotal;
      }, 0),
  },

  actions: {
    addItem(item) {
      const existingIndex = this.items.findIndex((i) => i.id === item.id && JSON.stringify(i.modifiers) === JSON.stringify(item.modifiers));

      if (existingIndex >= 0) {
        this.items[existingIndex].quantity += item.quantity || 1;
      } else {
        this.items.push({ ...item, quantity: item.quantity || 1 });
      }

      this.saveToLocalStorage();
    },

    removeItem(index) {
      this.items.splice(index, 1);
      this.saveToLocalStorage();
    },

    updateQuantity(index, quantity) {
      if (quantity <= 0) {
        this.removeItem(index);
      } else {
        this.items[index].quantity = quantity;
        this.saveToLocalStorage();
      }
    },

    clearCart() {
      this.items = [];
      this.saveToLocalStorage();
    },

    saveToLocalStorage() {
      localStorage.setItem("cart", JSON.stringify(this.items));
    },
  },
});
