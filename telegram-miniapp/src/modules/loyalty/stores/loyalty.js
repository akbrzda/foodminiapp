import { defineStore } from "pinia";
import { bonusesAPI } from "@/shared/api/endpoints.js";
import {
  LOYALTY_LEVELS,
  MAX_BONUS_REDEEM_PERCENT,
  getLoyaltyLevel,
  getNextLoyaltyLevel,
  getAmountToNextLevel,
  getProgressToNextLevel,
  normalizeSpend,
} from "@/shared/utils/loyalty";
export const useLoyaltyStore = defineStore("loyalty", {
  state: () => ({
    totalSpent: 0,
    loading: false,
    updatedAt: null,
    levels: LOYALTY_LEVELS,
    fallbackRedeemPercent: MAX_BONUS_REDEEM_PERCENT,
    periodDays: 60,
  }),
  getters: {
    currentLevel: (state) => getLoyaltyLevel(state.totalSpent, state.levels),
    nextLevel: (state) => getNextLoyaltyLevel(state.totalSpent, state.levels),
    rate: (state) => getLoyaltyLevel(state.totalSpent, state.levels).rate,
    amountToNextLevel: (state) => getAmountToNextLevel(state.totalSpent, state.levels),
    progressToNextLevel: (state) => getProgressToNextLevel(state.totalSpent, state.levels),
    maxRedeemPercent: (state) => {
      const currentLevel = getLoyaltyLevel(state.totalSpent, state.levels);
      if (Number.isFinite(currentLevel?.redeemPercent)) {
        return currentLevel.redeemPercent;
      }
      return state.fallbackRedeemPercent;
    },
  },
  actions: {
    setTotalSpent(amount) {
      this.totalSpent = normalizeSpend(amount);
      this.updatedAt = Date.now();
    },
    applyLevels(levelsFromApi = []) {
      if (!Array.isArray(levelsFromApi) || levelsFromApi.length === 0) {
        this.levels = LOYALTY_LEVELS;
        this.fallbackRedeemPercent = MAX_BONUS_REDEEM_PERCENT;
        return;
      }
      const normalized = levelsFromApi
        .filter((level) => level)
        .map((level) => ({
          id: level.id,
          name: level.name,
          threshold: Number(level.threshold) || 0,
          rate: Number(level.earnRate) || 0,
          redeemPercent: Number(level.maxSpendPercent),
        }))
        .sort((a, b) => a.threshold - b.threshold);
      const fallbackRedeemPercent = Number.isFinite(normalized[0]?.redeemPercent)
        ? normalized[0].redeemPercent
        : MAX_BONUS_REDEEM_PERCENT;
      this.levels = normalized.map((level, index) => {
        const next = normalized[index + 1];
        const min = Math.max(0, level.threshold);
        const max = next ? Math.max(min, next.threshold - 1) : Number.POSITIVE_INFINITY;
        const redeemPercent = Number.isFinite(level.redeemPercent) ? level.redeemPercent : fallbackRedeemPercent;
        return {
          id: String(level.id ?? index + 1),
          name: level.name || `Уровень ${index + 1}`,
          rate: Number.isFinite(level.rate) ? level.rate : LOYALTY_LEVELS[index]?.rate,
          redeemPercent,
          min,
          max,
        };
      });
      this.fallbackRedeemPercent = fallbackRedeemPercent;
    },
    async refreshFromProfile() {
      if (this.loading) return;
      this.loading = true;
      try {
        const response = await bonusesAPI.getLevels();
        const totalSpent = response.data?.total_spent_60_days ?? 0;
        this.setTotalSpent(totalSpent);
        this.periodDays = response.data?.period_days || 60;
        this.applyLevels(response.data?.levels || []);
      } catch (error) {
        console.error("Failed to refresh loyalty data:", error);
      } finally {
        this.loading = false;
      }
    },
  },
});
