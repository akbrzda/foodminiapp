export const normalizeTariffs = (tariffs = []) => {
  if (!Array.isArray(tariffs)) return [];
  return tariffs.map((tariff) => ({
    amount_from: tariff?.amount_from,
    amount_to: tariff?.amount_to === null || tariff?.amount_to === undefined || tariff?.amount_to === "" ? null : tariff?.amount_to,
    delivery_cost: tariff?.delivery_cost,
  }));
};

const isInt = (value) => Number.isInteger(value);

const toIntOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : null;
};

const toInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : null;
};

export const validateTariffs = (tariffsInput = []) => {
  const errors = [];
  const normalized = normalizeTariffs(tariffsInput).map((tariff) => ({
    amount_from: toInt(tariff.amount_from),
    amount_to: toIntOrNull(tariff.amount_to),
    delivery_cost: toInt(tariff.delivery_cost),
  }));

  if (!Array.isArray(normalized) || normalized.length === 0) {
    return { valid: false, errors: ["Тарифные ступени не заданы."], normalized: [] };
  }

  const sorted = [...normalized].sort((a, b) => (a.amount_from ?? 0) - (b.amount_from ?? 0));
  const uniqueCosts = new Set();

  sorted.forEach((tariff, index) => {
    const row = index + 1;
    if (!isInt(tariff.amount_from) || tariff.amount_from < 0) {
      errors.push(`Строка ${row}: поле "От" должно быть целым числом >= 0.`);
      return;
    }
    if (tariff.amount_to !== null) {
      if (!isInt(tariff.amount_to)) {
        errors.push(`Строка ${row}: поле "До" должно быть целым числом.`);
        return;
      }
      if (tariff.amount_to <= tariff.amount_from) {
        errors.push(`Строка ${row}: поле "До" должно быть больше поля "От".`);
      }
    }
    if (!isInt(tariff.delivery_cost) || tariff.delivery_cost < 0) {
      errors.push(`Строка ${row}: стоимость доставки должна быть целым числом >= 0.`);
    }
    if (isInt(tariff.delivery_cost)) {
      if (uniqueCosts.has(tariff.delivery_cost)) {
        errors.push(`Строка ${row}: стоимость доставки должна быть уникальной.`);
      }
      uniqueCosts.add(tariff.delivery_cost);
    }
    if (index > 0) {
      const prev = sorted[index - 1];
      if (prev.amount_to === null) {
        errors.push(`Строка ${row}: диапазон не может идти после ступени без верхней границы.`);
      } else if (isInt(prev.amount_to) && isInt(tariff.amount_from)) {
        const expectedFrom = prev.amount_to + 1;
        if (tariff.amount_from !== expectedFrom) {
          errors.push(`Строка ${row}: ожидается "От" = ${expectedFrom} для непрерывного диапазона.`);
        }
      }
    }
  });

  const first = sorted[0];
  if (first && first.amount_from !== 0) {
    errors.push("Первая ступень должна начинаться с 0 ₽.");
  }

  const last = sorted[sorted.length - 1];
  if (last && last.amount_to !== null) {
    errors.push("Последняя ступень должна быть без верхней границы (поле 'До' пустое).");
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: sorted,
  };
};

export const findTariffForAmount = (tariffs = [], amount = 0) => {
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  for (const tariff of tariffs) {
    if (!Number.isInteger(tariff.amount_from)) continue;
    const from = tariff.amount_from;
    const to = tariff.amount_to === null || tariff.amount_to === undefined ? null : tariff.amount_to;
    if (normalizedAmount < from) continue;
    if (to === null || normalizedAmount <= to) {
      return tariff;
    }
  }
  return null;
};

export const getNextThreshold = (tariffs = [], amount = 0) => {
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const currentIndex = tariffs.findIndex((tariff) => {
    if (!Number.isInteger(tariff.amount_from)) return false;
    const from = tariff.amount_from;
    const to = tariff.amount_to === null || tariff.amount_to === undefined ? null : tariff.amount_to;
    if (normalizedAmount < from) return false;
    return to === null || normalizedAmount <= to;
  });

  if (currentIndex < 0 || currentIndex >= tariffs.length - 1) return null;

  const current = tariffs[currentIndex];
  const next = tariffs[currentIndex + 1];
  if (!next || !Number.isInteger(next.amount_from)) return null;

  const economy = Math.max(0, (current?.delivery_cost ?? 0) - (next?.delivery_cost ?? 0));
  return {
    amount: next.amount_from,
    delivery_cost: next.delivery_cost ?? 0,
    economy,
  };
};
