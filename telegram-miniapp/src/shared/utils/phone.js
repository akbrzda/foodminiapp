export function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone)
    .trim()
    .replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) {
    return digits;
  }
  if (digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.startsWith("7")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}
export function formatPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  const digits = normalized.replace(/[^\d]/g, "");
  if (digits.length !== 11 || !digits.startsWith("7")) {
    return normalized;
  }
  const parts = {
    code: digits.slice(1, 4),
    first: digits.slice(4, 7),
    second: digits.slice(7, 9),
    third: digits.slice(9, 11),
  };
  return `+7 (${parts.code})-${parts.first}-${parts.second}-${parts.third}`;
}
