export function formatPrice(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "0";
  }

  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }

  return numberValue
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}
