import { defineStore } from "pinia";
import { devError } from "@/shared/utils/logger.js";
export const useCartStore = defineStore("cart", {
  state: () => ({
    items: JSON.parse(localStorage.getItem("cart") || "[]"),
    bonusUsage: JSON.parse(localStorage.getItem("cart_bonus_usage") || '{"useBonuses":false,"bonusToUse":0}'),
  }),
  getters: {
    itemsCount: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: (state) =>
      state.items.reduce((sum, item) => {
        const itemTotal = (parseFloat(item.price) || 0) * (item.quantity || 1);
        return sum + itemTotal;
      }, 0),
  },
  actions: {
    refreshPricesFromMenu(menuItems) {
      if (!Array.isArray(menuItems) || menuItems.length === 0) return;
      const itemsById = new Map(menuItems.map((item) => [item.id, item]));
      this.items = this.items.map((cartItem) => {
        const menuItem = itemsById.get(cartItem.id);
        if (!menuItem) return cartItem;
        const variant = cartItem.variant_id ? menuItem.variants?.find((v) => v.id === cartItem.variant_id) : null;
        let basePrice = variant ? parseFloat(variant.price) : parseFloat(menuItem.price);
        if (!Number.isFinite(basePrice)) {
          basePrice = parseFloat(cartItem.price) || 0;
        }
        let modifiersTotal = 0;
        const selectedVariantId = variant?.id || cartItem.variant_id || null;
        const updatedModifiers = Array.isArray(cartItem.modifiers)
          ? cartItem.modifiers.map((mod) => {
              const modifierId = typeof mod === "number" ? mod : mod?.id;
              if (!modifierId) return mod;
              const group = menuItem.modifier_groups?.find((g) => g.modifiers?.some((m) => m.id === modifierId));
              const modifier = group?.modifiers?.find((m) => m.id === modifierId);
              if (!modifier) return mod;
              let price = parseFloat(modifier.price) || 0;
              if (selectedVariantId && Array.isArray(modifier.variant_prices) && modifier.variant_prices.length > 0) {
                const matched = modifier.variant_prices.find((row) => Number(row.variant_id) === Number(selectedVariantId));
                if (matched && matched.price !== null && matched.price !== undefined) {
                  const parsed = parseFloat(matched.price);
                  if (Number.isFinite(parsed)) {
                    price = parsed;
                  }
                }
              }
              modifiersTotal += price;
              if (typeof mod === "number") return mod;
              return { ...mod, price };
            })
          : cartItem.modifiers;
        const updatedPrice = basePrice + modifiersTotal;
        return {
          ...cartItem,
          price: updatedPrice,
          modifiers: updatedModifiers,
          image_url: variant?.image_url || menuItem.image_url || cartItem.image_url || null,
        };
      });
      this.saveToLocalStorage();
    },
    replaceItems(items) {
      this.items = Array.isArray(items) ? items : [];
      this.saveToLocalStorage();
    },
    addItem(item) {
      const existingIndex = this.items.findIndex((i) => {
        const sameId = i.id === item.id;
        const sameVariant = (i.variant_id || null) === (item.variant_id || null);
        const sameModifiers = JSON.stringify(i.modifiers || []) === JSON.stringify(item.modifiers || []);
        return sameId && sameVariant && sameModifiers;
      });
      const price = parseFloat(item.price) || 0;
      if (existingIndex >= 0) {
        this.items[existingIndex].quantity += item.quantity || 1;
        this.items[existingIndex].price = price;
      } else {
        this.items.push({
          ...item,
          price: price,
          quantity: item.quantity || 1,
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
        devError("Некорректный индекс для updateQuantity:", index);
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
      this.resetBonusUsage();
    },
    saveToLocalStorage() {
      localStorage.setItem("cart", JSON.stringify(this.items));
    },
    setUseBonuses(value) {
      this.bonusUsage.useBonuses = Boolean(value);
      if (!this.bonusUsage.useBonuses) {
        this.bonusUsage.bonusToUse = 0;
      }
      this.saveBonusUsage();
    },
    setBonusToUse(value) {
      const parsedValue = Number(value);
      this.bonusUsage.bonusToUse = Number.isFinite(parsedValue) ? Math.max(0, Math.floor(parsedValue)) : 0;
      this.saveBonusUsage();
    },
    resetBonusUsage() {
      this.bonusUsage = { useBonuses: false, bonusToUse: 0 };
      this.saveBonusUsage();
    },
    saveBonusUsage() {
      localStorage.setItem("cart_bonus_usage", JSON.stringify(this.bonusUsage));
    },
  },
});
