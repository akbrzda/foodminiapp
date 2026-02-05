const normalizePhoneDigits = (value) => {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length > 11) {
    digits = digits.slice(-10);
    return `7${digits}`;
  }
  if (digits.startsWith("8") && digits.length >= 11) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.startsWith("7") && digits.length >= 11) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `7${digits}`;
  }
  return digits;
};

export function normalizePhone(value) {
  const digits = normalizePhoneDigits(value);
  if (digits.length !== 11 || !digits.startsWith("7")) return "";
  return `+${digits}`;
}

export function formatPhone(value) {
  const digits = normalizePhoneDigits(value);
  if (digits.length !== 11 || !digits.startsWith("7")) return value || "";
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

export function formatPhoneInput(value) {
  const raw = String(value || "");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = digits.slice(1);
  if (digits.startsWith("7")) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(0, 10);
  if (digits.length === 0) return "+7";
  if (digits.length <= 3) return `+7 (${digits}`;
  if (digits.length <= 6) return `+7 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 8) return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
}

export function normalizePhoneInput(value) {
  return formatPhoneInput(value);
}

export function isValidPhone(value) {
  const normalized = normalizePhone(value);
  return Boolean(normalized);
}
