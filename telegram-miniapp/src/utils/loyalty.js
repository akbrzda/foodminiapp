export const LOYALTY_WINDOW_DAYS = 60;
export const MAX_BONUS_REDEEM_PERCENT = 0.2;
export const LOYALTY_LEVELS = [
  {
    id: "starter",
    name: "Бронза",
    rate: 0.03,
    redeemPercent: 0.2,
    min: 0,
    max: 9999,
  },
  {
    id: "growth",
    name: "Серебро",
    rate: 0.05,
    redeemPercent: 0.25,
    min: 10000,
    max: 19999,
  },
  {
    id: "prime",
    name: "Золото",
    rate: 0.07  ,
    redeemPercent: 0.3,
    min: 20000,
    max: Number.POSITIVE_INFINITY,
  },
];
export function normalizeSpend(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return 0;
  }
  return Math.max(0, parsedValue);
}
export function getLoyaltyLevel(spend, levels = LOYALTY_LEVELS) {
  const value = normalizeSpend(spend);
  return levels.find((level) => value >= level.min && value <= level.max) || levels[0];
}
export function getNextLoyaltyLevel(spend, levels = LOYALTY_LEVELS) {
  const current = getLoyaltyLevel(spend, levels);
  const currentIndex = levels.findIndex((level) => level.id === current.id);
  if (currentIndex < 0 || currentIndex >= levels.length - 1) {
    return null;
  }
  return levels[currentIndex + 1];
}
export function getAmountToNextLevel(spend, levels = LOYALTY_LEVELS) {
  const next = getNextLoyaltyLevel(spend, levels);
  if (!next) {
    return 0;
  }
  const value = normalizeSpend(spend);
  return Math.max(0, next.min - value);
}
export function getProgressToNextLevel(spend, levels = LOYALTY_LEVELS) {
  const current = getLoyaltyLevel(spend, levels);
  const next = getNextLoyaltyLevel(spend, levels);
  if (!next) {
    return 1;
  }
  const value = normalizeSpend(spend);
  const span = next.min - current.min;
  if (span <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, (value - current.min) / span));
}
