import { defineStore } from "pinia";
import { authAPI } from "../api/endpoints";
import {
  LOYALTY_LEVELS,
  MAX_BONUS_REDEEM_PERCENT,
  getLoyaltyLevel,
  getNextLoyaltyLevel,
  getAmountToNextLevel,
  getProgressToNextLevel,
  normalizeSpend,
} from "../utils/loyalty";
export const useLoyaltyStore = defineStore("loyalty", {
  state: () => ({
    totalSpent: 0,
    loading: false,
    updatedAt: null,
    levels: LOYALTY_LEVELS,
    fallbackRedeemPercent: MAX_BONUS_REDEEM_PERCENT,
    settings: null, // Настройки лояльности
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
    applySettings(settings, levelsFromApi = []) {
      const data = settings || {};

      // Сохраняем все настройки лояльности
      this.settings = data;

      const fallbackRedeemPercent = Number(data.bonus_max_redeem_percent) || MAX_BONUS_REDEEM_PERCENT;
      if (Array.isArray(levelsFromApi) && levelsFromApi.length > 0) {
        const normalized = levelsFromApi
          .filter((level) => level && (level.is_active === undefined || level.is_active))
          .map((level) => ({
            id: level.id ?? level.level_number,
            name: level.name,
            threshold: Number(level.threshold_amount) || 0,
            rate: Number(level.earn_percent) || 0,
            redeemPercent: Number(level.max_spend_percent),
            levelNumber: Number(level.level_number) || 0,
          }))
          .sort((a, b) => a.threshold - b.threshold || a.levelNumber - b.levelNumber);
        this.levels = normalized.map((level, index) => {
          const next = normalized[index + 1];
          const min = Math.max(0, level.threshold);
          const max = next ? Math.max(min, next.threshold - 1) : Number.POSITIVE_INFINITY;
          const redeemPercent = Number.isFinite(level.redeemPercent) ? level.redeemPercent / 100 : fallbackRedeemPercent;
          return {
            id: String(level.id ?? index + 1),
            name: level.name || `Уровень ${index + 1}`,
            rate: level.rate,
            redeemPercent,
            min,
            max,
          };
        });
        this.fallbackRedeemPercent = fallbackRedeemPercent;
        return;
      }
      const level2Threshold = Number(data.loyalty_level_2_threshold);
      const level3Threshold = Number(data.loyalty_level_3_threshold);
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
    async refreshFromProfile() {
      if (this.loading) return;
      this.loading = true;
      try {
        const response = await authAPI.getProfile();
        const totalSpent = response.data.user?.total_spent ?? 0;
        this.setTotalSpent(totalSpent);
      } catch (error) {
        console.error("Failed to refresh loyalty data:", error);
      } finally {
        this.loading = false;
      }
    },
  },
});
