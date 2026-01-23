export function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone)
    .trim()
    .replace(/[^\d+]/g, "");
  if (!digits) return null;
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
