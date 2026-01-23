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
    levels: LOYALTY_LEVELS,
    fallbackRedeemPercent: MAX_BONUS_REDEEM_PERCENT,
  }),
  getters: {
    currentLevel: (state) => getLoyaltyLevel(state.spendLast60Days, state.levels),
    nextLevel: (state) => getNextLoyaltyLevel(state.spendLast60Days, state.levels),
    rate: (state) => getLoyaltyLevel(state.spendLast60Days, state.levels).rate,
    amountToNextLevel: (state) => getAmountToNextLevel(state.spendLast60Days, state.levels),
    progressToNextLevel: (state) => getProgressToNextLevel(state.spendLast60Days, state.levels),
    maxRedeemPercent: (state) => {
      const currentLevel = getLoyaltyLevel(state.spendLast60Days, state.levels);
      if (Number.isFinite(currentLevel?.redeemPercent)) {
        return currentLevel.redeemPercent;
      }
      return state.fallbackRedeemPercent;
    },
  },
  actions: {
    setSpend(amount) {
      this.spendLast60Days = normalizeSpend(amount);
      this.updatedAt = Date.now();
    },
    applySettings(settings) {
      const data = settings || {};
      const level2Threshold = Number(data.loyalty_level_2_threshold);
      const level3Threshold = Number(data.loyalty_level_3_threshold);
      const fallbackRedeemPercent = Number(data.bonus_max_redeem_percent) || MAX_BONUS_REDEEM_PERCENT;
      const level1RedeemPercent = Number(data.loyalty_level_1_redeem_percent);
      const level2RedeemPercent = Number(data.loyalty_level_2_redeem_percent);
      const level3RedeemPercent = Number(data.loyalty_level_3_redeem_percent);
      const level1Rate = Number(data.loyalty_level_1_rate);
      const level2Rate = Number(data.loyalty_level_2_rate);
      const level3Rate = Number(data.loyalty_level_3_rate);
      this.levels = [
        {
          id: "starter",
          name: data.loyalty_level_1_name || LOYALTY_LEVELS[0].name,
          rate: Number.isFinite(level1Rate) ? level1Rate : LOYALTY_LEVELS[0].rate,
          redeemPercent: Number.isFinite(level1RedeemPercent) ? level1RedeemPercent : fallbackRedeemPercent,
          min: 0,
          max: Number.isFinite(level2Threshold) ? level2Threshold - 1 : LOYALTY_LEVELS[0].max,
        },
        {
          id: "growth",
          name: data.loyalty_level_2_name || LOYALTY_LEVELS[1].name,
          rate: Number.isFinite(level2Rate) ? level2Rate : LOYALTY_LEVELS[1].rate,
          redeemPercent: Number.isFinite(level2RedeemPercent) ? level2RedeemPercent : fallbackRedeemPercent,
          min: Number.isFinite(level2Threshold) ? level2Threshold : LOYALTY_LEVELS[1].min,
          max: Number.isFinite(level3Threshold) ? level3Threshold - 1 : LOYALTY_LEVELS[1].max,
        },
        {
          id: "prime",
          name: data.loyalty_level_3_name || LOYALTY_LEVELS[2].name,
          rate: Number.isFinite(level3Rate) ? level3Rate : LOYALTY_LEVELS[2].rate,
          redeemPercent: Number.isFinite(level3RedeemPercent) ? level3RedeemPercent : fallbackRedeemPercent,
          min: Number.isFinite(level3Threshold) ? level3Threshold : LOYALTY_LEVELS[2].min,
          max: Number.POSITIVE_INFINITY,
        },
      ];
      this.fallbackRedeemPercent = fallbackRedeemPercent;
    },
    calculateSpendFromOrders(orders) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - LOYALTY_WINDOW_DAYS);
      return (orders || []).reduce((total, order) => {
        if (!order?.created_at) return total;
        if (order.status === "cancelled") return total;
        const createdAt = new Date(order.created_at);
        if (createdAt < cutoff) return total;
        const orderTotal = Number(order.total ?? order.total_amount) || 0;
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
