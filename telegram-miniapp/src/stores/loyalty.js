import { defineStore } from "pinia";
import { ordersAPI } from "../api/endpoints";
import {
  LOYALTY_LEVELS,
  LOYALTY_WINDOW_DAYS,
  MAX_BONUS_REDEEM_PERCENT,
  getLoyaltyLevel,
  getNextLoyaltyLevel,
  getAmountToNextLevel,
  getProgressToNextLevel,
  normalizeSpend,
} from "../utils/loyalty";

export const useLoyaltyStore = defineStore("loyalty", {
  state: () => ({
    spendLast60Days: 0,
    loading: false,
    updatedAt: null,
  }),

  getters: {
    levels: () => LOYALTY_LEVELS,
    currentLevel: (state) => getLoyaltyLevel(state.spendLast60Days),
    nextLevel: (state) => getNextLoyaltyLevel(state.spendLast60Days),
    rate: (state) => getLoyaltyLevel(state.spendLast60Days).rate,
    amountToNextLevel: (state) => getAmountToNextLevel(state.spendLast60Days),
    progressToNextLevel: (state) => getProgressToNextLevel(state.spendLast60Days),
    maxRedeemPercent: () => MAX_BONUS_REDEEM_PERCENT,
  },

  actions: {
    setSpend(amount) {
      this.spendLast60Days = normalizeSpend(amount);
      this.updatedAt = Date.now();
    },

    calculateSpendFromOrders(orders) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - LOYALTY_WINDOW_DAYS);

      return (orders || []).reduce((total, order) => {
        if (!order?.created_at) return total;
        if (order.status === "cancelled") return total;

        const createdAt = new Date(order.created_at);
        if (createdAt < cutoff) return total;

        const orderTotal = Number(order.total_amount) || 0;
        return total + orderTotal;
      }, 0);
    },

    async refreshFromOrders() {
      if (this.loading) return;
      this.loading = true;
      try {
        const response = await ordersAPI.getMyOrders();
        const orders = response.data.orders || [];
        const spend = this.calculateSpendFromOrders(orders);
        this.setSpend(spend);
      } catch (error) {
        console.error("Failed to refresh loyalty data:", error);
      } finally {
        this.loading = false;
      }
    },
  },
});
