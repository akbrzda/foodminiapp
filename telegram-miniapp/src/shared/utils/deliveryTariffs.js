export const normalizeTariffs = (tariffs = []) => {
  if (!Array.isArray(tariffs)) return [];
  // Если тарифы не настроены, используем дефолт: бесплатная доставка от 0.
  if (tariffs.length === 0) {
    return [{ amount_from: 0, amount_to: null, delivery_cost: 0 }];
  }
  return tariffs
    .map((tariff) => ({
      amount_from: Number.isFinite(Number(tariff.amount_from)) ? Number(tariff.amount_from) : 0,
      amount_to: tariff.amount_to === null || tariff.amount_to === undefined || tariff.amount_to === "" ? null : Number(tariff.amount_to),
      delivery_cost: Number.isFinite(Number(tariff.delivery_cost)) ? Number(tariff.delivery_cost) : 0,
    }))
    .sort((a, b) => a.amount_from - b.amount_from);
};

export const findTariffForAmount = (tariffs = [], amount = 0) => {
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  for (const tariff of normalizeTariffs(tariffs)) {
    const from = tariff.amount_from;
    const to = tariff.amount_to === null ? null : tariff.amount_to;
    if (normalizedAmount < from) continue;
    if (to === null || normalizedAmount <= to) {
      return tariff;
    }
  }
  return null;
};

export const calculateDeliveryCost = (tariffs = [], amount = 0) => {
  const tariff = findTariffForAmount(tariffs, amount);
  return tariff ? tariff.delivery_cost : 0;
};

export const getThresholds = (tariffs = [], amount = 0) => {
  const normalized = normalizeTariffs(tariffs);
  if (normalized.length < 2) return [];
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const currentIndex = normalized.findIndex((tariff) => {
    const to = tariff.amount_to === null ? null : tariff.amount_to;
    if (normalizedAmount < tariff.amount_from) return false;
    return to === null || normalizedAmount <= to;
  });
  const index = currentIndex < 0 ? 0 : currentIndex;
  const current = normalized[index];
  const result = [];
  for (let i = index + 1; i < normalized.length; i += 1) {
    const next = normalized[i];
    const threshold = next.amount_from;
    const delta = Math.max(0, threshold - normalizedAmount);
    result.push({
      amount: threshold,
      delta,
      delivery_cost: next.delivery_cost,
      economy: Math.max(0, current.delivery_cost - next.delivery_cost),
    });
  }
  return result;
};
