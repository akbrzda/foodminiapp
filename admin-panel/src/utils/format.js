export function formatCurrency(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(number);
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatPhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return phone;
  const trimmed = digits.slice(-10);
  return `+7 (${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6, 8)}-${trimmed.slice(8)}`;
}

export function normalizeImageUrl(url) {
  if (!url) return "";
  if (/^data:/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (!base) return url.startsWith("/") ? url : `/${url}`;
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}
