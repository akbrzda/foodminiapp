import { defineStore } from "pinia";

export const useCartStore = defineStore("cart", {
  state: () => ({
    items: JSON.parse(localStorage.getItem("cart") || "[]"),
  }),

  getters: {
    itemsCount: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),

    totalPrice: (state) =>
      state.items.reduce((sum, item) => {
        // item.price уже включает цену варианта и всех модификаторов
        const itemTotal = (parseFloat(item.price) || 0) * (item.quantity || 1);
        return sum + itemTotal;
      }, 0),
  },

  actions: {
    replaceItems(items) {
      this.items = Array.isArray(items) ? items : [];
      this.saveToLocalStorage();
    },

    addItem(item) {
      // Ищем существующий товар с теми же параметрами (id, variant_id, модификаторы)
      const existingIndex = this.items.findIndex((i) => {
        const sameId = i.id === item.id;
        const sameVariant = (i.variant_id || null) === (item.variant_id || null);
        const sameModifiers = JSON.stringify(i.modifiers || []) === JSON.stringify(item.modifiers || []);
        return sameId && sameVariant && sameModifiers;
      });

      // Убеждаемся, что цена - число
      const price = parseFloat(item.price) || 0;

      if (existingIndex >= 0) {
        this.items[existingIndex].quantity += item.quantity || 1;
        // Обновляем цену на случай, если она изменилась
        this.items[existingIndex].price = price;
      } else {
        this.items.push({ 
          ...item, 
          price: price,
          quantity: item.quantity || 1 
        });
      }

      this.saveToLocalStorage();
    },

    removeItem(index) {
      this.items.splice(index, 1);
      this.saveToLocalStorage();
    },

    updateQuantity(index, quantity) {
      if (index < 0 || index >= this.items.length) {
        console.error("Invalid index for updateQuantity:", index);
        return;
      }
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
