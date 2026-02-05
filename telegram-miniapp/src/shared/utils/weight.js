import { formatPrice } from "@/shared/utils/format";

export const getUnitLabel = (unit) => {
  const units = {
    g: "г",
    kg: "кг",
    ml: "мл",
    l: "л",
    pcs: "шт",
  };
  return units[unit] || "";
};

export const formatWeightValue = (value, unit) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0 || !unit) {
    return "";
  }
  const unitLabel = getUnitLabel(unit);
  if (!unitLabel) return "";
  return `${formatPrice(parsedValue)} ${unitLabel}`;
};

export const formatWeight = (value) => {
  if (!value) return "";
  return String(value);
};

export const formatModifierWeight = (value, unit) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return "";
  }
  const normalizedUnit = unit || "g";
  const unitLabel = getUnitLabel(normalizedUnit);
  if (unitLabel) {
    return `${formatPrice(parsedValue)} ${unitLabel}`;
  }
  if (unit) {
    return `${formatPrice(parsedValue)} ${unit}`;
  }
  return `${formatPrice(parsedValue)} г`;
};
