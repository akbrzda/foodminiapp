export const LOYALTY_WINDOW_DAYS = 60;
export const MAX_BONUS_REDEEM_PERCENT = 0.2;
export const LOYALTY_LEVELS = [
  {
    id: "starter",
    name: "Бронза",
    rate: 0.03,
    min: 0,
    max: 9999,
  },
  {
    id: "growth",
    name: "Серебро",
    rate: 0.05,
    min: 10000,
    max: 19999,
  },
  {
    id: "prime",
    name: "Золото",
    rate: 0.07,
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
export function getLoyaltyLevel(spend) {
  const value = normalizeSpend(spend);
  return LOYALTY_LEVELS.find((level) => value >= level.min && value <= level.max) || LOYALTY_LEVELS[0];
}
export function getNextLoyaltyLevel(spend) {
  const current = getLoyaltyLevel(spend);
  const currentIndex = LOYALTY_LEVELS.findIndex((level) => level.id === current.id);
  if (currentIndex < 0 || currentIndex >= LOYALTY_LEVELS.length - 1) {
    return null;
  }
  return LOYALTY_LEVELS[currentIndex + 1];
}
export function getAmountToNextLevel(spend) {
  const next = getNextLoyaltyLevel(spend);
  if (!next) {
    return 0;
  }
  const value = normalizeSpend(spend);
  return Math.max(0, next.min - value);
}
export function getProgressToNextLevel(spend) {
  const current = getLoyaltyLevel(spend);
  const next = getNextLoyaltyLevel(spend);
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
